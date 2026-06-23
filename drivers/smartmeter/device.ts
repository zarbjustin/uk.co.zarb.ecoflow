'use strict';

import Homey from 'homey';
import { EcoFlowClient } from '../../lib/EcoFlowClient';
import { mapSmartMeterQuota, accumulateEnergy } from '../../lib/smartMeterMapping';

const DEFAULT_POLL_MS = 30000;

/** Default titles for per-phase capabilities added dynamically. */
const DYNAMIC_TITLES: Record<string, string> = {
  'measure_power.l1': 'Power L1',
  'measure_power.l2': 'Power L2',
  'measure_power.l3': 'Power L3',
  'measure_voltage.l1': 'Voltage L1',
  'measure_voltage.l2': 'Voltage L2',
  'measure_voltage.l3': 'Voltage L3',
  'measure_current.l1': 'Current L1',
  'measure_current.l2': 'Current L2',
  'measure_current.l3': 'Current L3',
  power_factor: 'Power factor',
};

module.exports = class SmartMeterDevice extends Homey.Device {
  private client!: EcoFlowClient;
  private pollTimer: NodeJS.Timeout | null = null;
  private sn = '';
  private sourceSn = '';
  private importWh = 0;
  private exportWh = 0;
  private lastTs = 0;
  private quotaHandler?: (q: Record<string, any>) => void;

  async onInit(): Promise<void> {
    this.sn = this.getData().sn;
    this.sourceSn = (this.getStoreValue('sourceSn') as string) || this.sn;
    this.importWh = (this.getStoreValue('importWh') as number) || 0;
    this.exportWh = (this.getStoreValue('exportWh') as number) || 0;

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

    // Make sure the cumulative meters always have a value so Homey Energy can
    // start integrating immediately.
    await this.setCapabilityValue('meter_power.imported', this.importWh / 1000).catch(() => {});
    await this.setCapabilityValue('meter_power.exported', this.exportWh / 1000).catch(() => {});

    await this.poll();
    const interval = (((this.getSetting('poll_interval') as number) || 30) * 1000) || DEFAULT_POLL_MS;
    this.pollTimer = this.homey.setInterval(() => {
      this.poll().catch((e) => this.error('poll failed', e));
    }, interval);

    try {
      this.quotaHandler = (q: Record<string, any>) => {
        this.applyQuota(q).catch((e) => this.error('mqtt apply', e));
      };
      await (this.homey.app as any).subscribeRealtime?.(this.sourceSn, this.quotaHandler);
    } catch (e) {
      this.error('mqtt subscribe failed', e);
    }

    this.log(`Smart Meter ${this.sn} initialised (source ${this.sourceSn})`);
  }

  private async poll(): Promise<void> {
    try {
      const quota = await this.client.getQuotaAll(this.sourceSn);
      await this.applyQuota(quota);
      if (!this.getAvailable()) await this.setAvailable();
    } catch (e: any) {
      this.error('quota poll error', e?.message || e);
      await this.setUnavailable(e?.message || 'EcoFlow API error').catch(() => {});
    }
  }

  async applyQuota(quota: Record<string, any>): Promise<void> {
    const values = mapSmartMeterQuota(quota);

    // Integrate grid power into monotonic import/export energy counters.
    const power = values['measure_power'];
    if (typeof power === 'number') {
      const now = Date.now();
      if (this.lastTs > 0) {
        const next = accumulateEnergy(
          { importWh: this.importWh, exportWh: this.exportWh },
          power,
          now - this.lastTs,
        );
        if (next.importWh !== this.importWh || next.exportWh !== this.exportWh) {
          this.importWh = next.importWh;
          this.exportWh = next.exportWh;
          await this.setStoreValue('importWh', this.importWh).catch(() => {});
          await this.setStoreValue('exportWh', this.exportWh).catch(() => {});
          await this.setCapabilityValue('meter_power.imported', this.importWh / 1000).catch(() => {});
          await this.setCapabilityValue('meter_power.exported', this.exportWh / 1000).catch(() => {});
        }
      }
      this.lastTs = now;
    }

    for (const [cap, value] of Object.entries(values)) {
      await this.ensureCapability(cap);
      if (this.getCapabilityValue(cap) === value) continue;
      await this.setCapabilityValue(cap, value).catch((e) => this.error(`setCapabilityValue ${cap}`, e));
    }
  }

  /** Add an optional (per-phase) capability the first time data for it arrives. */
  private async ensureCapability(cap: string): Promise<void> {
    if (this.hasCapability(cap)) return;
    if (!(cap in DYNAMIC_TITLES)) return;
    try {
      await this.addCapability(cap);
      await this.setCapabilityOptions(cap, { title: { en: DYNAMIC_TITLES[cap] } });
    } catch (e) {
      this.error(`addCapability ${cap}`, e);
    }
  }

  async onDeleted(): Promise<void> {
    (this.homey.app as any).unsubscribeRealtime?.(this.sourceSn, this.quotaHandler);
    if (this.pollTimer) this.homey.clearInterval(this.pollTimer);
  }
};
