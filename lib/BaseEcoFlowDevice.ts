'use strict';

import Homey from 'homey';
import { EcoFlowApiError, EcoFlowClient } from './EcoFlowClient';
import { getApp } from './appApi';
import { QuotaHandler, StatusHandler } from './EcoFlowMqtt';
import {
  DEVELOPER_API_UNSUPPORTED_FALLBACK,
  DEVELOPER_API_UNSUPPORTED_MESSAGE_KEY,
  developerApiQuarantineMessageKey,
  DeveloperApiQuarantineError,
  ES22_WRONG_DRIVER_FALLBACK,
} from './developerApiCompatibility';
import {
  hasKnownDeveloperApiPrefix, isStreamAc5000Sn,
} from './deviceIdentity';

const DEFAULT_POLL_MS = 30000;
const REALTIME_GRACE_MS = 90000;
const UNSUPPORTED_API_FAILURE_LIMIT = 3;

/**
 * Shared lifecycle for all EcoFlow devices: credential read + client creation,
 * REST polling, shared-MQTT subscription (quota + optional online/offline
 * status), availability handling (MQTT offline wins over a stale REST 200), and
 * cleanup. Subclasses implement {@link getReadSn} and {@link applyQuota}, and may
 * override the hooks below.
 */
export abstract class BaseEcoFlowDevice extends Homey.Device {
  protected client!: EcoFlowClient;
  protected pollTimer: NodeJS.Timeout | null = null;
  protected mqttOffline = false;
  private quotaHandler?: QuotaHandler;
  private statusHandler?: StatusHandler;
  private subscribedSn?: string;
  private clientCredentialsKey = '';
  private applyChain: Promise<void> = Promise.resolve();
  private pollPromise: Promise<void> | null = null;
  private lastRealtimeAt = 0;
  private developerApiQuarantineReason: string | null = null;
  private consecutiveUnsupportedApiFailures = 0;

  /** The SN whose quota this device reads/polls and subscribes to over MQTT. */
  protected abstract getReadSn(): string;

  /** Apply a quota payload (from poll or MQTT) to this device's capabilities. */
  abstract applyQuota(quota: Record<string, any>): Promise<void>;

  /** Subscribe to MQTT online/offline status as well as quota. Default: false. */
  protected handlesStatus(): boolean {
    return false;
  }

  /** Subclass init after the client is ready and before the first poll. */
  protected onReady(): Promise<void> {
    return Promise.resolve();
  }

  /** Subclass-specific settings handling (poll_interval is handled centrally). */
  protected onSettingsChanged(_newSettings: any, _changedKeys: string[]): Promise<void> {
    return Promise.resolve();
  }

  /** Subclass-specific teardown (e.g. extra timers). */
  protected onTeardown(): Promise<void> {
    return Promise.resolve();
  }

  async onInit(): Promise<void> {
    const quarantineReason = this.getDeveloperApiQuarantineReason();
    if (quarantineReason) {
      await this.quarantineDeveloperApi(
        quarantineReason,
        'ES22 device quarantined from the Developer API; delete and add it again as STREAM 5000 Series Unit.',
        false,
      );
      return;
    }

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
    this.clientCredentialsKey = `${accessKey}:${secretKey}:${host || ''}`;

    await this.onReady();

    await this.poll();
    this.startPollTimer();

    const sn = this.getReadSn();
    this.subscribedSn = sn;
    this.quotaHandler = (q) => {
      this.lastRealtimeAt = Date.now();
      this.queueQuota(q, 'mqtt').catch((e) => this.error('mqtt apply', e));
    };
    if (this.handlesStatus()) {
      this.statusHandler = (online) => {
        if (this.developerApiQuarantineReason) return;
        this.mqttOffline = !online;
        this.setOnlineState(online).catch(() => {});
      };
    }
    try {
      await getApp(this.homey).subscribeRealtime(sn, this.quotaHandler, this.statusHandler);
    } catch (e) {
      this.error('mqtt subscribe failed', e);
    }
    this.log(`${this.constructor.name} ${sn} initialised`);
  }

  protected startPollTimer(): void {
    if (this.pollTimer) this.homey.clearInterval(this.pollTimer);
    if (this.getDeveloperApiQuarantineReason()) {
      this.pollTimer = null;
      return;
    }
    const interval = (((this.getSetting('poll_interval') as number) || 30) * 1000) || DEFAULT_POLL_MS;
    this.pollTimer = this.homey.setInterval(() => {
      this.poll().catch((e) => this.error('poll failed', e));
    }, interval);
  }

  protected async poll(): Promise<void> {
    this.assertDeveloperApiSupported();
    if (this.pollPromise) {
      await this.pollPromise;
      return;
    }
    this.pollPromise = this.performPoll();
    try {
      await this.pollPromise;
    } finally {
      this.pollPromise = null;
    }
  }

  private async performPoll(): Promise<void> {
    const requestedAt = Date.now();
    try {
      this.refreshClientCredentials();
      const quota = await this.client.getQuotaAll(this.getReadSn());
      this.consecutiveUnsupportedApiFailures = 0;
      if (this.lastRealtimeAt <= requestedAt) await this.queueQuota(quota, 'rest');
      // Don't override a realtime MQTT "offline" with a possibly-stale REST 200.
      if (!this.mqttOffline) await this.setOnlineState(true);
    } catch (e: any) {
      if (this.isUnknownUnsupportedApiFailure(e)) {
        this.consecutiveUnsupportedApiFailures += 1;
        if (this.consecutiveUnsupportedApiFailures >= UNSUPPORTED_API_FAILURE_LIMIT) {
          await this.quarantineDeveloperApi(
            this.localize(
              DEVELOPER_API_UNSUPPORTED_MESSAGE_KEY,
              DEVELOPER_API_UNSUPPORTED_FALLBACK,
            ),
            'Device quarantined after repeated Developer API 1006 responses; automatic calls stopped.',
            true,
          );
        } else {
          this.error(
            'Developer API 1006 for an unrecognized device '
            + `(${this.consecutiveUnsupportedApiFailures}/${UNSUPPORTED_API_FAILURE_LIMIT}); retrying before quarantine.`,
          );
        }
        return;
      }
      this.consecutiveUnsupportedApiFailures = 0;
      this.error('quota poll error', e?.message || e);
      const realtimeHealthy = Date.now() - this.lastRealtimeAt <= REALTIME_GRACE_MS;
      if (!realtimeHealthy) await this.setOnlineState(false, e?.message || 'EcoFlow API error');
    }
  }

  private queueQuota(quota: Record<string, any>, source: 'mqtt' | 'rest'): Promise<void> {
    const run = async () => {
      if (this.developerApiQuarantineReason) return;
      await this.applyQuota(quota);
      if (source === 'mqtt' && !this.mqttOffline) await this.setOnlineState(true);
    };
    this.applyChain = this.applyChain.then(run, run);
    return this.applyChain;
  }

  private refreshClientCredentials(): void {
    const accessKey = this.homey.settings.get('accessKey') as string;
    const secretKey = this.homey.settings.get('secretKey') as string;
    const host = this.homey.settings.get('host') as string | undefined;
    if (!accessKey || !secretKey) throw new Error('EcoFlow credentials missing');
    const key = `${accessKey}:${secretKey}:${host || ''}`;
    if (key === this.clientCredentialsKey) return;
    this.client = new EcoFlowClient({
      accessKey, secretKey, host, log: (...a) => this.log(...a),
    });
    this.clientCredentialsKey = key;
  }

  /** All supported STREAM control writes pass through this compatibility gate. */
  protected async writeQuota(payload: Record<string, any>): Promise<Record<string, any>> {
    const targetSn = typeof payload.sn === 'string' ? payload.sn : undefined;
    this.assertDeveloperApiSupported(targetSn);
    return this.client.setQuota(payload);
  }

  private getDeveloperApiQuarantineReason(): string | null {
    if (this.developerApiQuarantineReason) return this.developerApiQuarantineReason;
    return this.getSerialQuarantineReason(this.getReadSn());
  }

  private getSerialQuarantineReason(sn: string | undefined): string | null {
    const messageKey = developerApiQuarantineMessageKey(sn);
    if (!messageKey) return null;
    return this.localize(messageKey, ES22_WRONG_DRIVER_FALLBACK);
  }

  private localize(messageKey: string, fallback: string): string {
    if (typeof this.homey?.__ !== 'function') return fallback;
    const localized = this.homey.__(messageKey);
    return localized && localized !== messageKey ? localized : fallback;
  }

  private assertDeveloperApiSupported(targetSn?: string): void {
    const reason = this.getDeveloperApiQuarantineReason() || this.getSerialQuarantineReason(targetSn);
    if (reason) throw new DeveloperApiQuarantineError(reason);
  }

  private isUnknownUnsupportedApiFailure(error: unknown): boolean {
    const code = error instanceof EcoFlowApiError ? error.code : (error as any)?.code;
    const readSn = this.getReadSn();
    return String(code) === '1006'
      && !isStreamAc5000Sn(readSn)
      && !hasKnownDeveloperApiPrefix(readSn);
  }

  private async quarantineDeveloperApi(
    reason: string,
    logMessage: string,
    stopSubclassWork: boolean,
  ): Promise<void> {
    if (this.developerApiQuarantineReason) return;
    this.developerApiQuarantineReason = reason;
    if (this.pollTimer) {
      this.homey.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.unsubscribeSupportedRealtime();
    if (stopSubclassWork) {
      await this.onTeardown().catch((e) => this.error('quarantine teardown failed', e));
    }
    await this.setUnavailable(reason).catch(() => {});
    this.log(logMessage);
  }

  private unsubscribeSupportedRealtime(): void {
    if (!this.subscribedSn) return;
    getApp(this.homey).unsubscribeRealtime(this.subscribedSn, this.quotaHandler, this.statusHandler);
    this.subscribedSn = undefined;
    this.quotaHandler = undefined;
    this.statusHandler = undefined;
  }

  /** Apply availability. Subclasses can override to add flow triggers etc. */
  protected async setOnlineState(online: boolean, message?: string): Promise<void> {
    if (this.developerApiQuarantineReason) return;
    if (online) {
      if (!this.getAvailable()) await this.setAvailable().catch(() => {});
    } else {
      await this.setUnavailable(message || 'Device offline').catch(() => {});
    }
  }

  async onSettings({ newSettings, changedKeys }: { newSettings: any; changedKeys: string[] }): Promise<void> {
    if (this.getDeveloperApiQuarantineReason()) return;
    if (changedKeys.includes('poll_interval')) this.startPollTimer();
    await this.onSettingsChanged(newSettings, changedKeys);
  }

  async onDeleted(): Promise<void> {
    await this.teardown();
  }

  async onUninit(): Promise<void> {
    await this.teardown();
  }

  /**
   * Idempotent teardown shared by onDeleted and onUninit. Homey calls onUninit
   * (not onDeleted) on app update / reboot / single-device re-init, so the MQTT
   * handlers, timers AND the energy checkpoint MUST be released/flushed here too —
   * otherwise the coalesced energy write is lost and meter_power regresses
   * (non-monotonic) across restarts, corrupting the Homey Energy dashboard.
   */
  private async teardown(): Promise<void> {
    this.unsubscribeSupportedRealtime();
    if (this.pollTimer) {
      this.homey.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    await this.onTeardown();
  }
}
