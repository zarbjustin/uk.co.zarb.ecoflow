'use strict';

import Homey from 'homey';
import { EcoFlowClient } from '../../lib/EcoFlowClient';
import { mapStreamQuota } from '../../lib/streamMapping';
import { StreamCmd, OperatingMode } from '../../lib/streamProtocol';

const DEFAULT_POLL_MS = 30000;

module.exports = class StreamDevice extends Homey.Device {
  private client!: EcoFlowClient;
  private pollTimer: NodeJS.Timeout | null = null;
  private sn = '';
  private mainSn = '';

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

    this.client = new EcoFlowClient({ accessKey, secretKey, host, log: (...a) => this.log(...a) });
    this.registerControlListeners();

    await this.poll();
    const interval = (this.getSetting('poll_interval') as number) || DEFAULT_POLL_MS;
    this.pollTimer = this.homey.setInterval(() => {
      this.poll().catch((e) => this.error('poll failed', e));
    }, interval);
    this.log(`STREAM device ${this.sn} (main ${this.mainSn}) initialised`);
  }

  private registerControlListeners(): void {
    this.registerCapabilityListener('onoff.ac1', async (v: boolean) => this.send(StreamCmd.ac1(this.mainSn, v)));
    this.registerCapabilityListener('onoff.ac2', async (v: boolean) => this.send(StreamCmd.ac2(this.mainSn, v)));
    this.registerCapabilityListener('feed_in_control', async (v: boolean) =>
      this.send(StreamCmd.feedIn(this.mainSn, v)),
    );
    this.registerCapabilityListener('backup_reserve_soc', async (v: number) =>
      this.send(StreamCmd.backupReserve(this.mainSn, v)),
    );
    this.registerCapabilityListener('operating_mode', async (v: OperatingMode) =>
      this.send(StreamCmd.operatingMode(this.mainSn, v)),
    );
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
  }

  async onDeleted(): Promise<void> {
    if (this.pollTimer) this.homey.clearInterval(this.pollTimer);
  }
};
