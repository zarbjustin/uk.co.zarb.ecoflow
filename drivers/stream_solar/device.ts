'use strict';

import Homey from 'homey';
import { EcoFlowClient } from '../../lib/EcoFlowClient';
import { solarPowerWatts, perPvWatts } from '../../lib/streamMapping';
import { integratePositivePower } from '../../lib/energyIntegration';

const DEFAULT_POLL_MS = 30000;

/**
 * STREAM solar generation as a Homey `solarpanel` device. `measure_power` is the
 * total PV power (positive when generating); cumulative generated energy
 * (`meter_power`) is integrated locally since the REST API exposes no lifetime
 * solar counter.
 */
module.exports = class StreamSolarDevice extends Homey.Device {
  private client!: EcoFlowClient;
  private pollTimer: NodeJS.Timeout | null = null;
  private sn = '';
  private generatedWh = 0;
  private lastTs = 0;
  private quotaHandler?: (q: Record<string, any>) => void;

  async onInit(): Promise<void> {
    this.sn = (this.getStoreValue('mainSn') as string) || this.getData().sn;
    this.generatedWh = (this.getStoreValue('generatedWh') as number) || 0;

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

    await this.setCapabilityValue('meter_power', this.generatedWh / 1000).catch(() => {});

    await this.poll();
    const interval = (((this.getSetting('poll_interval') as number) || 30) * 1000) || DEFAULT_POLL_MS;
    this.pollTimer = this.homey.setInterval(() => {
      this.poll().catch((e) => this.error('poll failed', e));
    }, interval);

    try {
      this.quotaHandler = (q: Record<string, any>) => {
        this.applyQuota(q).catch((e) => this.error('mqtt apply', e));
      };
      await (this.homey.app as any).subscribeRealtime?.(this.sn, this.quotaHandler);
    } catch (e) {
      this.error('mqtt subscribe failed', e);
    }

    this.log(`STREAM solar ${this.sn} initialised`);
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

  async applyQuota(quota: Record<string, any>): Promise<void> {
    const raw = solarPowerWatts(quota);
    if (raw !== undefined) {
      const power = Math.max(0, raw); // solar must be non-negative when generating
      if (this.getCapabilityValue('measure_power') !== power) {
        await this.setCapabilityValue('measure_power', power).catch((e) => this.error('measure_power', e));
      }
      const now = Date.now();
      if (this.lastTs > 0) {
        const next = integratePositivePower(this.generatedWh, power, now - this.lastTs);
        if (next !== this.generatedWh) {
          this.generatedWh = next;
          await this.setStoreValue('generatedWh', this.generatedWh).catch(() => {});
          await this.setCapabilityValue('meter_power', this.generatedWh / 1000).catch(() => {});
        }
      }
      this.lastTs = now;
    }

    for (let i = 1; i <= 4; i += 1) {
      const cap = `measure_power.pv${i}`;
      if (!this.hasCapability(cap)) continue;
      const v = perPvWatts(quota, i);
      if (v !== undefined && this.getCapabilityValue(cap) !== v) {
        await this.setCapabilityValue(cap, v).catch((e) => this.error(cap, e));
      }
    }
  }

  async onSettings({ newSettings, changedKeys }: { newSettings: any; changedKeys: string[] }): Promise<void> {
    if (changedKeys.includes('poll_interval')) {
      if (this.pollTimer) this.homey.clearInterval(this.pollTimer);
      const interval = ((Number(newSettings.poll_interval) || 30) * 1000) || DEFAULT_POLL_MS;
      this.pollTimer = this.homey.setInterval(() => {
        this.poll().catch((e) => this.error('poll failed', e));
      }, interval);
    }
  }

  async onDeleted(): Promise<void> {
    (this.homey.app as any).unsubscribeRealtime?.(this.sn, this.quotaHandler);
    if (this.pollTimer) this.homey.clearInterval(this.pollTimer);
  }
};
