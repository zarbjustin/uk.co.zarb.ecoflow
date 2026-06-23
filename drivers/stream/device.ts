'use strict';

import Homey from 'homey';
import { EcoFlowClient } from '../../lib/EcoFlowClient';
import { mapStreamQuota } from '../../lib/streamMapping';
import { integrateSignedPower, followResettableCounter } from '../../lib/energyIntegration';
import { toFiniteNumber } from '../../lib/quota';
import { StreamCmd, OperatingMode } from '../../lib/streamProtocol';
import { fetchDailyEnergy, DailyEnergy } from '../../lib/streamHistory';

const DEFAULT_POLL_MS = 30000;
const HISTORY_INTERVAL_MS = 30 * 60 * 1000;

module.exports = class StreamDevice extends Homey.Device {
  private client!: EcoFlowClient;
  private pollTimer: NodeJS.Timeout | null = null;
  private historyTimer: NodeJS.Timeout | null = null;
  private sn = '';
  private mainSn = '';
  private quotaHandler?: (q: Record<string, any>) => void;
  private statusHandler?: (online: boolean) => void;
  private prevSoc: number | undefined;
  private prevPv: number | undefined;
  private prevGrid: number | undefined;
  private prevMode: string | undefined;
  private prevCharging: boolean | null | undefined;
  private prevExporting: boolean | undefined;
  private prevOnline: boolean | undefined;
  private mqttOffline = false;
  private faulted = false;
  // Locally-integrated cumulative battery energy (Wh). The STREAM REST API does
  // not expose accuChgEnergy/accuDsgEnergy, so Homey Energy's charged/discharged
  // meters are derived from the battery power and persisted monotonically. When
  // MQTT delivers the device counters they are preferred (reset-protected).
  private chargedWh = 0;
  private dischargedWh = 0;
  private chargedRawWh: number | undefined;
  private dischargedRawWh: number | undefined;
  private lastEnergyTs = 0;

  async onInit(): Promise<void> {
    this.sn = this.getData().sn;
    this.mainSn = (this.getStoreValue('mainSn') as string) || this.sn;
    this.chargedWh = (this.getStoreValue('chargedWh') as number) || 0;
    this.dischargedWh = (this.getStoreValue('dischargedWh') as number) || 0;
    this.chargedRawWh = this.getStoreValue('chargedRawWh') as number | undefined;
    this.dischargedRawWh = this.getStoreValue('dischargedRawWh') as number | undefined;

    const accessKey = this.homey.settings.get('accessKey') as string;
    const secretKey = this.homey.settings.get('secretKey') as string;
    const host = this.homey.settings.get('host') as string | undefined;
    if (!accessKey || !secretKey) {
      await this.setUnavailable('EcoFlow credentials missing — re-add the device.');
      return;
    }

    this.client = new EcoFlowClient({
      accessKey, secretKey, host, log: (...a) => this.log(...a),
    });
    this.registerControlListeners();
    // Seed the cumulative meters so Homey Energy has a starting value.
    await this.setCapabilityValue('meter_power.charged', this.chargedWh / 1000).catch(() => {});
    await this.setCapabilityValue('meter_power.discharged', this.dischargedWh / 1000).catch(() => {});

    await this.poll();
    const interval = (((this.getSetting('poll_interval') as number) || 30) * 1000) || DEFAULT_POLL_MS;
    this.pollTimer = this.homey.setInterval(() => {
      this.poll().catch((e) => this.error('poll failed', e));
    }, interval);

    // Realtime updates via shared MQTT (falls back silently to polling).
    try {
      this.quotaHandler = (q: Record<string, any>) => {
        this.applyQuota(q).catch((e) => this.error('mqtt apply', e));
      };
      this.statusHandler = (online: boolean) => {
        this.mqttOffline = !online;
        this.setOnline(online).catch(() => {});
      };
      await (this.homey.app as any).subscribeRealtime?.(this.sn, this.quotaHandler, this.statusHandler);
    } catch (e) {
      this.error('mqtt subscribe failed', e);
    }

    this.log(`STREAM device ${this.sn} (main ${this.mainSn}) initialised`);

    // Daily energy statistics (history API)
    if (this.getSetting('enable_history') !== false) {
      this.refreshHistory().catch((e) => this.error('history', e));
      this.historyTimer = this.homey.setInterval(() => {
        this.refreshHistory().catch((e) => this.error('history', e));
      }, HISTORY_INTERVAL_MS);
    }
  }

  private async refreshHistory(): Promise<void> {
    const prefix = (this.getSetting('history_prefix') as string) || 'BK621';
    const daily = await fetchDailyEnergy(this.client, this.mainSn, prefix);
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
      if (value === undefined || !this.hasCapability(cap)) continue;
      await this.setCapabilityValue(cap, value).catch((e) => this.error(`setCapabilityValue ${cap}`, e));
    }
  }

  private registerControlListeners(): void {
    this.registerCapabilityListener('feed_in_control', async (v: boolean) => this.send(StreamCmd.feedIn(this.mainSn, v)));
    this.registerCapabilityListener('backup_reserve_soc', async (v: number) => this.send(StreamCmd.backupReserve(this.mainSn, v)));
    this.registerCapabilityListener('operating_mode', async (v: OperatingMode) => this.send(StreamCmd.operatingMode(this.mainSn, v)));
    this.registerCapabilityListener('charge_limit', async (v: number) => this.send(StreamCmd.chargeLimit(this.mainSn, v)));
    this.registerCapabilityListener('discharge_limit', async (v: number) => this.send(StreamCmd.dischargeLimit(this.mainSn, v)));
  }

  /** Send a STREAM set command and refresh state shortly after. */
  private async send(payload: Record<string, any>): Promise<void> {
    await this.client.setQuota(payload);
    this.homey.setTimeout(() => this.poll().catch((e) => this.error('post-set poll', e)), 1500);
  }

  private async poll(): Promise<void> {
    try {
      const quota = await this.client.getQuotaAll(this.sn);
      await this.applyQuota(quota);
      // The REST API can return a stale 200 for an offline device; trust the
      // realtime MQTT offline status over a poll success to avoid flapping.
      if (!this.mqttOffline) await this.setOnline(true);
    } catch (e: any) {
      this.error('quota poll error', e?.message || e);
      await this.setOnline(false, e?.message || 'EcoFlow API error');
    }
  }

  /** Centralised availability + online/offline flow triggers. */
  private async setOnline(online: boolean, message?: string): Promise<void> {
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

  /** Apply a quota payload to capabilities (used by polling and MQTT). */
  async applyQuota(quota: Record<string, any>): Promise<void> {
    const values = mapStreamQuota(quota);
    // Charged/discharged energy is integrated locally (see integrateBatteryEnergy),
    // so drop any values mapped from absent device counters to avoid conflicts.
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

  /**
   * Update the monotonic charged/discharged meters. Prefers the device's own
   * cumulative counters (accuChgEnergy/accuDsgEnergy, delivered over MQTT) with
   * firmware-reset protection; falls back to integrating the battery power when
   * only the REST snapshot (which omits those counters) is available.
   */
  private async updateBatteryEnergy(
    quota: Record<string, any>,
    batteryPowerW: number | boolean | string | undefined,
  ): Promise<void> {
    const accuChg = toFiniteNumber(quota.accuChgEnergy);
    const accuDsg = toFiniteNumber(quota.accuDsgEnergy);
    const hasChg = accuChg !== undefined;
    const hasDsg = accuDsg !== undefined;

    // Capture the interval and re-anchor the timestamp SYNCHRONOUSLY (before any
    // await) so a concurrent applyQuota (poll + MQTT) can't integrate the same
    // interval twice. Re-anchoring also runs on the counter path so a later poll
    // doesn't double-count over a stale timestamp.
    const now = Date.now();
    const dtMs = this.lastEnergyTs > 0 ? now - this.lastEnergyTs : 0;
    this.lastEnergyTs = now;

    if (hasChg || hasDsg) {
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
      if (changed) await this.persistBatteryEnergy();
      return;
    }

    if (typeof batteryPowerW !== 'number' || dtMs <= 0) return;
    const next = integrateSignedPower(
      { posWh: this.chargedWh, negWh: this.dischargedWh },
      batteryPowerW,
      dtMs,
    );
    if (next.posWh !== this.chargedWh || next.negWh !== this.dischargedWh) {
      this.chargedWh = next.posWh;
      this.dischargedWh = next.negWh;
      await this.persistBatteryEnergy();
    }
  }

  private async persistBatteryEnergy(): Promise<void> {
    await this.setStoreValue('chargedWh', this.chargedWh).catch(() => {});
    await this.setStoreValue('dischargedWh', this.dischargedWh).catch(() => {});
    if (this.chargedRawWh !== undefined) await this.setStoreValue('chargedRawWh', this.chargedRawWh).catch(() => {});
    if (this.dischargedRawWh !== undefined) await this.setStoreValue('dischargedRawWh', this.dischargedRawWh).catch(() => {});
    await this.setCapabilityValue('meter_power.charged', this.chargedWh / 1000).catch(() => {});
    await this.setCapabilityValue('meter_power.discharged', this.dischargedWh / 1000).catch(() => {});
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
      const exporting = grid < -5;
      if (this.prevExporting !== undefined && exporting !== this.prevExporting) {
        const card = exporting ? 'grid_export_started' : 'grid_import_started';
        flow.getDeviceTriggerCard(card).trigger(this, { power: grid }).catch(() => {});
      }
      this.prevExporting = exporting;
      this.prevGrid = grid;
    }
    const battPower = values['measure_power'];
    if (typeof battPower === 'number') {
      // Resolve the charge state including the idle band, so the edge is detected
      // correctly across charging -> idle -> charging transitions.
      let nowCharging: boolean | null = null;
      if (battPower > 5) nowCharging = true;
      else if (battPower < -5) nowCharging = false;
      if (nowCharging !== null) {
        if (this.prevCharging !== undefined && this.prevCharging !== null && nowCharging !== this.prevCharging) {
          const card = nowCharging ? 'charging_started' : 'discharging_started';
          flow.getDeviceTriggerCard(card).trigger(this, { power: battPower }).catch(() => {});
        }
        this.prevCharging = nowCharging;
      } else {
        // Idle: clear so the next active period is detected as a fresh edge.
        this.prevCharging = null;
      }
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
    let active: { source: string; code: number } | null = null;
    for (const [key, source] of codes) {
      const v = Number(quota[key]);
      if (Number.isFinite(v) && v !== 0) {
        active = { source, code: v };
        break;
      }
    }
    const isFaulted = active !== null;
    if (this.hasCapability('alarm_generic') && this.getCapabilityValue('alarm_generic') !== isFaulted) {
      this.setCapabilityValue('alarm_generic', isFaulted).catch(() => {});
    }
    if (active && !this.faulted) {
      this.homey.flow.getDeviceTriggerCard('fault_raised').trigger(this, active).catch(() => {});
    } else if (!isFaulted && this.faulted) {
      this.homey.flow.getDeviceTriggerCard('fault_cleared').trigger(this).catch(() => {});
    }
    this.faulted = isFaulted;
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

  // ----- Flow action helpers ----------------------------------------------

  async flowSetOperatingMode(mode: OperatingMode): Promise<void> {
    await this.send(StreamCmd.operatingMode(this.mainSn, mode));
    await this.setCapabilityValue('operating_mode', mode).catch(() => {});
  }

  async flowSetBackupReserve(level: number): Promise<void> {
    await this.send(StreamCmd.backupReserve(this.mainSn, level));
    await this.setCapabilityValue('backup_reserve_soc', level).catch(() => {});
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

  async onSettings({ newSettings, changedKeys }: { newSettings: any; changedKeys: string[] }): Promise<void> {
    if (changedKeys.includes('poll_interval')) {
      if (this.pollTimer) this.homey.clearInterval(this.pollTimer);
      const interval = ((Number(newSettings.poll_interval) || 30) * 1000) || DEFAULT_POLL_MS;
      this.pollTimer = this.homey.setInterval(() => {
        this.poll().catch((e) => this.error('poll failed', e));
      }, interval);
    }
    if (changedKeys.includes('enable_history')) {
      if (this.historyTimer) {
        this.homey.clearInterval(this.historyTimer);
        this.historyTimer = null;
      }
      if (newSettings.enable_history !== false) {
        this.refreshHistory().catch((e) => this.error('history', e));
        this.historyTimer = this.homey.setInterval(() => {
          this.refreshHistory().catch((e) => this.error('history', e));
        }, HISTORY_INTERVAL_MS);
      }
    }
  }

  async onDeleted(): Promise<void> {
    (this.homey.app as any).unsubscribeRealtime?.(this.sn, this.quotaHandler, this.statusHandler);
    if (this.pollTimer) this.homey.clearInterval(this.pollTimer);
    if (this.historyTimer) this.homey.clearInterval(this.historyTimer);
  }
};
