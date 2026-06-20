'use strict';

import Homey from 'homey';
import { EcoFlowClient } from '../../lib/EcoFlowClient';
import { mapPowerStreamQuota } from '../../lib/powerStreamMapping';
import { PsCmd } from '../../lib/powerStreamProtocol';

const DEFAULT_POLL_MS = 30000;

module.exports = class PowerStreamDevice extends Homey.Device {
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

    this.client = new EcoFlowClient({
      accessKey, secretKey, host, log: (...a) => this.log(...a),
    });
    this.registerControlListeners();

    await this.poll();
    const interval = (((this.getSetting('poll_interval') as number) || 30) * 1000) || DEFAULT_POLL_MS;
    this.pollTimer = this.homey.setInterval(() => {
      this.poll().catch((e) => this.error('poll failed', e));
    }, interval);

    try {
      await (this.homey.app as any).subscribeRealtime?.(this.sn, (q: Record<string, any>) => this.applyQuota(q).catch((e) => this.error('mqtt apply', e)));
    } catch (e) {
      this.error('mqtt subscribe failed', e);
    }

    this.log(`PowerStream device ${this.sn} initialised`);
  }

  private registerControlListeners(): void {
    this.registerCapabilityListener('output_target_power', async (v: number) => this.send(PsCmd.outputWatts(this.sn, v)));
    this.registerCapabilityListener('supply_priority', async (v: string) => this.send(PsCmd.supplyPriority(this.sn, v === 'power_storage')));
    this.registerCapabilityListener('led_brightness', async (v: number) => this.send(PsCmd.brightness(this.sn, v)));
    this.registerCapabilityListener('ps_charge_limit', async (v: number) => this.send(PsCmd.chargeLimit(this.sn, v)));
    this.registerCapabilityListener('ps_discharge_limit', async (v: number) => this.send(PsCmd.dischargeLimit(this.sn, v)));
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
    const values = mapPowerStreamQuota(quota);
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
