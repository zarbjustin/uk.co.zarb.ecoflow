'use strict';

import mqtt, { MqttClient } from 'mqtt';
import { performance } from 'perf_hooks';
import { EcoFlowAppAuthClient, EcoFlowAppAuthError } from './EcoFlowAppAuthClient';
import { appMqttClientId } from './appMqttClientId';
import { houseReadRequest } from './houseReadRequest';

/**
 * Shared MQTT session against EcoFlow's **app** broker.
 *
 * Deliberately a separate class from {@link EcoFlowMqtt}: the app broker uses a
 * different transport (WSS/8084), a different ClientID scheme, different topics
 * (`/app/...`) and a binary protobuf payload. Keeping it apart means the
 * supported `/open` MQTT path used by every other device cannot regress.
 *
 * Ordinary subscriptions remain listen-only. A separately gated, app-owned
 * ES21 reserve bridge is the only write surface; no other setting/task is sent.
 *
 * Topic/transport details adapted from the MIT-licensed
 * https://github.com/shuette42/ecoflow-energy-ha (`ecoflow/cloud_mqtt.py`).
 */

export interface AppFrameDelivery {
  receivedAt: number;
  receivedMonoMs: number;
  retained: boolean;
  duplicate: boolean;
}
export type AppFrameHandler = (payload: Buffer, topic: string, delivery?: Readonly<AppFrameDelivery>) => void;

const DEFAULT_BROKER_HOST = 'mqtt-e.ecoflow.com';
/** Only EcoFlow's own brokers are ever contacted. */
const ALLOWED_BROKER_HOSTS = new Set([DEFAULT_BROKER_HOST, 'mqtt.ecoflow.com']);
const WSS_PORT = 8084;
const WSS_PATH = '/mqtt';
const KEEPALIVE_S = 30;
const MIN_BACKOFF_MS = 5000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

export interface EcoFlowAppMqttOptions {
  client: EcoFlowAppAuthClient;
  log?: (...args: any[]) => void;
}

function brokerHost(url: string | undefined): string {
  const candidate = (url || '').trim().toLowerCase();
  return ALLOWED_BROKER_HOSTS.has(candidate) ? candidate : DEFAULT_BROKER_HOST;
}

export class EcoFlowAppMqtt {
  private client: MqttClient | null = null;
  private userId = '';
  private connecting: Promise<void> | null = null;
  private ended = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private backoffMs = 0;
  private readonly handlers = new Map<string, Set<AppFrameHandler>>();
  private readonly log: (...args: any[]) => void;
  private auth: EcoFlowAppAuthClient;

  constructor(opts: EcoFlowAppMqttOptions) {
    this.auth = opts.client;
    this.log = opts.log || (() => {});
  }

  /** Swap in a client built from changed account settings. */
  updateClient(client: EcoFlowAppAuthClient): void {
    this.auth = client;
  }

  get connected(): boolean {
    return Boolean(this.client?.connected);
  }

  /** True while at least one device is still listening. */
  get hasSubscribers(): boolean {
    return this.handlers.size > 0;
  }

  async connect(): Promise<void> {
    if (this.client) return;
    if (this.connecting) {
      await this.connecting;
      return;
    }
    this.ended = false;
    this.connecting = this.establish();
    try {
      await this.connecting;
    } catch (e) {
      this.scheduleReconnect();
      throw e;
    } finally {
      this.connecting = null;
    }
  }

  /** Drop the session and re-establish it with fresh credentials. */
  async reconnect(): Promise<void> {
    if (this.connecting) {
      try {
        await this.connecting;
      } catch { /* ignore */ }
    }
    this.destroyClient();
    this.backoffMs = 0;
    await this.connect();
  }

  /**
   * Open a session with a fresh token, fresh broker certificate and a fresh
   * ClientID — the broker rejects a reused ClientID after a disconnect.
   */
  private async establish(): Promise<void> {
    const session = await this.auth.getSession();
    let creds;
    try {
      creds = await this.auth.getMqttCredentials();
    } catch (e) {
      // A rejected token here means the cached session is stale: force a
      // re-login so the next attempt starts from a clean state.
      if (e instanceof EcoFlowAppAuthError && e.authFailure) this.auth.invalidateSession();
      throw e;
    }
    if (this.ended) throw new Error('app MQTT ended during connect');

    this.userId = session.userId;
    const url = `wss://${brokerHost(creds.url)}:${WSS_PORT}${WSS_PATH}`;
    const client = mqtt.connect(url, {
      username: creds.account,
      password: creds.password,
      clientId: appMqttClientId(session.userId),
      reconnectPeriod: 0, // reconnection is managed here so credentials refresh
      protocolVersion: 5,
      keepalive: KEEPALIVE_S,
      clean: true,
      queueQoSZero: false, // never replay an expired reserve intent after reconnect
    });
    this.client = client;
    client.on('message', (topic, payload, packet) => this.onMessage(topic, payload as Buffer, packet));
    client.on('close', () => this.onDisconnect('close'));
    client.on('offline', () => this.onDisconnect('offline'));

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      client.once('connect', () => {
        settled = true;
        this.backoffMs = 0;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        this.log('connected');
        for (const sn of this.handlers.keys()) this.subscribeTopics(sn);
        resolve();
      });
      client.once('close', () => {
        if (!settled) reject(new Error('app MQTT connection closed before it was ready'));
      });
      client.on('error', (e: any) => {
        this.log('error', e?.message || 'connection error');
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

  private destroyClient(): void {
    if (!this.client) return;
    this.client.removeAllListeners('close');
    this.client.removeAllListeners('offline');
    try {
      this.client.end(true);
    } catch { /* ignore */ }
    this.client = null;
  }

  private onDisconnect(reason: string): void {
    if (this.ended) return;
    this.log('disconnected', reason);
    this.destroyClient();
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.ended || this.reconnectTimer || this.client) return;
    this.backoffMs = Math.min(Math.max(this.backoffMs * 2, MIN_BACKOFF_MS), MAX_BACKOFF_MS);
    const delay = this.backoffMs + Math.floor(Math.random() * 1000);
    // Managed timer: cleared in end(). The lib has no Homey handle, so use global.
    // eslint-disable-next-line homey-app/global-timers
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((e) => {
        this.log('reconnect failed', e?.message || 'unknown error');
        this.scheduleReconnect();
      });
    }, delay);
  }

  subscribe(sn: string, onFrame: AppFrameHandler): void {
    let set = this.handlers.get(sn);
    if (!set) {
      set = new Set();
      this.handlers.set(sn, set);
    }
    set.add(onFrame);
    this.subscribeTopics(sn);
  }

  unsubscribe(sn: string, onFrame?: AppFrameHandler): void {
    const set = this.handlers.get(sn);
    if (!set) return;
    if (onFrame) set.delete(onFrame);
    else set.clear();
    if (set.size > 0) return;
    this.handlers.delete(sn);
    if (!this.client) return;
    for (const topic of this.topics(sn)) this.client.unsubscribe(topic);
  }

  /** The read-only telemetry topics for one device. */
  private topics(sn: string): string[] {
    const list = [`/app/device/property/${sn}`];
    if (this.userId) list.push(`/app/${this.userId}/${sn}/thing/property/get_reply`);
    return list;
  }

  private subscribeTopics(sn: string): void {
    if (!this.client?.connected) return;
    for (const topic of this.topics(sn)) {
      this.client.subscribe(topic, { qos: 0 }, (e) => e && this.log('subscribe failed', e.message));
    }
  }

  private onMessage(topic: string, payload: Buffer, packet?: { retain?: boolean; dup?: boolean }): void {
    // Topics are either /app/device/property/{sn} or /app/{userId}/{sn}/thing/...
    const parts = topic.split('/');
    const sn = parts[2] === 'device' ? parts[4] : parts[3];
    const set = sn ? this.handlers.get(sn) : undefined;
    if (!set) return;
    // Optional third argument preserves existing consumers. Missing transport
    // metadata stays unknown; a future Energy consumer must not assume live.
    const delivery = packet && typeof packet.retain === 'boolean' && typeof packet.dup === 'boolean'
      ? Object.freeze({
        receivedAt: Date.now(), receivedMonoMs: performance.now(), retained: packet.retain, duplicate: packet.dup,
      }) : undefined;
    for (const handler of set) {
      try {
        handler(payload, topic, delivery);
      } catch (e: any) {
        this.log('frame handler error', e?.message || 'unknown error');
      }
    }
  }

  /** Narrow app-owned reserve bridge; never opens a second MQTT connection. */
  async publishHouseReserve(sn: string, frame: Buffer): Promise<void> {
    if (!/^ES21[A-Z0-9]{4,60}$/.test(sn) || !this.handlers.has(sn)
      || !this.client?.connected || !this.userId || this.ended) throw new Error('House reserve transport unavailable');
    const { client } = this;
    await new Promise<void>((resolve, reject) => {
      client.publish(`/app/${this.userId}/${sn}/thing/property/set`, frame, { qos: 0, retain: false }, (error) => {
        if (error) reject(new Error('House reserve publish failed')); else resolve();
      });
    });
  }

  /** Explicit status request on the existing subscribed session; never a SET. */
  async requestHouseRead(sn: string): Promise<void> {
    const { client } = this;
    if (!/^ES21[A-Z0-9]{4,60}$/.test(sn) || !this.handlers.has(sn) || !this.userId
      || !client?.connected || client.disconnecting || this.ended) throw new Error('House read transport unavailable');
    const frame = houseReadRequest((Date.now() & 0x7fffffff) || 1);
    await new Promise<void>((resolve, reject) => {
      client.publish(`/app/${this.userId}/${sn}/thing/property/get`, frame, { qos: 0, retain: false }, (error) => {
        if (error) reject(new Error('House read request not sent')); else resolve();
      });
    });
  }

  async end(): Promise<void> {
    this.ended = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.connecting) {
      try {
        await this.connecting;
      } catch { /* ignore */ }
    }
    if (this.client) {
      await new Promise<void>((res) => {
        this.client!.end(false, {}, () => res());
      });
    }
    this.client = null;
    this.handlers.clear();
  }
}
