'use strict';

import Homey from 'homey';
import { EcoFlowClient } from '../../lib/EcoFlowClient';
import { mapStreamQuota } from '../../lib/streamMapping';
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
  private prevSoc: number | undefined;
  private prevPv: number | undefined;
  private prevGrid: number | undefined;

  async onInit(): Promise<void> {
    this.sn = this.getData().sn;
    this.mainSn = (this.getStoreValue('mainSn') as string) || this.sn;

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

    await this.poll();
    const interval = (((this.getSetting('poll_interval') as number) || 30) * 1000) || DEFAULT_POLL_MS;
    this.pollTimer = this.homey.setInterval(() => {
      this.poll().catch((e) => this.error('poll failed', e));
    }, interval);

    // Realtime updates via shared MQTT (falls back silently to polling).
    try {
      await (this.homey.app as any).subscribeRealtime?.(
        this.sn,
        (q: Record<string, any>) => this.applyQuota(q).catch((e) => this.error('mqtt apply', e)),
        (online: boolean) => {
          if (online) this.setAvailable().catch(() => {});
          else this.setUnavailable('Device reported offline').catch(() => {});
        },
      );
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
    this.registerCapabilityListener('onoff.ac1', async (v: boolean) => this.send(StreamCmd.ac1(this.mainSn, v)));
    this.registerCapabilityListener('onoff.ac2', async (v: boolean) => this.send(StreamCmd.ac2(this.mainSn, v)));
    this.registerCapabilityListener('feed_in_control', async (v: boolean) => this.send(StreamCmd.feedIn(this.mainSn, v)));
    this.registerCapabilityListener('backup_reserve_soc', async (v: number) => this.send(StreamCmd.backupReserve(this.mainSn, v)));
    this.registerCapabilityListener('operating_mode', async (v: OperatingMode) => this.send(StreamCmd.operatingMode(this.mainSn, v)));
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
      if (!this.getAvailable()) await this.setAvailable();
    } catch (e: any) {
      this.error('quota poll error', e?.message || e);
      await this.setUnavailable(e?.message || 'EcoFlow API error').catch(() => {});
    }
  }

  /** Apply a quota payload to capabilities (used by polling and MQTT). */
  async applyQuota(quota: Record<string, any>): Promise<void> {
    const values = mapStreamQuota(quota);
    for (const [cap, value] of Object.entries(values)) {
      if (!this.hasCapability(cap)) continue;
      if (this.getCapabilityValue(cap) === value) continue;
      await this.setCapabilityValue(cap, value).catch((e) => this.error(`setCapabilityValue ${cap}`, e));
    }
    this.fireTriggers(values);
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
      this.prevGrid = grid;
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

  async flowSetAc(which: 'ac1' | 'ac2', on: boolean): Promise<void> {
    await this.send(which === 'ac2' ? StreamCmd.ac2(this.mainSn, on) : StreamCmd.ac1(this.mainSn, on));
    await this.setCapabilityValue(which === 'ac2' ? 'onoff.ac2' : 'onoff.ac1', on).catch(() => {});
  }

  async onDeleted(): Promise<void> {
    (this.homey.app as any).unsubscribeRealtime?.(this.sn);
    if (this.pollTimer) this.homey.clearInterval(this.pollTimer);
    if (this.historyTimer) this.homey.clearInterval(this.historyTimer);
  }
};
