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
  private readonly quotaHandlers = new Map<string, QuotaHandler>();
  private readonly statusHandlers = new Map<string, StatusHandler>();
  private readonly log: (...args: any[]) => void;

  constructor(private readonly opts: EcoFlowMqttOptions) {
    this.log = opts.log || (() => {});
  }

  async connect(): Promise<void> {
    if (this.client?.connected) return;
    if (this.connecting) {
      await this.connecting;
      return;
    }
    this.connecting = (async () => {
      const api = new EcoFlowClient(this.opts);
      const cert = await api.getCertification();
      this.account = cert.certificateAccount;
      const url = `${cert.protocol}://${cert.url}:${cert.port}`;
      this.client = mqtt.connect(url, {
        username: cert.certificateAccount,
        password: cert.certificatePassword,
        clientId: `homey_${cert.certificateAccount}_${Date.now()}`,
        reconnectPeriod: 5000,
        protocolVersion: 5,
        clean: true,
      });
      this.client.on('message', (topic, payload) => this.onMessage(topic, payload));
      this.client.on('error', (e) => this.log('error', e?.message || e));
      this.client.on('connect', () => {
        this.log('connected');
        for (const sn of this.quotaHandlers.keys()) this.subscribeTopics(sn);
      });
    })();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  subscribe(sn: string, onQuota: QuotaHandler, onStatus?: StatusHandler): void {
    this.quotaHandlers.set(sn, onQuota);
    if (onStatus) this.statusHandlers.set(sn, onStatus);
    this.subscribeTopics(sn);
  }

  unsubscribe(sn: string): void {
    this.quotaHandlers.delete(sn);
    this.statusHandlers.delete(sn);
    if (this.client) {
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
      this.quotaHandlers.get(sn)?.(this.extractQuota(data));
    } else if (kind === 'status') {
      const online = (data?.params?.status ?? data?.status) === 1;
      this.statusHandlers.get(sn)?.(online);
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
    if (this.client) await new Promise<void>((res) => this.client!.end(false, {}, () => res()));
    this.client = null;
  }
}
