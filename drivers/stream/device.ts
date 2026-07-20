'use strict';

import { BaseEcoFlowDevice } from '../../lib/BaseEcoFlowDevice';
import { mapStreamQuota } from '../../lib/streamMapping';
import { integrateSignedPower, followResettableCounter } from '../../lib/energyIntegration';
import { toFiniteNumber } from '../../lib/quota';
import { StreamCmd, OperatingMode, backupReserveSequence } from '../../lib/streamProtocol';
import { fetchDailyEnergy, DailyEnergy } from '../../lib/streamHistory';
import { powerDirection, PowerDirection, startedDirection } from '../../lib/flowStates';
import { EnergyCheckpoint } from '../../lib/EnergyCheckpoint';

const HISTORY_INTERVAL_MS = 30 * 60 * 1000;

module.exports = class StreamDevice extends BaseEcoFlowDevice {
  private mainSn = '';

  /**
   * Daily-history capabilities and their titles. These are NOT declared on the
   * driver: they only populate when EcoFlow's history feed returns data, so they
   * are added on demand (and stale/blank ones are removed) to avoid empty tiles
   * when the history feed is unavailable for a model.
   */
  private static readonly HISTORY_TITLES: Record<string, string> = {
    energy_solar_today: 'Solar today',
    energy_consumption_today: 'Consumption today',
    energy_grid_import_today: 'Grid import today',
    energy_grid_export_today: 'Grid export today',
    energy_savings_today: 'Savings today',
    co2_today: 'CO₂ avoided today',
    energy_independence: 'Energy independence',
  };

  private historyTimer: NodeJS.Timeout | null = null;
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

  protected getReadSn(): string {
    return this.getData().sn;
  }

  protected handlesStatus(): boolean {
    return true;
  }

  protected async onReady(): Promise<void> {
    this.mainSn = (this.getStoreValue('mainSn') as string) || this.getData().sn;
    this.chargedWh = (this.getStoreValue('chargedWh') as number) || 0;
    this.dischargedWh = (this.getStoreValue('dischargedWh') as number) || 0;
    this.chargedRawWh = this.getStoreValue('chargedRawWh') as number | undefined;
    this.dischargedRawWh = this.getStoreValue('dischargedRawWh') as number | undefined;
    this.countersAvailable = this.getStoreValue('countersAvailable') === true
      || this.chargedRawWh !== undefined || this.dischargedRawWh !== undefined;
    this.energyCheckpoint = new EnergyCheckpoint(this.homey, () => this.persistBatteryStore());

    this.registerControlListeners();
    await this.setCapabilityValue('meter_power.charged', this.chargedWh / 1000).catch(() => {});
    await this.setCapabilityValue('meter_power.discharged', this.dischargedWh / 1000).catch(() => {});

    await this.cleanupBlankHistoryCapabilities();

    if (this.getSetting('enable_history') !== false) this.startHistory();
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

  private startHistory(): void {
    if (this.historyTimer) this.homey.clearInterval(this.historyTimer);
    this.refreshHistory().catch((e) => this.error('history', e));
    this.historyTimer = this.homey.setInterval(() => {
      this.refreshHistory().catch((e) => this.error('history', e));
    }, HISTORY_INTERVAL_MS);
  }

  private async refreshHistory(): Promise<void> {
    const prefix = (this.getSetting('history_prefix') as string) || 'BK621';
    const daily = await fetchDailyEnergy(this.client, this.mainSn, prefix, this.homey.clock.getTimezone());
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
    this.registerCapabilityListener('feed_in_control', async (v: boolean) => this.send(StreamCmd.feedIn(this.mainSn, v)));
    this.registerCapabilityListener('backup_reserve_soc', async (v: number) => this.applyBackupReserve(v));
    this.registerCapabilityListener('operating_mode', async (v: OperatingMode) => this.send(StreamCmd.operatingMode(this.mainSn, v)));
    this.registerCapabilityListener('charge_limit', async (v: number) => this.send(StreamCmd.chargeLimit(this.mainSn, v)));
    this.registerCapabilityListener('discharge_limit', async (v: number) => this.send(StreamCmd.dischargeLimit(this.mainSn, v)));
  }

  /** Send a STREAM set command and refresh state shortly after. */
  private async send(payload: Record<string, any>): Promise<void> {
    await this.client.setQuota(payload);
    this.homey.setTimeout(() => this.poll().catch((e) => this.error('post-set poll', e)), 1500);
  }

  /**
   * Apply a backup-reserve target safely. EcoFlow rejects a reserve that does not
   * exceed the discharge limit by ~3 (error 8524) — a silent no-op via the flow
   * layer — so the discharge limit is lowered first when needed, then the reserve
   * is set and VERIFIED against the device (surfacing an otherwise-swallowed
   * failure). Optional extra commands (e.g. feed-in) are appended to the sequence.
   */
  protected async applyBackupReserve(targetSoc: number, extra: Record<string, any>[] = []): Promise<void> {
    const currentLimit = toFiniteNumber(this.getCapabilityValue('discharge_limit'));
    const seq = backupReserveSequence(this.mainSn, targetSoc, currentLimit);
    await this.sendSequence('Set backup reserve', [...seq.commands, ...extra]);
    if (seq.newDischargeLimit !== undefined) {
      await this.setCapabilityValue('discharge_limit', seq.newDischargeLimit).catch(() => {});
    }
    await this.verifyReserve(seq.reserve);
  }

  /** Poll and confirm the device actually accepted the reserve; throw if not. */
  private async verifyReserve(target: number): Promise<void> {
    await new Promise<void>((resolve) => {
      this.homey.setTimeout(resolve, 1500);
    });
    await this.poll();
    const applied = toFiniteNumber(this.getCapabilityValue('backup_reserve_soc'));
    if (applied === undefined || Math.abs(applied - target) > 2) {
      throw new Error(
        `EcoFlow did not apply the backup reserve (requested ${target}%, device reports `
        + `${applied ?? 'unknown'}%). It must exceed the discharge limit by ~3%.`,
      );
    }
    await this.setCapabilityValue('backup_reserve_soc', target).catch(() => {});
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

  async applyQuota(quota: Record<string, any>): Promise<void> {
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
    await this.updateBatteryEnergy(quota, values['measure_power']);
    this.fireTriggers(values);
    this.checkFaults(quota);
  }

  private async updateBatteryEnergy(
    quota: Record<string, any>,
    batteryPowerW: number | boolean | string | undefined,
  ): Promise<void> {
    const accuChg = toFiniteNumber(quota.accuChgEnergy);
    const accuDsg = toFiniteNumber(quota.accuDsgEnergy);
    const hasChg = accuChg !== undefined;
    const hasDsg = accuDsg !== undefined;

    // Capture the interval and re-anchor the timestamp SYNCHRONOUSLY (before any
    // await) so a concurrent applyQuota (poll + MQTT) can't double-count.
    if (hasChg || hasDsg) {
      this.lastEnergyTs = Date.now();
      this.countersAvailable = true;
      let changed = false;
      if (hasChg) {
        const r = followResettableCounter(this.chargedWh, this.chargedRawWh, accuChg as number);
        if (r.totalWh !== this.chargedWh) changed = true;
        this.chargedWh = r.totalWh;
        this.chargedRawWh = r.lastRawWh;
      }
      if (hasDsg) {
        const r = followResettableCounter(this.dischargedWh, this.dischargedRawWh, accuDsg as number);
        if (r.totalWh !== this.dischargedWh) changed = true;
        this.dischargedWh = r.totalWh;
        this.dischargedRawWh = r.lastRawWh;
      }
      if (changed) await this.updateBatteryEnergyCapabilities();
      return;
    }

    if (typeof batteryPowerW !== 'number') return;
    // Device counters are authoritative once seen; never also integrate power or
    // the same energy would be double-counted into the monotonic Homey meters.
    if (this.countersAvailable) return;
    const now = Date.now();
    const dtMs = this.lastEnergyTs > 0 ? now - this.lastEnergyTs : 0;
    this.lastEnergyTs = now;
    if (dtMs <= 0) return;
    const next = integrateSignedPower(
      { posWh: this.chargedWh, negWh: this.dischargedWh },
      batteryPowerW,
      dtMs,
    );
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
    await this.setStoreValue('chargedWh', this.chargedWh).catch(() => {});
    await this.setStoreValue('dischargedWh', this.dischargedWh).catch(() => {});
    if (this.chargedRawWh !== undefined) await this.setStoreValue('chargedRawWh', this.chargedRawWh).catch(() => {});
    if (this.dischargedRawWh !== undefined) await this.setStoreValue('dischargedRawWh', this.dischargedRawWh).catch(() => {});
    if (this.countersAvailable) await this.setStoreValue('countersAvailable', true).catch(() => {});
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

  async flowRefresh(): Promise<void> {
    await this.poll();
    if (this.getSetting('enable_history') !== false) await this.refreshHistory().catch(() => {});
  }

  async flowSetOperatingMode(mode: OperatingMode): Promise<void> {
    await this.send(StreamCmd.operatingMode(this.mainSn, mode));
    await this.setCapabilityValue('operating_mode', mode).catch(() => {});
  }

  async flowSetBackupReserve(level: number): Promise<void> {
    await this.applyBackupReserve(level);
  }

  async flowSetFeedIn(on: boolean): Promise<void> {
    await this.send(StreamCmd.feedIn(this.mainSn, on));
    await this.setCapabilityValue('feed_in_control', on).catch(() => {});
  }

  async flowSetChargeLimit(level: number): Promise<void> {
    await this.send(StreamCmd.chargeLimit(this.mainSn, level));
    await this.setCapabilityValue('charge_limit', level).catch(() => {});
  }

  async flowSetDischargeLimit(level: number): Promise<void> {
    await this.send(StreamCmd.dischargeLimit(this.mainSn, level));
    await this.setCapabilityValue('discharge_limit', level).catch(() => {});
  }

  /**
   * Tariff helper — "prepare for cheap import": raise the backup-reserve target
   * (which pulls a charge from the grid) and lift the charge limit to 100% so the
   * battery fills during a cheap window (e.g. Octopus Agile low-price slots).
   */
  async flowPrepareCheapImport(reserve: number): Promise<void> {
    await this.send(StreamCmd.chargeLimit(this.mainSn, 100));
    await this.setCapabilityValue('charge_limit', 100).catch(() => {});
    await this.applyBackupReserve(reserve);
  }

  /**
   * Tariff helper — "prepare for peak/export": drop the backup reserve so the
   * battery is free to discharge, and enable grid feed-in so surplus is exported
   * during a high-price window.
   */
  async flowPreparePeakExport(reserve: number): Promise<void> {
    await this.applyBackupReserve(reserve, [StreamCmd.feedIn(this.mainSn, true)]);
    await this.setCapabilityValue('feed_in_control', true).catch(() => {});
  }

  /**
   * Tariff helper — "release battery for export now": drop the reserve (and, in
   * the correct 8524-safe order, the discharge limit) to the minimum and enable
   * feed-in so the battery exports immediately (e.g. at the start of a peak window).
   */
  async flowReleaseForExport(): Promise<void> {
    await this.applyBackupReserve(3, [StreamCmd.feedIn(this.mainSn, true)]);
    await this.setCapabilityValue('feed_in_control', true).catch(() => {});
  }

  private async sendSequence(label: string, payloads: Record<string, any>[]): Promise<void> {
    let completed = 0;
    try {
      for (const payload of payloads) {
        await this.client.setQuota(payload);
        completed += 1;
      }
      await this.setWarning(null).catch(() => {});
      this.homey.setTimeout(() => this.poll().catch((e) => this.error('post-set poll', e)), 1500);
    } catch (e: any) {
      const message = `${label} partly applied (${completed}/${payloads.length} commands). Check device state.`;
      await this.setWarning(message).catch(() => {});
      this.homey.setTimeout(() => this.poll().catch((pollError) => this.error('post-set poll', pollError)), 1500);
      throw new Error(`${message} ${e?.message || e}`);
    }
  }

  /** Battery SoC condition helper. */
  batterySocIs(direction: 'above' | 'below', level: number): boolean {
    const soc = this.getCapabilityValue('measure_battery') as number;
    if (typeof soc !== 'number') return false;
    return direction === 'above' ? soc > level : soc < level;
  }

  protected async onSettingsChanged(newSettings: any, changedKeys: string[]): Promise<void> {
    if (changedKeys.includes('enable_history')) {
      if (this.historyTimer) {
        this.homey.clearInterval(this.historyTimer);
        this.historyTimer = null;
      }
      if (newSettings.enable_history !== false) this.startHistory();
    }
  }

  protected async onTeardown(): Promise<void> {
    if (this.historyTimer) this.homey.clearInterval(this.historyTimer);
    await this.energyCheckpoint?.flush();
  }
};
