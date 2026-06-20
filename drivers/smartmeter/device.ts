'use strict';

import Homey from 'homey';
import { EcoFlowClient } from '../../lib/EcoFlowClient';
import { mapSmartMeterQuota } from '../../lib/smartMeterMapping';

const DEFAULT_POLL_MS = 30000;

module.exports = class SmartMeterDevice extends Homey.Device {
  private client!: EcoFlowClient;
  private pollTimer: NodeJS.Timeout | null = null;
  private sn = '';

  async onInit(): Promise<void> {
    this.sn = this.getData().sn;
    const accessKey = this.homey.settings.get('accessKey') as string;
    const secretKey = this.homey.settings.get('secretKey') as string;
    const host = this.homey.settings.get('host') as string | undefined;
    if (!accessKey || !secretKey) {
      await this.setUnavailable('EcoFlow credentials missing — re-add the device.');
      return;
    }

    this.client = new EcoFlowClient({ accessKey, secretKey, host, log: (...a) => this.log(...a) });
    await this.poll();
    const interval = (this.getSetting('poll_interval') as number) || DEFAULT_POLL_MS;
    this.pollTimer = this.homey.setInterval(() => {
      this.poll().catch((e) => this.error('poll failed', e));
    }, interval);

    try {
      const app: any = this.homey.app;
      await app.subscribeRealtime?.(this.sn, (q: Record<string, any>) =>
        this.applyQuota(q).catch((e) => this.error('mqtt apply', e)),
      );
    } catch (e) {
      this.error('mqtt subscribe failed', e);
    }

    this.log(`Smart Meter ${this.sn} initialised`);
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
    const values = mapSmartMeterQuota(quota);
    for (const [cap, value] of Object.entries(values)) {
      if (!this.hasCapability(cap)) continue;
      if (this.getCapabilityValue(cap) === value) continue;
      await this.setCapabilityValue(cap, value).catch((e) => this.error(`setCapabilityValue ${cap}`, e));
    }
  }

  async onDeleted(): Promise<void> {
    (this.homey.app as any).unsubscribeRealtime?.(this.sn);
    if (this.pollTimer) this.homey.clearInterval(this.pollTimer);
  }
};
