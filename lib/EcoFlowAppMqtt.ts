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
  /** Local socket epoch only; no account/broker identifier. Absent on legacy injected deliveries. */
  connectionEpoch?: number;
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
const SUBSCRIBE_TIMEOUT_MS = 10000;
const MAX_SUBSCRIBE_ATTEMPTS = 3;
const SUBSCRIBE_RECOVERY_MS = 30000;
const END_GRACE_MS = 1000;
type TopicSubscription = {
  sn: string; state: 'pending' | 'active' | 'rejected' | 'timed_out';
  timer: ReturnType<typeof setTimeout> | null;
};

export interface EcoFlowAppMqttOptions {
  client: EcoFlowAppAuthClient;
  log?: (...args: any[]) => void;
}

function brokerHost(url: string | undefined): string {
  const candidate = (url || '').trim().toLowerCase();
  return ALLOWED_BROKER_HOSTS.has(candidate) ? candidate : DEFAULT_BROKER_HOST;
}

type TopicOwner = {
  id: number;
  options: Readonly<{ qos: 0; nl: false; rap: false; rh: 0 }>;
  record?: unknown;
  mapping?: string[];
};
type WireCall = {
  id: number; topic: string; command: 'subscribe' | 'unsubscribe';
  allocated: boolean; sent: boolean; record?: unknown; mapping?: string[];
};
type NativeSubscriptionState = {
  _storeProcessing: boolean;
  _storeProcessingQueue: unknown[];
  outgoing: Record<number, unknown>;
  messageIdToTopic: Record<number, string[]>;
  stream: { writableLength: number; writableNeedDrain: boolean; destroyed: boolean; writableEnded: boolean };
};

/**
 * Locked MQTT.js 5.15.1 adapter, not a version-independent bookkeeping API.
 * One immutable intent keeps its ID through every settlement; detach retires it.
 * MQTT 5 same-ID SUBSCRIBE interoperability remains a broker qualification gate:
 * a matching ACK can settle this intent, never prove latest-wire authorization.
 */
function createTopicTransport() {
  // 0 free, 1 ordinary native allocation, 2 owner/reserved, 3 retired.
  const ids = new Uint8Array(65536);
  const owners = new Map<string, TopicOwner>();
  let cursor = 0; let last: number | null = null;
  let selected: WireCall | null = null;
  let client: MqttClient | null = null;
  let native = false;
  let detachListeners = () => {};
  const bookkeeping = () => client as unknown as NativeSubscriptionState;
  const validId = (id: number) => Number.isInteger(id) && id > 0 && id < ids.length;
  const provider = {
    allocate(): number | null {
      if (selected && !selected.allocated) {
        selected.allocated = true; last = selected.id; return last;
      }
      for (let n = 0; n < 65535; n++) {
        cursor = (cursor % 65535) + 1;
        if (ids[cursor] === 0 && (!native || (!bookkeeping().outgoing?.[cursor] && !bookkeeping().messageIdToTopic?.[cursor]))) {
          ids[cursor] = 1; last = cursor; return cursor;
        }
      }
      return null;
    },
    getLastAllocated: () => last,
    register(id: number): boolean {
      if (!validId(id) || ids[id] !== 0) return false;
      ids[id] = 1; return true;
    },
    deallocate(id: number): void {
      if (validId(id) && ids[id] === 1) ids[id] = 0;
    },
    // Native _onConnect calls clear(). Only a new clean client creates a new
    // ledger; a lifecycle callback must never erase owner/retirement fences.
    clear() {},
  };
  const ready = () => {
    if (!client?.connected || client.disconnecting) return false;
    // Legacy injected test clients do not have a native allocator/store.
    if (!native) return true;
    const state = bookkeeping();
    return (client.constructor as typeof MqttClient).VERSION === '5.15.1' && client.messageIdProvider === provider
      && state._storeProcessing === false && Array.isArray(state._storeProcessingQueue) && state._storeProcessingQueue.length === 0
      && state.stream?.writableLength === 0 && state.stream.writableNeedDrain === false
      && state.stream.destroyed === false && state.stream.writableEnded === false;
  };
  const cancel = (id: number, record?: unknown, mapping?: string[]) => {
    if (!native || !client) return;
    const state = bookkeeping();
    if (mapping && state.messageIdToTopic[id] === mapping) delete state.messageIdToTopic[id];
    if (record && state.outgoing[id] === record) client.removeOutgoingMessage(id);
  };
  const packetsend = (packet: any) => {
    if (!selected || packet.cmd !== selected.command || packet.messageId !== selected.id) return;
    const route = packet.cmd === 'subscribe' ? packet.subscriptions?.[0]?.topic : packet.unsubscriptions?.[0];
    if (route !== selected.topic) return;
    selected.sent = true;
    if (!native) return;
    selected.record = bookkeeping().outgoing[selected.id];
    selected.mapping = bookkeeping().messageIdToTopic[selected.id];
    const owner = owners.get(selected.topic);
    if (packet.cmd === 'subscribe' && owner?.id === selected.id) {
      owner.record = selected.record; owner.mapping = selected.mapping;
    }
  };
  const invoke = (call: WireCall, send: () => void) => {
    const previous = selected;
    selected = call;
    try {
      send();
      // packetsend precedes serialization; it is NOT write/delivery completion.
      if (native && (!call.allocated || !call.sent)) throw new Error('App subscription was not synchronously allocated');
    } finally {
      selected = previous;
    }
  };
  return {
    provider,
    owners,
    bind(c: MqttClient) {
      client = c;
      native = Boolean(c.messageIdProvider || (c.constructor as typeof MqttClient).VERSION);
      c.on('packetsend', packetsend);
    },
    onDetach(callback: () => void) {
      detachListeners = callback;
    },
    detach() {
      detachListeners(); client?.removeListener('packetsend', packetsend);
    },
    ready,
    owner(topic: string): TopicOwner | undefined {
      const existing = owners.get(topic);
      if (existing) return existing;
      const id = provider.allocate();
      if (id === null) return undefined;
      ids[id] = 2;
      const owner: TopicOwner = {
        id,
        options: Object.freeze({
          qos: 0, nl: false, rap: false, rh: 0,
        }),
      };
      owners.set(topic, owner); return owner;
    },
    subscribe(topic: string, owner: TopicOwner, callback: Parameters<MqttClient['subscribe']>[2]) {
      const call: WireCall = {
        id: owner.id, topic, command: 'subscribe', allocated: false, sent: false,
      };
      try {
        invoke(call, () => {
          client!.subscribe(topic, owner.options, callback);
        });
      } finally {
        if (native && call.allocated) {
          owner.record = call.record ?? bookkeeping().outgoing[owner.id];
          owner.mapping = call.mapping ?? bookkeeping().messageIdToTopic[owner.id];
          if (owners.get(topic) !== owner) cancel(owner.id, owner.record, owner.mapping);
        }
      }
    },
    release(topic: string) {
      const owner = owners.get(topic);
      if (!owner) return;
      owners.delete(topic); ids[owner.id] = 3;
      // Tombstone and delete mapping before cancellation can allocate/reenter.
      cancel(owner.id, owner.record, owner.mapping);
    },
    unsubscribe(topic: string) {
      if (!ready()) return;
      const id = provider.allocate();
      if (id === null) return;
      ids[id] = 2;
      const call: WireCall = {
        id, topic, command: 'unsubscribe', allocated: false, sent: false,
      };
      try {
        invoke(call, () => {
          client!.unsubscribe(topic, {}, () => {});
        });
      } finally {
        ids[id] = 3;
        cancel(id, call.record, call.mapping);
      }
    },
  };
}

export class EcoFlowAppMqtt {
  private client: MqttClient | null = null;
  private userId = '';
  private connecting: Promise<void> | null = null;
  private ended = false;
  private ending: Promise<void> | null = null;
  private transport: ReturnType<typeof createTopicTransport> | null = null;
  private cancelHandshake: (() => void) | null = null;
  private connectionEpoch = 0;
  private socketReceivedFrames = 0;
  private socketRouteRejectedFrames = 0;
  private socketPingResponses = 0;
  private socketLastFrameAt: number | null = null;
  private socketLastPingAt: number | null = null;
  private socketConnectedAt: number | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private backoffMs = 0;
  private readonly handlers = new Map<string, Set<AppFrameHandler>>();
  private readonly subscriptions = new Map<string, TopicSubscription>();
  private readonly receipts = new Map<string, { count: number; at: number }>();
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
    if (this.ending) await this.ending;
    if (this.connecting) {
      await this.connecting;
      return;
    }
    if (this.client) return;
    this.ending = null;
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
    const transport = createTopicTransport();
    const client = mqtt.connect(url, {
      username: creds.account,
      password: creds.password,
      clientId: appMqttClientId(session.userId),
      reconnectPeriod: 0, // reconnection is managed here so credentials refresh
      protocolVersion: 5,
      keepalive: KEEPALIVE_S,
      clean: true,
      queueQoSZero: false, // never replay an expired reserve intent after reconnect
      messageIdProvider: transport.provider,
    });
    this.client = client;
    this.transport = transport; transport.bind(client);
    const message = (topic: string, payload: Buffer, packet: any) => {
      // A queued callback from a replaced socket must not gain a new receipt
      // timestamp and appear fresh to consumers on the current connection.
      if (this.ended || this.client !== client) return;
      this.onMessage(topic, payload as Buffer, packet);
    };
    const packetreceive = (packet: any) => {
      if (this.ended || this.client !== client || packet.cmd !== 'pingresp') return;
      this.socketPingResponses = Math.min(65535, this.socketPingResponses + 1);
      this.socketLastPingAt = Date.now();
    };
    const close = () => {
      if (this.client === client) this.onDisconnect('close');
    };
    const offline = () => {
      if (this.client === client) this.onDisconnect('offline');
    };
    client.on('message', message);
    client.on('packetreceive', packetreceive);
    client.on('close', close);
    client.on('offline', offline);
    transport.onDetach(() => {
      client.removeListener('message', message); client.removeListener('packetreceive', packetreceive);
      client.removeListener('close', close); client.removeListener('offline', offline);
    });

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const cancel = () => {
        if (!settled) {
          settled = true;
          reject(new Error('app MQTT handshake interrupted'));
        }
      };
      this.cancelHandshake = cancel;
      client.once('connect', () => {
        if (this.ended || this.client !== client) {
          reject(new Error('app MQTT connection replaced before it was ready')); return;
        }
        if (this.cancelHandshake === cancel) this.cancelHandshake = null;
        ++this.connectionEpoch;
        this.socketReceivedFrames = 0; this.socketRouteRejectedFrames = 0; this.socketPingResponses = 0;
        this.socketLastFrameAt = null; this.socketLastPingAt = null; this.socketConnectedAt = Date.now();
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
        this.log('error', 'connection_failed');
        if (!settled) reject(e);
      });
    }).catch((e) => {
      if (this.client === client) {
        this.cancelHandshake = null;
        this.clearSubscriptions(); this.client = null; this.transport = null;
      }
      transport.detach();
      client.end(true);
      throw e;
    });
  }

  private clearSubscriptions(sn?: string): void {
    for (const [topic, item] of this.subscriptions) {
      if (sn !== undefined && item.sn !== sn) continue;
      if (item.timer) clearTimeout(item.timer);
      this.subscriptions.delete(topic);
      this.transport?.release(topic);
    }
  }

  private destroyClient(): void {
    this.cancelHandshake?.();
    this.cancelHandshake = null;
    this.clearSubscriptions();
    if (!this.client) return;
    this.transport?.detach();
    try {
      this.client.end(true);
    } catch { /* ignore */ }
    this.client = null;
    this.transport = null;
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
      this.connect().catch(() => {
        this.log('reconnect failed');
        this.scheduleReconnect();
      });
    }, delay);
  }

  subscribe(sn: string, onFrame: AppFrameHandler): void {
    let set = this.handlers.get(sn);
    if (!set) {
      set = new Set();
      this.handlers.set(sn, set);
      set.add(onFrame);
      this.subscribeTopics(sn);
      return;
    }
    // The broker subscription belongs to the serial, not each consumer.
    // Preserve healthy/pending topics and any scheduled bounded retry.
    const added = !set.has(onFrame);
    set.add(onFrame);
    if (added) {
      for (const topic of this.topics(sn)) {
        const item = this.subscriptions.get(topic);
        if (item && !item.timer && (item.state === 'rejected' || item.state === 'timed_out')) {
          // A recovering consumer must not be pinned to an exhausted topic by
          // another listener. A new bounded attempt never fabricates telemetry.
          this.subscribeTopic(sn, topic);
        }
      }
    }
  }

  unsubscribe(sn: string, onFrame?: AppFrameHandler): void {
    const set = this.handlers.get(sn);
    if (!set) return;
    if (onFrame) set.delete(onFrame);
    else set.clear();
    if (set.size > 0) return;
    this.handlers.delete(sn);
    this.clearSubscriptions(sn);
    this.receipts.delete(sn);
    if (!this.client) return;
    for (const topic of this.topics(sn)) {
      try {
        this.transport?.unsubscribe(topic);
      } catch {
        this.log('unsubscribe unavailable');
      }
    }
  }

  /** The read-only telemetry topics for one device. */
  private topics(sn: string): string[] {
    const list = [`/app/device/property/${sn}`];
    if (this.userId) list.push(`/app/${this.userId}/${sn}/thing/property/get_reply`);
    return list;
  }

  private subscribeTopics(sn: string): void {
    if (!this.client?.connected || this.ended) return;
    for (const topic of this.topics(sn)) this.subscribeTopic(sn, topic);
  }

  private subscribeTopic(sn: string, topic: string, attempt = 1, recoveryMs = SUBSCRIBE_RECOVERY_MS): void {
    const { client } = this;
    if (!client?.connected || this.ended || !this.handlers.has(sn)) return;
    const item: TopicSubscription = {
      sn, state: 'pending', timer: null,
    };
    this.subscriptions.set(topic, item);
    const { transport } = this;
    const owner = transport?.owner(topic);
    if (!transport || !owner) {
      item.state = 'rejected';
      this.log('subscription', 'namespace_exhausted');
      return;
    }
    const current = () => !this.ended && this.client === client && this.handlers.has(sn) && this.subscriptions.get(topic) === item;
    const failed = (state: 'rejected' | 'timed_out') => {
      if (!current() || item.state !== 'pending') return;
      if (item.timer) clearTimeout(item.timer);
      item.state = state;
      this.log('subscription', state); // Never log a topic, account, serial or broker error.
      if (attempt < MAX_SUBSCRIBE_ATTEMPTS) {
        // eslint-disable-next-line homey-app/global-timers -- owned per-topic retry, cancelled on detach/end.
        item.timer = setTimeout(() => {
          item.timer = null;
          if (current()) this.subscribeTopic(sn, topic, attempt + 1);
        }, MIN_BACKOFF_MS * attempt);
      } else {
        // Recovery continues for existing listeners, at a capped rate, without
        // replacing the shared socket or restarting the fast retry wave.
        // eslint-disable-next-line homey-app/global-timers -- owned per-topic recovery, cancelled on detach/end.
        item.timer = setTimeout(() => {
          item.timer = null;
          if (current()) this.subscribeTopic(sn, topic, attempt, Math.min(recoveryMs * 2, MAX_BACKOFF_MS));
        }, recoveryMs);
      }
    };
    // Never append native deferred work or buffered retransmission bytes.
    if (!transport.ready()) {
      failed('timed_out'); return;
    }
    // A connected socket is not proof the broker accepted its subscription.
    // eslint-disable-next-line homey-app/global-timers -- owned acknowledgement deadline, cancelled on detach/end.
    item.timer = setTimeout(() => failed('timed_out'), SUBSCRIBE_TIMEOUT_MS);
    try {
      transport.subscribe(topic, owner, (error, granted) => {
        if (!current() || item.state !== 'pending') return;
        if (error || !Array.isArray(granted) || granted.length !== 1
          || granted[0].topic !== topic || ![0, 1, 2].includes(granted[0].qos)) {
          failed('rejected'); return;
        }
        if (item.timer) clearTimeout(item.timer);
        item.timer = null; item.state = 'active';
      });
    } catch {
      failed('rejected');
    }
  }

  /** Local bounded evidence only; successful SUBACK never makes stale telemetry fresh. */
  getDeliveryDiagnostics(sn: string) {
    const items = [...this.subscriptions.values()].filter((item) => item.sn === sn);
    const receipt = this.receipts.get(sn);
    const age = receipt ? Date.now() - receipt.at : null;
    const ageSec = (at: number | null) => (at !== null && Number.isFinite(Date.now() - at) && Date.now() >= at ? (Date.now() - at) / 1000 : null);
    return {
      socketEvidenceScope: 'shared_current_connection',
      socketReceivedFrames: this.socketReceivedFrames,
      socketRouteRejectedFrames: this.socketRouteRejectedFrames,
      socketPingResponses: this.socketPingResponses,
      socketLastFrameAgeSec: ageSec(this.socketLastFrameAt),
      socketLastPingAgeSec: ageSec(this.socketLastPingAt),
      socketConnectionAgeSec: ageSec(this.socketConnectedAt),
      connected: this.connected,
      listening: this.handlers.has(sn),
      pendingTopics: items.filter((item) => item.state === 'pending').length,
      activeTopics: items.filter((item) => item.state === 'active').length,
      rejectedTopics: items.filter((item) => item.state === 'rejected').length,
      timedOutTopics: items.filter((item) => item.state === 'timed_out').length,
      receivedFrames: receipt?.count || 0,
      lastFrameAgeSec: age !== null && Number.isFinite(age) && age >= 0 ? age / 1000 : null,
    };
  }

  private onMessage(topic: string, payload: Buffer, packet?: { retain?: boolean; dup?: boolean }): void {
    this.socketReceivedFrames = Math.min(65535, this.socketReceivedFrames + 1);
    this.socketLastFrameAt = Date.now();
    // Topics are either /app/device/property/{sn} or /app/{userId}/{sn}/thing/...
    const parts = topic.split('/');
    const sn = parts[2] === 'device' ? parts[4] : parts[3];
    const set = sn ? this.handlers.get(sn) : undefined;
    if (!set || !this.topics(sn).includes(topic)) {
      this.socketRouteRejectedFrames = Math.min(65535, this.socketRouteRejectedFrames + 1);
      return;
    }
    const prior = this.receipts.get(sn);
    this.receipts.set(sn, { count: Math.min(65535, (prior?.count || 0) + 1), at: Date.now() });
    // Optional third argument preserves existing consumers. Missing transport
    // metadata stays unknown; a future Energy consumer must not assume live.
    const delivery = packet && typeof packet.retain === 'boolean' && typeof packet.dup === 'boolean'
      ? Object.freeze({
        receivedAt: Date.now(),
        receivedMonoMs: performance.now(),
        retained: packet.retain,
        duplicate: packet.dup,
        connectionEpoch: this.connectionEpoch,
      }) : undefined;
    for (const handler of set) {
      try {
        handler(payload, topic, delivery);
      } catch {
        this.log('frame handler error');
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

  end(): Promise<void> {
    if (this.ending) return this.ending;
    this.ended = true;
    if (this.cancelHandshake) this.destroyClient();
    this.clearSubscriptions();
    this.receipts.clear();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.connecting?.catch(() => {});
    const { client } = this;
    this.transport?.detach(); this.transport = null;
    this.client = null;
    this.handlers.clear();
    this.ending = new Promise<void>((resolve) => {
      if (!client) {
        resolve(); return;
      }
      let settled = false;
      let deadline: ReturnType<typeof setTimeout> | null = null;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (deadline) clearTimeout(deadline);
        resolve();
      };
      // eslint-disable-next-line homey-app/global-timers -- owned bounded shutdown, independent of MQTT.js end callback.
      deadline = setTimeout(() => {
        try {
          client.stream?.destroy();
        } catch { /* already closed */ }
        finish();
      }, END_GRACE_MS);
      try {
        client.end(false, {}, finish);
      } catch {
        try {
          client.stream?.destroy();
        } catch { /* already closed */ }
        finish();
      }
    });
    return this.ending;
  }
}
