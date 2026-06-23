'use strict';

import Homey from 'homey';
import { EcoFlowClient } from '../../lib/EcoFlowClient';
import { mapStreamQuota } from '../../lib/streamMapping';
import { StreamCmd } from '../../lib/streamProtocol';

const DEFAULT_POLL_MS = 30000;

/**
 * A single physical STREAM inverter/battery unit. Unlike the STREAM "system"
 * device (which reads the aggregated main SN), this reads the unit's OWN SN for
 * its grid feed + AC-output relays and targets that same SN for control.
 */
module.exports = class StreamUnitDevice extends Homey.Device {
  private client!: EcoFlowClient;
  private pollTimer: NodeJS.Timeout | null = null;
  private sn = '';
  private quotaHandler?: (q: Record<string, any>) => void;
  private statusHandler?: (online: boolean) => void;

  async onInit(): Promise<void> {
    this.sn = this.getData().sn;

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

    this.registerCapabilityListener('onoff.ac1', async (v: boolean) => this.send(StreamCmd.ac1(this.sn, v)));
    this.registerCapabilityListener('onoff.ac2', async (v: boolean) => this.send(StreamCmd.ac2(this.sn, v)));

    await this.poll();
    const interval = (((this.getSetting('poll_interval') as number) || 30) * 1000) || DEFAULT_POLL_MS;
    this.pollTimer = this.homey.setInterval(() => {
      this.poll().catch((e) => this.error('poll failed', e));
    }, interval);

    try {
      this.quotaHandler = (q: Record<string, any>) => {
        this.applyQuota(q).catch((e) => this.error('mqtt apply', e));
      };
      this.statusHandler = (online: boolean) => {
        if (online) this.setAvailable().catch(() => {});
        else this.setUnavailable('Device offline').catch(() => {});
      };
      await (this.homey.app as any).subscribeRealtime?.(this.sn, this.quotaHandler, this.statusHandler);
    } catch (e) {
      this.error('mqtt subscribe failed', e);
    }

    this.log(`STREAM unit ${this.sn} initialised`);
  }

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

  async applyQuota(quota: Record<string, any>): Promise<void> {
    const values = mapStreamQuota(quota, 'unit');
    for (const [cap, value] of Object.entries(values)) {
      if (!this.hasCapability(cap)) continue;
      if (this.getCapabilityValue(cap) === value) continue;
      await this.setCapabilityValue(cap, value).catch((e) => this.error(`setCapabilityValue ${cap}`, e));
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
    (this.homey.app as any).unsubscribeRealtime?.(this.sn, this.quotaHandler, this.statusHandler);
    if (this.pollTimer) this.homey.clearInterval(this.pollTimer);
  }
};
