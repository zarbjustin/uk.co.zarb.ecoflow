'use strict';

import Homey from 'homey';
import { EcoFlowApiError, EcoFlowClient } from './EcoFlowClient';
import { EcoFlowAppApi, getApp } from './appApi';
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
import { StreamRemainingTime, REMAINING_TIME_CAPS } from './StreamRemainingTime';
import { migrateReadingTitle } from './streamReadingScopes';
import { StreamLiveReadings, STREAM_SYSTEM_LIVE_CAPS, STREAM_UNIT_LIVE_CAPS } from './StreamLiveReadings';

const DEFAULT_POLL_MS = 30000;
const REALTIME_GRACE_MS = 90000;
const UNSUPPORTED_API_FAILURE_LIMIT = 3;

export interface QuotaSampleContext {
  receivedAt: number;
  source: 'mqtt' | 'rest';
}

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
  private realtimeApp?: EcoFlowAppApi;
  private clientCredentialsKey = '';
  private applyChain: Promise<void> = Promise.resolve();
  private pollPromise: Promise<void> | null = null;
  private lastRealtimeAt = 0;
  private realtimeRevision = 0;
  private pendingRestFields: Set<string> | null = null;
  private stopping = false;
  private developerApiQuarantineReason: string | null = null;
  private consecutiveUnsupportedApiFailures = 0;
  private remainingTime = new StreamRemainingTime();
  private remainingTimeTimer: NodeJS.Timeout | null = null;
  private remainingTimeScope: 'unit' | 'system' | null = null;
  private remainingTimeGeneration = 0;
  private remainingTimeClearPending = new Set<string>();
  private liveReadings: StreamLiveReadings | null = null;
  private liveReadingsTimer: NodeJS.Timeout | null = null;
  private liveReadingsGeneration = 0;
  private liveClearPending = new Set<string>();

  protected liveReadingsEnabled(): boolean {
    return true;
  }

  protected getLiveReadingFreshness(): ReturnType<StreamLiveReadings['snapshot']> {
    return this.liveReadings?.snapshot() || {};
  }

  protected resetLiveReadingReceipts(): void {
    this.liveReadings?.reset();
  }

  protected async startLiveReadings(scope: 'unit' | 'system'): Promise<void> {
    this.stopLiveReadings();
    const caps = (scope === 'unit' ? STREAM_UNIT_LIVE_CAPS : STREAM_SYSTEM_LIVE_CAPS).filter((cap) => this.hasCapability(cap));
    this.liveReadings = new StreamLiveReadings(caps);
    const generation = this.liveReadingsGeneration;
    for (const cap of caps) {
      if (this.isShuttingDown() || generation !== this.liveReadingsGeneration) return;
      await this.setCapabilityValue(cap, null).catch(() => {
        this.liveClearPending.add(cap);
      });
    }
    if (this.isShuttingDown() || generation !== this.liveReadingsGeneration || typeof this.homey.setInterval !== 'function') return;
    this.liveReadingsTimer = this.homey.setInterval(() => {
      this.queueDeviceWork(() => this.expireLiveReadings()).catch(() => {});
    }, 60000);
  }

  protected stopLiveReadings(): void {
    this.liveReadingsGeneration += 1;
    if (this.liveReadingsTimer) this.homey.clearInterval(this.liveReadingsTimer);
    this.liveReadingsTimer = null;
    this.liveReadings = null;
    this.liveClearPending.clear();
  }

  protected isLiveReading(cap: string): boolean {
    return this.liveReadings?.tracks(cap) === true;
  }

  protected async applyLiveReading(cap: string, value: unknown, at: number): Promise<boolean> {
    const generation = this.liveReadingsGeneration;
    const active = () => this.liveReadingsEnabled() && !this.isShuttingDown() && generation === this.liveReadingsGeneration;
    if (!this.liveReadings) return false;
    return this.liveReadings.apply(cap, value, at, async (next) => {
      if (!active()) return;
      if (this.getCapabilityValue(cap) !== next) await this.setCapabilityValue(cap, next);
      this.liveClearPending.delete(cap);
    }, active);
  }

  protected async expireLiveReadings(): Promise<void> {
    const generation = this.liveReadingsGeneration;
    const active = () => this.liveReadingsEnabled() && !this.isShuttingDown() && generation === this.liveReadingsGeneration;
    for (const cap of this.liveClearPending) {
      if (!active()) return;
      await this.setCapabilityValue(cap, null).then(() => this.liveClearPending.delete(cap)).catch(() => {});
    }
    await this.liveReadings?.expire(async (cap) => {
      if (this.hasCapability(cap) && this.getCapabilityValue(cap) !== null) await this.setCapabilityValue(cap, null);
    }, active);
  }

  getRemainingTimeDiagnostics(): Record<string, unknown> {
    return this.remainingTimeScope ? this.remainingTime.snapshot() : {};
  }

  protected getRemainingTimeFreshness(): Record<string, { stale: boolean }> {
    if (!this.remainingTimeScope) return {};
    return Object.fromEntries(Object.entries(this.remainingTime.snapshot())
      .filter(([cap]) => this.hasCapability(cap)).map(([cap, field]) => [cap, { stale: field.stale }]));
  }

  protected resetRemainingTimeReceipts(): void {
    this.remainingTime.reset();
  }

  protected async startRemainingTime(scope: 'unit' | 'system'): Promise<void> {
    this.stopRemainingTime();
    this.remainingTimeScope = scope;
    if (!REMAINING_TIME_CAPS.some((cap) => this.hasCapability(cap))) return;
    const generation = this.remainingTimeGeneration;
    for (const cap of REMAINING_TIME_CAPS) {
      if (this.isShuttingDown() || generation !== this.remainingTimeGeneration) return;
      if (this.hasCapability(cap)) {
        await this.setCapabilityValue(cap, null).catch(() => {
          this.remainingTimeClearPending.add(cap);
        });
        if (typeof this.getCapabilityOptions === 'function') {
          const suffix = cap === 'charge_remaining' ? 'charge time remaining' : 'discharge time remaining';
          const titles = scope === 'unit'
            ? {
              en: `Unit ${suffix}`,
              de: cap === 'charge_remaining' ? 'Einheit: Verbleibende Ladezeit' : 'Einheit: Verbleibende Entladezeit',
              nl: cap === 'charge_remaining' ? 'Unit: resterende laadtijd' : 'Unit: resterende ontlaadtijd',
            }
            : {
              en: `System ${suffix}`,
              de: cap === 'charge_remaining' ? 'System: Verbleibende Ladezeit' : 'System: Verbleibende Entladezeit',
              nl: cap === 'charge_remaining' ? 'Systeem: resterende laadtijd' : 'Systeem: resterende ontlaadtijd',
            };
          await migrateReadingTitle(this, cap, titles,
            () => !this.isShuttingDown() && generation === this.remainingTimeGeneration);
        }
      }
    }
    if (this.isShuttingDown() || generation !== this.remainingTimeGeneration) return;
    this.remainingTimeTimer = this.homey.setInterval(() => {
      this.queueDeviceWork(async () => {
        for (const cap of this.remainingTimeClearPending) {
          if (generation !== this.remainingTimeGeneration || this.isShuttingDown()) return;
          try {
            await this.setCapabilityValue(cap, null); this.remainingTimeClearPending.delete(cap);
          } catch { /* Retry next tick. */ }
        }
        await this.remainingTime.expire(
          async (cap, value) => {
            if (this.hasCapability(cap)) await this.setCapabilityValue(cap, value);
          },
          () => generation === this.remainingTimeGeneration && !this.isShuttingDown(),
        );
      }).catch(() => {});
    }, 60000);
  }

  protected stopRemainingTime(): void {
    this.remainingTimeGeneration += 1;
    if (this.remainingTimeTimer) this.homey.clearInterval(this.remainingTimeTimer);
    this.remainingTimeTimer = null;
    this.remainingTimeScope = null;
    this.remainingTimeClearPending.clear();
    this.remainingTime.reset();
  }

  protected async applyRemainingTime(quota: Record<string, unknown>, context?: QuotaSampleContext): Promise<void> {
    if (!this.remainingTimeScope) return;
    const generation = this.remainingTimeGeneration;
    const scopedQuota = { ...quota };
    // Only same-scope signed power may select an estimate. A unit port is not
    // its pack flow, and neither BMS time nor BMS flow describes the system.
    if (this.remainingTimeScope === 'system' && Object.prototype.hasOwnProperty.call(quota, 'powGetBpCms')) {
      const raw = quota.powGetBpCms;
      let power = NaN;
      if (typeof raw === 'number') power = raw;
      else if (typeof raw === 'string' && raw.trim()) power = Number(raw);
      this.remainingTime.observePower(Number.isFinite(power) ? power : null, context?.receivedAt ?? Date.now());
    }
    for (const cap of REMAINING_TIME_CAPS) {
      if (!this.hasCapability(cap)) delete scopedQuota[`${this.remainingTimeScope === 'unit' ? 'bms' : 'cms'}${cap === 'charge_remaining' ? 'Chg' : 'Dsg'}RemTime`];
    }
    await this.remainingTime.apply(scopedQuota, this.remainingTimeScope, context?.receivedAt ?? Date.now(),
      context?.source ?? 'unknown',
      async (cap, value) => {
        if (this.hasCapability(cap)) {
          await this.setCapabilityValue(cap, value); this.remainingTimeClearPending.delete(cap);
        }
      },
      () => generation === this.remainingTimeGeneration && !this.isShuttingDown());
  }

  protected async applyRemainingTimePower(power: number | null, at: number): Promise<void> {
    if (this.remainingTimeScope !== 'unit' || this.isShuttingDown()) return;
    const generation = this.remainingTimeGeneration;
    this.remainingTime.observePower(power, at);
    await this.remainingTime.expire(async (cap, value) => {
      if (this.hasCapability(cap)) await this.setCapabilityValue(cap, value);
    }, () => generation === this.remainingTimeGeneration && !this.isShuttingDown());
  }

  /** The SN whose quota this device reads/polls and subscribes to over MQTT. */
  protected abstract getReadSn(): string;

  /** Some meters publish directly while their REST fallback lives on a host. */
  protected getRealtimeSn(): string {
    return this.getReadSn();
  }

  /** Apply a quota payload (from poll or MQTT) to this device's capabilities. */
  abstract applyQuota(quota: Record<string, any>, context?: QuotaSampleContext): Promise<void>;

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

  /** Serialize subclass maintenance with telemetry writes and shutdown. */
  protected queueDeviceWork(work: () => Promise<void>): Promise<void> {
    const run = async () => {
      if (!this.stopping && !this.developerApiQuarantineReason) await work();
    };
    this.applyChain = this.applyChain.then(run, run);
    return this.applyChain;
  }

  async onInit(): Promise<void> {
    this.stopping = false;
    const quarantineReason = this.getDeveloperApiQuarantineReason();
    if (quarantineReason) {
      await this.quarantineDeveloperApi(
        quarantineReason,
        'STREAM 5000 device quarantined from the Developer API; use the app-connected Unit monitor. STREAM Home Battery (5000) Energy pairing has a separate opt-in.',
        false,
      );
      return;
    }

    const accessKey = this.homey.settings.get('accessKey') as string;
    const secretKey = this.homey.settings.get('secretKey') as string;
    const host = this.homey.settings.get('host') as string | undefined;
    if (!accessKey || !secretKey) {
      await this.setUnavailable('EcoFlow credentials missing — update the API keys in the app settings, then restart the app.');
      return;
    }
    this.client = new EcoFlowClient({
      accessKey, secretKey, host, log: (...a) => this.log(...a),
    });
    this.clientCredentialsKey = `${accessKey}:${secretKey}:${host || ''}`;

    await this.onReady();
    if (this.stopping) {
      // onReady may have created subclass timers while shutdown was awaiting it.
      await this.onTeardown();
      return;
    }

    await this.poll();
    if (this.stopping) return;
    this.startPollTimer();

    const sn = this.getRealtimeSn();
    this.subscribedSn = sn;
    this.quotaHandler = (q) => {
      this.lastRealtimeAt = Date.now();
      this.realtimeRevision += 1;
      if (q && typeof q === 'object') {
        for (const key of Object.keys(q)) this.pendingRestFields?.add(key);
      }
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
      const app = getApp(this.homey);
      this.realtimeApp = app;
      const { quotaHandler, statusHandler } = this;
      await app.subscribeRealtime(sn, quotaHandler, statusHandler);
      if (this.stopping) {
        // Teardown can precede the connection completing. Use the captured app
        // and handlers: Homey's app accessor may already have been destroyed.
        app.unsubscribeRealtime(sn, quotaHandler, statusHandler);
        return;
      }
    } catch (e) {
      if (this.stopping) return;
      this.error('mqtt subscribe failed', e);
    }
    this.log(`${this.constructor.name} ${sn} initialised`);
  }

  protected startPollTimer(): void {
    if (this.stopping) return;
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
    if (this.stopping) return;
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
    const requestedRevision = this.realtimeRevision;
    const newerFields = new Set<string>();
    this.pendingRestFields = newerFields;
    try {
      this.refreshClientCredentials();
      const quota = await this.client.getQuotaAll(this.getReadSn());
      if (this.stopping) return;
      this.consecutiveUnsupportedApiFailures = 0;
      // A revision detects newer MQTT even within the same millisecond. Check
      // again when the queued reply runs: capability writes may hold the queue.
      await this.queueQuota(quota, 'rest', requestedRevision, newerFields);
      // Don't override a realtime MQTT "offline" with a possibly-stale REST 200.
      if (!this.mqttOffline) await this.setOnlineState(true);
    } catch (e: any) {
      if (this.stopping) return;
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
    } finally {
      if (this.pendingRestFields === newerFields) this.pendingRestFields = null;
    }
  }

  /** Other drivers keep the conservative whole-response guard. */
  protected reconcileRestQuota(_quota: Record<string, any>, _newerFields: ReadonlySet<string>): Record<string, any> | null {
    return null;
  }

  private queueQuota(quota: Record<string, any>, source: 'mqtt' | 'rest', requestedRevision?: number,
    newerFields: ReadonlySet<string> = new Set()): Promise<void> {
    if (this.stopping) return Promise.resolve();
    const context = { receivedAt: Date.now(), source };
    const run = async () => {
      if (this.developerApiQuarantineReason) return;
      let selected = quota;
      if (source === 'rest' && requestedRevision !== this.realtimeRevision) {
        const reconciled = this.reconcileRestQuota(quota, newerFields);
        if (!reconciled || !Object.keys(reconciled).length) return;
        selected = reconciled;
      }
      await this.applyQuota(selected, context);
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
    if (this.stopping) throw new Error('Device is shutting down; control cancelled.');
    this.refreshClientCredentials();
    return this.client.setQuota(payload);
  }

  protected isShuttingDown(): boolean {
    return this.stopping;
  }

  /** Target-specific uncached control readback; failures must propagate. */
  protected async readControlQuota(sn: string, fields?: string[]): Promise<Record<string, any>> {
    this.assertDeveloperApiSupported(sn);
    if (this.stopping) throw new Error('Device is shutting down; control cancelled.');
    this.refreshClientCredentials();
    const quota = fields
      ? await this.client.getQuota(sn, fields)
      : await this.client.getQuotaAll(sn, { fresh: true });
    if (this.stopping) throw new Error('Device is shutting down; control cancelled.');
    return quota;
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
    this.realtimeApp?.unsubscribeRealtime(this.subscribedSn, this.quotaHandler, this.statusHandler);
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

  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- SDK types deletion void; teardown must await saved energy.
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
    this.stopping = true;
    this.unsubscribeSupportedRealtime();
    if (this.pollTimer) {
      this.homey.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    await this.applyChain.catch(() => {});
    await this.onTeardown();
  }
}
