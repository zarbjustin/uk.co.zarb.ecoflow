'use strict';

import mqtt, { MqttClient } from 'mqtt';
import { EcoFlowClient } from './EcoFlowClient';

export type QuotaHandler = (quota: Record<string, any>) => void;
export type StatusHandler = (online: boolean) => void;

export interface EcoFlowMqttOptions {
  accessKey: string;
  secretKey: string;
  host?: string;
  log?: (...args: any[]) => void;
}

/**
 * Shared MQTT connection to EcoFlow's broker. A single connection is used for
 * the whole account (EcoFlow does not allow parallel sessions). Devices
 * register their SN to receive realtime quota + online/offline updates.
 */
export class EcoFlowMqtt {
  private client: MqttClient | null = null;
  private account = '';
  private connecting: Promise<void> | null = null;
  private ended = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private backoffMs = 0;
  // Multiple devices may share one SN (e.g. the STREAM system device, the main
  // unit sub-device and the Smart Meter all read the main SN), so each SN keeps
  // a set of handlers rather than a single one.
  private readonly quotaHandlers = new Map<string, Set<QuotaHandler>>();
  private readonly statusHandlers = new Map<string, Set<StatusHandler>>();
  private readonly log: (...args: any[]) => void;

  constructor(private opts: EcoFlowMqttOptions) {
    this.log = opts.log || (() => {});
  }

  /** Update credentials/region; the next (re)connect uses them. */
  updateOptions(opts: EcoFlowMqttOptions): void {
    this.opts = opts;
  }

  async connect(): Promise<void> {
    if (this.client) return; // already connected / establishing
    if (this.connecting) {
      await this.connecting;
      return;
    }
    this.ended = false;
    this.connecting = this.establish();
    try {
      await this.connecting;
    } catch (e) {
      // Establishing failed (e.g. bad cert fetch) — schedule a retry and rethrow
      // so the caller can fall back to polling for now.
      this.scheduleReconnect();
      throw e;
    } finally {
      this.connecting = null;
    }
  }

  /** Force a reconnect (e.g. after credentials changed), keeping subscriptions. */
  async reconnect(): Promise<void> {
    if (this.client) {
      this.client.removeAllListeners('close');
      this.client.removeAllListeners('offline');
      try {
        this.client.end(true);
      } catch { /* ignore */ }
      this.client = null;
    }
    this.backoffMs = 0;
    await this.connect();
  }

  /**
   * Open a session with a FRESH certificate. We manage reconnection ourselves
   * (mqtt.js auto-reconnect is disabled) so an expired certificate is replaced
   * with a new one on every attempt instead of looping forever on a stale one.
   */
  private async establish(): Promise<void> {
    const api = new EcoFlowClient(this.opts);
    const cert = await api.getCertification();
    this.account = cert.certificateAccount;
    const url = `${cert.protocol}://${cert.url}:${cert.port}`;
    const client = mqtt.connect(url, {
      username: cert.certificateAccount,
      password: cert.certificatePassword,
      clientId: `homey_${cert.certificateAccount}_${Date.now()}`,
      reconnectPeriod: 0, // we reconnect manually to refresh the certificate
      protocolVersion: 5,
      clean: true,
    });
    this.client = client;
    client.on('message', (topic, payload) => this.onMessage(topic, payload));
    client.on('close', () => this.onDisconnect('close'));
    client.on('offline', () => this.onDisconnect('offline'));
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      client.once('connect', () => {
        settled = true;
        this.backoffMs = 0;
        this.log('connected');
        for (const sn of this.quotaHandlers.keys()) this.subscribeTopics(sn);
        resolve();
      });
      client.once('close', () => {
        if (!settled) reject(new Error('MQTT connection closed before it was ready'));
      });
      client.on('error', (e) => {
        this.log('error', e?.message || e);
        if (!settled) reject(e);
      });
    }).catch((e) => {
      if (this.client === client) this.client = null;
      client.removeAllListeners('close');
      client.removeAllListeners('offline');
      client.end(true);
      throw e;
    });
  }

  private onDisconnect(reason: string): void {
    if (this.ended) return;
    this.log('disconnected', reason);
    if (this.client) {
      this.client.removeAllListeners('close');
      this.client.removeAllListeners('offline');
      try {
        this.client.end(true);
      } catch { /* ignore */ }
      this.client = null;
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.ended || this.reconnectTimer || this.client) return;
    // Exponential backoff (5s → 5min) with jitter.
    this.backoffMs = Math.min(Math.max(this.backoffMs * 2, 5000), 5 * 60 * 1000);
    const delay = this.backoffMs + Math.floor(Math.random() * 1000);
    // Managed timer: cleared in end(). The lib has no Homey handle, so use global.
    // eslint-disable-next-line homey-app/global-timers
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((e) => {
        this.log('reconnect failed', e?.message || e);
        this.scheduleReconnect();
      });
    }, delay);
  }

  subscribe(sn: string, onQuota: QuotaHandler, onStatus?: StatusHandler): void {
    let qh = this.quotaHandlers.get(sn);
    if (!qh) {
      qh = new Set();
      this.quotaHandlers.set(sn, qh);
    }
    qh.add(onQuota);
    if (onStatus) {
      let sh = this.statusHandlers.get(sn);
      if (!sh) {
        sh = new Set();
        this.statusHandlers.set(sn, sh);
      }
      sh.add(onStatus);
    }
    this.subscribeTopics(sn);
  }

  /**
   * Remove handlers for an SN. When specific handlers are passed only those are
   * removed; the broker topics are only unsubscribed once no handlers remain.
   */
  unsubscribe(sn: string, onQuota?: QuotaHandler, onStatus?: StatusHandler): void {
    const qh = this.quotaHandlers.get(sn);
    if (qh) {
      if (onQuota) qh.delete(onQuota);
      else qh.clear();
      if (qh.size === 0) this.quotaHandlers.delete(sn);
    }
    const sh = this.statusHandlers.get(sn);
    if (sh) {
      if (onStatus) sh.delete(onStatus);
      else if (!onQuota) sh.clear();
      if (sh.size === 0) this.statusHandlers.delete(sn);
    }
    if (!this.quotaHandlers.has(sn) && !this.statusHandlers.has(sn) && this.client) {
      this.client.unsubscribe(this.topic(sn, 'quota'));
      this.client.unsubscribe(this.topic(sn, 'status'));
    }
  }

  private topic(sn: string, kind: 'quota' | 'status' | 'set'): string {
    return `/open/${this.account}/${sn}/${kind}`;
  }

  private subscribeTopics(sn: string): void {
    if (!this.client?.connected) return;
    this.client.subscribe(this.topic(sn, 'quota'), (e) => e && this.log('subscribe quota', e.message));
    this.client.subscribe(this.topic(sn, 'status'), (e) => e && this.log('subscribe status', e.message));
  }

  private onMessage(topic: string, payload: Buffer): void {
    let data: any;
    try {
      data = JSON.parse(payload.toString('utf8'));
    } catch {
      return;
    }
    const parts = topic.split('/'); // ['', 'open', account, sn, kind]
    const sn = parts[3];
    const kind = parts[4];
    if (kind === 'quota') {
      const quota = this.extractQuota(data);
      this.quotaHandlers.get(sn)?.forEach((h) => h(quota));
    } else if (kind === 'status') {
      const online = (data?.params?.status ?? data?.status) === 1;
      this.statusHandlers.get(sn)?.forEach((h) => h(online));
    }
  }

  /** STREAM reports a flat object; PowerStream wraps fields under `param`. */
  private extractQuota(data: any): Record<string, any> {
    if (data && typeof data === 'object') {
      if (data.param && typeof data.param === 'object') return data.param;
      if (data.params && typeof data.params === 'object') return data.params;
      if (data.data && typeof data.data === 'object') return data.data;
    }
    return data;
  }

  async end(): Promise<void> {
    this.ended = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.client) await new Promise<void>((res) => this.client!.end(false, {}, () => res()));
    this.client = null;
  }
}
