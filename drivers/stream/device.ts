'use strict';

import { BaseEcoFlowDevice, QuotaSampleContext } from '../../lib/BaseEcoFlowDevice';
import { mapStreamQuota } from '../../lib/streamMapping';
import {
  integrateTimedSignedPower, followResettableCounter, batteryEnergyMode,
  EnergyAccountingDiagnostic, MAX_GAP_MS,
} from '../../lib/energyIntegration';
import { toFiniteNumber } from '../../lib/quota';
import { OperatingMode } from '../../lib/streamProtocol';
import {
  executeStreamControl, readStreamControlState, StreamControlIntent, StreamControlFailure,
} from '../../lib/streamControls';
import { currentPriceIsFresh } from '../../lib/automationSafety';
import { aboveBelow } from '../../lib/thresholds';
import { fetchDailyEnergy, DailyEnergy } from '../../lib/streamHistory';
import { fetchSolarRadiation, toForecast } from '../../lib/solarForecast';
import { powerDirection, PowerDirection, startedDirection } from '../../lib/flowStates';
import { EnergyCheckpoint } from '../../lib/EnergyCheckpoint';
import { DeveloperApiQuarantineError } from '../../lib/developerApiCompatibility';
import { StreamTopologyEvidence } from '../../lib/streamTopology';

const HISTORY_INTERVAL_MS = 30 * 60 * 1000;
const SOLAR_FORECAST_INTERVAL_MS = 3 * 60 * 60 * 1000;
type ControlWaitResolver = () => void;

module.exports = class StreamDevice extends BaseEcoFlowDevice {
  private mainSn = '';
  private controlStopped = false;
  private controlGeneration = 0;
  private controlWarning = false;
  private controlWaits = new Map<NodeJS.Timeout, ControlWaitResolver>();
  private priceUpdatedAt = 0;

  /**
   * Daily-history capabilities and their titles. These are NOT declared on the
   * driver: they only populate when EcoFlow's history feed returns data, so they
   * are added on demand (and stale/blank ones are removed) to avoid empty tiles
   * when the history feed is unavailable for a model.
   */
  private static readonly HISTORY_TITLES: Record<string, string> = {
    energy_solar_today: 'Solar today',
    energy_consumption_today: 'Consumption today (est.)',
    energy_grid_import_today: 'Grid import today',
    energy_grid_export_today: 'Grid export today',
    energy_savings_today: 'Savings today',
    co2_today: 'CO₂ avoided today',
    energy_independence: 'Energy independence',
  };

  private historyTimer: NodeJS.Timeout | null = null;
  private solarForecastTimer: NodeJS.Timeout | null = null;
  private historyDay = '';
  private prevSoc: number | undefined;
  private prevPv: number | undefined;
  private prevGrid: number | undefined;
  private prevMode: string | undefined;
  private prevBatteryDirection: PowerDirection | undefined;
  private prevGridDirection: PowerDirection | undefined;
  private prevOnline: boolean | undefined;
  private activeFaults = new Map<string, number>();
  // Locally-integrated cumulative battery energy (Wh). Prefer the device's own
  // counters (accuChgEnergy/accuDsgEnergy via MQTT, reset-protected); fall back
  // to integrating battery power when only the sparse REST snapshot is available.
  private chargedWh = 0;
  private dischargedWh = 0;
  private chargedRawWh: number | undefined;
  private dischargedRawWh: number | undefined;
  private lastEnergyTs = 0;
  // Once the device's own energy counters (accu*Energy, via MQTT) are seen they
  // are authoritative; the REST power-integration fallback is then disabled so the
  // same energy is never counted twice into the monotonic Homey meters.
  private countersAvailable = false;
  private energyCheckpoint!: EnergyCheckpoint;
  private energySamples = 0;
  private skippedEnergySamples = 0;
  private ignoredEnergyGaps = 0;
  private counterResets = 0;

  protected getReadSn(): string {
    return this.getData().sn;
  }

  /** Address cached at init, not a live membership lookup or cross-generation identity. */
  getTopologyEvidence(): StreamTopologyEvidence {
    return {
      source: 'bk_main_address',
      addressSn: this.mainSn,
      peers: [],
      maxReportedRecordCount: 0,
      lastPeerRecordAt: null,
      systemSocObserved: false,
      truncated: false,
    };
  }

  protected handlesStatus(): boolean {
    return true;
  }

  protected async onReady(): Promise<void> {
    this.controlGeneration += 1;
    this.controlStopped = false;
    this.priceUpdatedAt = 0;
    this.mainSn = (this.getStoreValue('mainSn') as string) || this.getData().sn;
    const storedWh = (key: string) => {
      const value = toFiniteNumber(this.getStoreValue(key));
      return value !== undefined && value >= 0 ? value : undefined;
    };
    this.chargedWh = storedWh('chargedWh') ?? 0;
    this.dischargedWh = storedWh('dischargedWh') ?? 0;
    this.chargedRawWh = storedWh('chargedRawWh');
    this.dischargedRawWh = storedWh('dischargedRawWh');
    this.countersAvailable = this.getStoreValue('countersAvailable') === true
      || this.chargedRawWh !== undefined || this.dischargedRawWh !== undefined;
    this.energyCheckpoint = new EnergyCheckpoint(this.homey, () => this.persistBatteryStore());

    this.registerControlListeners();
    await this.setCapabilityValue('meter_power.charged', this.chargedWh / 1000).catch(() => {});
    await this.setCapabilityValue('meter_power.discharged', this.dischargedWh / 1000).catch(() => {});

    await this.cleanupBlankHistoryCapabilities();

    if (this.getSetting('enable_history') !== false) this.startHistory();
    if (this.getSetting('solar_forecast') !== false) this.startSolarForecast();
  }

  /**
   * Remove any daily-history capability that exists but never received a value
   * (e.g. left over from an older version, or a model whose history feed the API
   * rejects). A working feed re-adds them via applyDailyEnergy.
   */
  private async cleanupBlankHistoryCapabilities(): Promise<void> {
    for (const cap of Object.keys(StreamDevice.HISTORY_TITLES)) {
      if (this.hasCapability(cap) && this.getCapabilityValue(cap) === null) {
        await this.removeCapability(cap).catch((e) => this.error(`remove ${cap}`, e));
      }
    }
  }

  /** Ensure a history capability exists (with its title) before setting it. */
  private async ensureHistoryCapability(cap: string): Promise<void> {
    if (this.hasCapability(cap)) return;
    await this.addCapability(cap).catch((e) => this.error(`add ${cap}`, e));
    const title = StreamDevice.HISTORY_TITLES[cap];
    if (title) await this.setCapabilityOptions(cap, { title: { en: title } }).catch(() => {});
  }

  /** Fetch a solar-yield forecast from Open-Meteo for Homey's location. */
  private startSolarForecast(): void {
    if (this.solarForecastTimer) this.homey.clearInterval(this.solarForecastTimer);
    this.refreshSolarForecast().catch((e) => this.error('solar forecast', e));
    this.solarForecastTimer = this.homey.setInterval(() => {
      this.refreshSolarForecast().catch((e) => this.error('solar forecast', e));
    }, SOLAR_FORECAST_INTERVAL_MS);
  }

  private async refreshSolarForecast(): Promise<void> {
    let lat: number;
    let lon: number;
    try {
      lat = this.homey.geolocation.getLatitude();
      lon = this.homey.geolocation.getLongitude();
    } catch {
      return; // geolocation unavailable
    }
    if (typeof lat !== 'number' || typeof lon !== 'number') return;
    const radiation = await fetchSolarRadiation(lat, lon);
    const factor = Number(this.getSetting('solar_factor')) || 0.67;
    const fc = toForecast(radiation, factor);
    await this.applyForecastCapability('solar_forecast_today', fc.todayKwh);
    await this.applyForecastCapability('solar_forecast_tomorrow', fc.tomorrowKwh);
  }

  /** Add the forecast capability on demand (only when a value exists) and set it. */
  private async applyForecastCapability(cap: string, value: number | null): Promise<void> {
    if (value == null) return;
    if (!this.hasCapability(cap)) await this.addCapability(cap).catch((e) => this.error(`add ${cap}`, e));
    if (this.hasCapability(cap)) await this.setCapabilityValue(cap, value).catch(() => {});
  }

  private stopSolarForecast(remove: boolean): void {
    if (this.solarForecastTimer) {
      this.homey.clearInterval(this.solarForecastTimer);
      this.solarForecastTimer = null;
    }
    if (remove) {
      for (const cap of ['solar_forecast_today', 'solar_forecast_tomorrow']) {
        if (this.hasCapability(cap)) this.removeCapability(cap).catch(() => {});
      }
    }
  }

  private startHistory(): void {
    if (this.historyTimer) this.homey.clearInterval(this.historyTimer);
    this.refreshHistory().catch((e) => this.error('history', e));
    this.historyTimer = this.homey.setInterval(() => {
      this.refreshHistory().catch((e) => this.error('history', e));
    }, HISTORY_INTERVAL_MS);
  }

  private async refreshHistory(): Promise<void> {
    // On a calendar-day rollover, zero the existing daily tiles so a broken/empty
    // history feed can't keep showing yesterday's totals as "today"; fresh data
    // then overwrites them as it arrives.
    const tz = this.homey.clock.getTimezone();
    const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
    if (this.historyDay && this.historyDay !== today) {
      for (const cap of Object.keys(StreamDevice.HISTORY_TITLES)) {
        if (this.hasCapability(cap)) await this.setCapabilityValue(cap, 0).catch(() => {});
      }
    }
    this.historyDay = today;
    const prefix = (this.getSetting('history_prefix') as string) || 'BK621';
    const daily = await fetchDailyEnergy(this.client, this.mainSn, prefix, tz);
    await this.applyDailyEnergy(daily);
  }

  private async applyDailyEnergy(d: DailyEnergy): Promise<void> {
    const kwh = (wh?: number) => (typeof wh === 'number' ? wh / 1000 : undefined);
    const map: Record<string, number | undefined> = {
      energy_solar_today: kwh(d.solarWh),
      energy_consumption_today: kwh(d.consumptionWh),
      energy_grid_import_today: kwh(d.gridImportWh),
      energy_grid_export_today: kwh(d.gridExportWh),
      energy_savings_today: d.savings,
      co2_today: typeof d.co2g === 'number' ? d.co2g / 1000 : undefined,
      energy_independence: d.independencePct,
    };
    for (const [cap, value] of Object.entries(map)) {
      if (value === undefined) continue;
      await this.ensureHistoryCapability(cap);
      if (!this.hasCapability(cap)) continue;
      await this.setCapabilityValue(cap, value).catch((e) => this.error(`setCapabilityValue ${cap}`, e));
    }
  }

  private registerControlListeners(): void {
    this.registerCapabilityListener('feed_in_control', async (v: boolean) => this.flowSetFeedIn(v));
    this.registerCapabilityListener('backup_reserve_soc', async (v: number) => this.applyBackupReserve(v));
    this.registerCapabilityListener('operating_mode', async (v: OperatingMode) => this.flowSetOperatingMode(v));
    this.registerCapabilityListener('charge_limit', async (v: number) => this.flowSetChargeLimit(v));
    this.registerCapabilityListener('discharge_limit', async (v: number) => this.flowSetDischargeLimit(v));
  }

  private waitForControlReadback(): Promise<void> {
    return new Promise((resolve) => {
      const timer = this.homey.setTimeout(() => {
        this.controlWaits.delete(timer);
        resolve();
      }, 1500);
      this.controlWaits.set(timer, resolve);
    });
  }

  /** Fresh main-target state and readback for every command; no optimistic tiles. */
  private async runControl(intent: StreamControlIntent): Promise<void> {
    const target = this.mainSn || this.getData().sn;
    const generation = this.controlGeneration;
    const active = () => !this.controlStopped && !this.isShuttingDown()
      && generation === this.controlGeneration
      && target === (this.mainSn || this.getData().sn);
    try {
      await executeStreamControl(target, intent, {
        active,
        read: async () => readStreamControlState(await this.readControlQuota(target)),
        write: (payload) => this.writeQuota(payload),
        wait: () => this.waitForControlReadback(),
        observed: async (state) => {
          for (const [key, value] of Object.entries(state)) {
            if (!active()) return;
            if (this.hasCapability(key)) await this.setCapabilityValue(key, value);
          }
        },
      });
      if (active() && this.controlWarning) {
        await this.setWarning(null).catch(() => {});
        this.controlWarning = false;
      }
    } catch (error) {
      if (error instanceof DeveloperApiQuarantineError) throw error;
      if (active() && error instanceof StreamControlFailure) {
        const previous = Object.entries(error.before).map(([key, value]) => `${key}=${value}`).join(', ');
        await this.setWarning(error.message + (previous ? ` Previous reported settings: ${previous}.` : '')).catch(() => {});
        this.controlWarning = true;
      }
      throw error;
    }
  }

  protected async applyBackupReserve(targetSoc: number): Promise<void> {
    await this.runControl({ kind: 'reserve', value: targetSoc });
  }

  /** Availability + online/offline flow triggers (overrides the base). */
  protected async setOnlineState(online: boolean, message?: string): Promise<void> {
    if (online) {
      if (!this.getAvailable()) await this.setAvailable().catch(() => {});
    } else {
      await this.setUnavailable(message || 'Device offline').catch(() => {});
    }
    if (this.prevOnline !== undefined && online !== this.prevOnline) {
      const card = online ? 'device_came_online' : 'device_went_offline';
      this.homey.flow.getDeviceTriggerCard(card).trigger(this).catch(() => {});
    }
    this.prevOnline = online;
  }

  async applyQuota(quota: Record<string, any>, context?: QuotaSampleContext): Promise<void> {
    const receivedAt = context?.receivedAt ?? Date.now();
    const values = mapStreamQuota(quota);
    // Charged/discharged energy is maintained by updateBatteryEnergy, so drop any
    // values mapped from absent device counters to avoid conflicts.
    delete values['meter_power.charged'];
    delete values['meter_power.discharged'];
    for (const [cap, value] of Object.entries(values)) {
      if (!this.hasCapability(cap)) continue;
      if (this.getCapabilityValue(cap) === value) continue;
      await this.setCapabilityValue(cap, value).catch((e) => this.error(`setCapabilityValue ${cap}`, e));
    }
    await this.updateBatteryEnergy(quota, values['measure_power'], receivedAt);
    this.fireTriggers(values);
    this.checkFaults(quota);
  }

  private async updateBatteryEnergy(
    quota: Record<string, any>,
    batteryPowerW: number | boolean | string | undefined,
    receivedAt: number,
  ): Promise<void> {
    const accuChg = toFiniteNumber(quota.accuChgEnergy);
    const accuDsg = toFiniteNumber(quota.accuDsgEnergy);
    const hasChg = accuChg !== undefined && accuChg >= 0;
    const hasDsg = accuDsg !== undefined && accuDsg >= 0;
    this.energySamples += 1;
    const mode = batteryEnergyMode(hasChg || hasDsg, this.countersAvailable);
    // Counters are authoritative once seen: 'skip' means the source is counters but
    // this sample carries none, so we must not integrate power (double-count).
    if (mode === 'skip') {
      this.skippedEnergySamples += 1;
      return;
    }

    // Capture the interval and re-anchor the timestamp SYNCHRONOUSLY (before any
    // await) so a concurrent applyQuota (poll + MQTT) can't double-count.
    if (mode === 'counter') {
      this.lastEnergyTs = receivedAt;
      this.countersAvailable = true;
      let changed = false;
      if (hasChg) {
        if (this.chargedRawWh !== undefined && accuChg < this.chargedRawWh) this.counterResets += 1;
        const r = followResettableCounter(this.chargedWh, this.chargedRawWh, accuChg as number);
        if (r.totalWh !== this.chargedWh) changed = true;
        this.chargedWh = r.totalWh;
        this.chargedRawWh = r.lastRawWh;
      }
      if (hasDsg) {
        if (this.dischargedRawWh !== undefined && accuDsg < this.dischargedRawWh) this.counterResets += 1;
        const r = followResettableCounter(this.dischargedWh, this.dischargedRawWh, accuDsg as number);
        if (r.totalWh !== this.dischargedWh) changed = true;
        this.dischargedWh = r.totalWh;
        this.dischargedRawWh = r.lastRawWh;
      }
      // Persist the first raw baselines and authoritative-source latch even
      // when the first sample adds no energy, or a restart can re-enable fallback.
      this.energyCheckpoint.mark();
      if (changed) await this.updateBatteryEnergyCapabilities();
      return;
    }

    // mode === 'integrate' — counters have never been seen; integrate power.
    if (typeof batteryPowerW !== 'number' || !Number.isFinite(batteryPowerW)) return;
    if (this.lastEnergyTs > 0 && receivedAt - this.lastEnergyTs > MAX_GAP_MS) this.ignoredEnergyGaps += 1;
    const next = integrateTimedSignedPower(
      { posWh: this.chargedWh, negWh: this.dischargedWh, lastSampleAt: this.lastEnergyTs },
      batteryPowerW,
      receivedAt,
    );
    this.lastEnergyTs = next.lastSampleAt;
    if (next.posWh !== this.chargedWh || next.negWh !== this.dischargedWh) {
      this.chargedWh = next.posWh;
      this.dischargedWh = next.negWh;
      await this.updateBatteryEnergyCapabilities();
    }
  }

  private async updateBatteryEnergyCapabilities(): Promise<void> {
    this.energyCheckpoint.mark();
    await this.setCapabilityValue('meter_power.charged', this.chargedWh / 1000).catch(() => {});
    await this.setCapabilityValue('meter_power.discharged', this.dischargedWh / 1000).catch(() => {});
  }

  private async persistBatteryStore(): Promise<void> {
    // Snapshot before awaiting so totals and raw baselines describe one sample.
    const snapshot = {
      chargedWh: this.chargedWh,
      dischargedWh: this.dischargedWh,
      chargedRawWh: this.chargedRawWh,
      dischargedRawWh: this.dischargedRawWh,
      countersAvailable: this.countersAvailable,
    };
    await this.setStoreValue('chargedWh', snapshot.chargedWh);
    await this.setStoreValue('dischargedWh', snapshot.dischargedWh);
    if (snapshot.chargedRawWh !== undefined) await this.setStoreValue('chargedRawWh', snapshot.chargedRawWh);
    if (snapshot.dischargedRawWh !== undefined) await this.setStoreValue('dischargedRawWh', snapshot.dischargedRawWh);
    if (snapshot.countersAvailable) await this.setStoreValue('countersAvailable', true);
  }

  getEnergyDiagnostics(): EnergyAccountingDiagnostic {
    let source: EnergyAccountingDiagnostic['source'] = this.lastEnergyTs > 0 ? 'integrated_power' : 'waiting';
    if (this.countersAvailable) source = 'device_counters';
    return {
      source,
      samples: this.energySamples,
      skippedSamples: this.skippedEnergySamples,
      ignoredGaps: this.ignoredEnergyGaps,
      counterResets: this.counterResets,
      chargedCounterSeen: this.chargedRawWh !== undefined,
      dischargedCounterSeen: this.dischargedRawWh !== undefined,
      lastSampleAgeSec: this.lastEnergyTs > 0 ? Math.max(0, Math.round((Date.now() - this.lastEnergyTs) / 1000)) : null,
      chargedKWh: this.chargedWh / 1000,
      dischargedKWh: this.dischargedWh / 1000,
      checkpoint: this.energyCheckpoint?.diagnostics(),
    };
  }

  private fireTriggers(values: Record<string, number | boolean | string>): void {
    const { flow } = this.homey;
    const pv = values['measure_power.pv'];
    if (typeof pv === 'number' && pv !== this.prevPv) {
      flow.getDeviceTriggerCard('solar_power_changed').trigger(this, { power: pv }).catch(() => {});
      this.prevPv = pv;
    }
    const grid = values['measure_power.grid'];
    if (typeof grid === 'number' && grid !== this.prevGrid) {
      flow.getDeviceTriggerCard('grid_power_changed').trigger(this, { power: grid }).catch(() => {});
      const prevGrid = this.prevGrid ?? grid;
      // Threshold-crossing triggers (import positive; export magnitude = -grid).
      flow.getDeviceTriggerCard('grid_import_above')
        .trigger(this, { power: Math.max(0, Math.round(grid)) }, { power: grid, prevPower: prevGrid })
        .catch(() => {});
      flow.getDeviceTriggerCard('grid_export_above')
        .trigger(this, { power: Math.max(0, Math.round(-grid)) }, { power: -grid, prevPower: -prevGrid })
        .catch(() => {});
      const direction = powerDirection(grid);
      const started = startedDirection(this.prevGridDirection, direction);
      if (started !== null) {
        const card = started < 0 ? 'grid_export_started' : 'grid_import_started';
        flow.getDeviceTriggerCard(card).trigger(this, { power: grid }).catch(() => {});
      }
      this.prevGridDirection = direction;
      this.prevGrid = grid;
    }
    const battPower = values['measure_power'];
    if (typeof battPower === 'number') {
      const direction = powerDirection(battPower);
      const started = startedDirection(this.prevBatteryDirection, direction);
      if (started !== null) {
        const card = started > 0 ? 'charging_started' : 'discharging_started';
        flow.getDeviceTriggerCard(card).trigger(this, { power: battPower }).catch(() => {});
      }
      this.prevBatteryDirection = direction;
    }
    const mode = values['operating_mode'];
    if (typeof mode === 'string' && mode !== this.prevMode) {
      if (this.prevMode !== undefined) {
        flow.getDeviceTriggerCard('operating_mode_changed').trigger(this, { mode }).catch(() => {});
      }
      this.prevMode = mode;
    }
    const soc = values['measure_battery'];
    if (typeof soc === 'number') {
      if (this.prevSoc !== undefined && soc !== this.prevSoc) {
        flow
          .getDeviceTriggerCard('battery_level_crossed')
          .trigger(this, { battery: soc }, { soc, prevSoc: this.prevSoc })
          .catch(() => {});
      }
      this.prevSoc = soc;
    }
  }

  private checkFaults(quota: Record<string, any>): void {
    const codes: Array<[string, string]> = [
      ['invErrCode', 'inverter'],
      ['batErrCode', 'battery'],
      ['llcErrCode', 'llc'],
      ['pv1ErrCode', 'pv1'],
      ['pv2ErrCode', 'pv2'],
    ];
    const current = new Map(this.activeFaults);
    let sawFaultField = false;
    for (const [key, source] of codes) {
      if (!(key in quota)) continue;
      sawFaultField = true;
      const v = Number(quota[key]);
      if (Number.isFinite(v) && v !== 0) {
        current.set(source, v);
      } else {
        current.delete(source);
      }
    }
    if (!sawFaultField) return;
    const isFaulted = current.size > 0;
    if (this.hasCapability('alarm_generic') && this.getCapabilityValue('alarm_generic') !== isFaulted) {
      this.setCapabilityValue('alarm_generic', isFaulted).catch(() => {});
    }
    for (const [source, code] of current) {
      if (this.activeFaults.get(source) !== code) {
        this.homey.flow.getDeviceTriggerCard('fault_raised').trigger(this, { source, code }).catch(() => {});
      }
    }
    if (!isFaulted && this.activeFaults.size > 0) {
      this.homey.flow.getDeviceTriggerCard('fault_cleared').trigger(this).catch(() => {});
    }
    this.activeFaults = current;
  }

  /** Condition + action helpers used by flow cards. */
  isCharging(): boolean {
    return (this.getCapabilityValue('measure_power') as number) > 5;
  }

  isExporting(): boolean {
    return (this.getCapabilityValue('measure_power.grid') as number) < -5;
  }

  /** True when the battery is charging from surplus solar (PV exceeds home load). */
  isChargingFromSolar(): boolean {
    const batt = this.getCapabilityValue('measure_power');
    const pv = this.getCapabilityValue('measure_power.pv');
    const load = this.getCapabilityValue('measure_power.load');
    if (typeof batt !== 'number' || typeof pv !== 'number') return false;
    const surplus = pv - (typeof load === 'number' ? load : 0);
    return batt > 5 && surplus > 5;
  }

  /**
   * Flow action: set the current electricity price (provider-agnostic — fed from
   * any tariff app such as Octopus, Tibber or aWATTar). Exposed as a capability so
   * the widget and price conditions can use it. The display unit follows the
   * device's `price_unit` setting.
   */
  async flowSetElectricityPrice(price: number): Promise<void> {
    if (this.controlStopped || this.isShuttingDown()) throw new Error('Device is shutting down.');
    if (typeof price !== 'number' || !Number.isFinite(price)) throw new Error('Electricity price must be a finite number.');
    const generation = this.controlGeneration;
    const unit = (this.getSetting('price_unit') as string) || 'p/kWh';
    const cap = 'tariff_price_now';
    if (!this.hasCapability(cap)) await this.addCapability(cap).catch((e) => this.error(`add ${cap}`, e));
    await this.setCapabilityOptions(cap, { units: { en: unit } }).catch(() => {});
    await this.setCapabilityValue(cap, price);
    if (this.controlStopped || this.isShuttingDown() || generation !== this.controlGeneration
      || unit !== ((this.getSetting('price_unit') as string) || 'p/kWh')) {
      throw new Error('Electricity price update interrupted; send a fresh price for the current session and unit.');
    }
    this.priceUpdatedAt = Date.now();
  }

  priceIs(direction: 'above' | 'below', threshold: number): boolean {
    const price = this.getCapabilityValue('tariff_price_now');
    if (!currentPriceIsFresh(price, this.priceUpdatedAt)) throw new Error('Electricity price missing or older than 90 minutes; update it before running this Flow.');
    if ((direction !== 'above' && direction !== 'below') || typeof threshold !== 'number' || !Number.isFinite(threshold)) {
      throw new Error('Electricity price comparison needs a valid direction and finite threshold.');
    }
    return aboveBelow(price, direction, threshold);
  }

  /** Condition: current electricity price is negative (paid to consume). */
  priceIsNegative(): boolean {
    const p = this.getCapabilityValue('tariff_price_now');
    if (!currentPriceIsFresh(p, this.priceUpdatedAt)) throw new Error('Electricity price missing or older than 90 minutes; update it before running this Flow.');
    return p < 0;
  }

  async flowRefresh(): Promise<void> {
    await this.poll();
    if (this.getSetting('enable_history') !== false) await this.refreshHistory().catch(() => {});
  }

  async flowSetOperatingMode(mode: OperatingMode): Promise<void> {
    await this.runControl({ kind: 'mode', value: mode });
  }

  async flowSetBackupReserve(level: number): Promise<void> {
    await this.applyBackupReserve(level);
  }

  async flowSetFeedIn(on: boolean): Promise<void> {
    await this.runControl({ kind: 'feed', value: on });
  }

  async flowSetChargeLimit(level: number): Promise<void> {
    await this.runControl({ kind: 'charge', value: level });
  }

  async flowSetDischargeLimit(level: number): Promise<void> {
    await this.runControl({ kind: 'discharge', value: level });
  }

  /**
   * Tariff helper — "prepare for cheap import": raise the backup-reserve target
   * and lift the charge limit to 100%. This is a policy, not a watt target or
   * proof of grid charging; EcoFlow mode/schedule/grid limits still apply.
   */
  async flowPrepareCheapImport(reserve: number): Promise<void> {
    await this.runControl({ kind: 'cheap_import', value: reserve });
  }

  /**
   * Tariff helper — "prepare for peak/export": drop the backup reserve so the
   * battery may discharge, and enable grid feed-in permission. This does not
   * guarantee physical export during a high-price window.
   */
  async flowPreparePeakExport(reserve: number): Promise<void> {
    await this.runControl({ kind: 'peak_export', value: reserve });
  }

  /**
   * Tariff helper — "release battery for export now": drop the reserve (and, in
   * the correct 8524-safe order, the discharge limit) to the minimum and enable
   * feed-in. This permits export; it does not force an immediate physical flow.
   */
  async flowReleaseForExport(): Promise<void> {
    await this.runControl({ kind: 'peak_export', value: 3 });
  }

  /** Battery SoC condition helper. */
  batterySocIs(direction: 'above' | 'below', level: number): boolean {
    const soc = this.getCapabilityValue('measure_battery') as number;
    if (typeof soc !== 'number') return false;
    return direction === 'above' ? soc > level : soc < level;
  }

  protected async onSettingsChanged(newSettings: any, changedKeys: string[]): Promise<void> {
    // A cached numeric value in the old unit must not trigger a new-unit threshold.
    if (changedKeys.includes('price_unit')) this.priceUpdatedAt = 0;
    if (changedKeys.includes('enable_history')) {
      if (this.historyTimer) {
        this.homey.clearInterval(this.historyTimer);
        this.historyTimer = null;
      }
      if (newSettings.enable_history !== false) this.startHistory();
    }
    if (changedKeys.includes('solar_forecast') || changedKeys.includes('solar_factor')) {
      if (newSettings.solar_forecast !== false) this.startSolarForecast();
      else this.stopSolarForecast(true);
    }
  }

  protected async onTeardown(): Promise<void> {
    this.controlStopped = true;
    this.controlGeneration += 1;
    for (const [timer, resolve] of this.controlWaits) {
      this.homey.clearTimeout(timer);
      resolve();
    }
    this.controlWaits.clear();
    if (this.historyTimer) this.homey.clearInterval(this.historyTimer);
    if (this.solarForecastTimer) this.homey.clearInterval(this.solarForecastTimer);
    await this.energyCheckpoint?.flush();
  }
};
