'use strict';

import Homey from 'homey';
import { EcoFlowClient } from '../../lib/EcoFlowClient';
import { StreamCmd } from '../../lib/streamProtocol';

const DEFAULT_POLL_MS = 30000;

/** A single AC outlet of a STREAM unit, as a Homey smart-plug device. */
module.exports = class StreamSocketDevice extends Homey.Device {
  private client!: EcoFlowClient;
  private pollTimer: NodeJS.Timeout | null = null;
  private sn = '';
  private outlet = 1;
  private relayKey = 'relay2Onoff';
  private powerKey = 'powGetSchuko1';
  private quotaHandler?: (q: Record<string, any>) => void;

  async onInit(): Promise<void> {
    this.sn = this.getData().sn;
    this.outlet = (this.getData().outlet as number) || 1;
    this.relayKey = this.outlet === 2 ? 'relay3Onoff' : 'relay2Onoff';
    this.powerKey = this.outlet === 2 ? 'powGetSchuko2' : 'powGetSchuko1';

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

    this.registerCapabilityListener('onoff', async (on: boolean) => {
      // Per-unit relays are reported per unit, so socket control targets the
      // unit's own SN (not the system main SN). Verify on hardware for members.
      const cmd = this.outlet === 2 ? StreamCmd.ac2(this.sn, on) : StreamCmd.ac1(this.sn, on);
      await this.client.setQuota(cmd);
      this.homey.setTimeout(() => this.poll().catch((e) => this.error('post-set poll', e)), 1500);
    });

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

    this.log(`STREAM socket ${this.sn} outlet ${this.outlet} initialised`);
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
    const relay = quota[this.relayKey];
    if (relay !== undefined) {
      const on = typeof relay === 'boolean' ? relay : Number(relay) !== 0;
      if (this.getCapabilityValue('onoff') !== on) {
        await this.setCapabilityValue('onoff', on).catch((e) => this.error('onoff', e));
      }
    }
    const power = Number(quota[this.powerKey]);
    if (Number.isFinite(power) && this.getCapabilityValue('measure_power') !== power) {
      await this.setCapabilityValue('measure_power', power).catch((e) => this.error('measure_power', e));
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
