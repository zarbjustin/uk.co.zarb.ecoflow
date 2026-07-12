'use strict';

import https from 'https';
import crypto from 'crypto';
import { URL } from 'url';
import { authHeaders } from './sign';
import { normalizeApiHost } from './apiHost';
import {
  AppCertification, EcoFlowDevice, HistoryPoint, Quota,
} from './types';

export interface EcoFlowClientOptions {
  accessKey: string;
  secretKey: string;
  /** Defaults to https://api.ecoflow.com (EU developers may use https://api-e.ecoflow.com). */
  host?: string;
  /** Optional logger, e.g. the Homey device/driver log. */
  log?: (...args: any[]) => void;
}

export class EcoFlowApiError extends Error {
  public code: string;
  constructor(code: string, message: string) {
    super(`EcoFlow API ${code}: ${message}`);
    this.code = code;
    this.name = 'EcoFlowApiError';
  }
}

/**
 * Minimal, dependency-free EcoFlow IoT Open Platform REST client.
 * Handles HMAC-SHA256 request signing and the documented endpoints.
 */
export class EcoFlowClient {
  private static readonly responseCache = new Map<string, { expires: number; value: any }>();
  private static readonly inFlight = new Map<string, Promise<any>>();
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly host: string;
  private readonly log: (...args: any[]) => void;
  private readonly cacheIdentity: string;

  constructor(opts: EcoFlowClientOptions) {
    if (!opts.accessKey || !opts.secretKey) throw new Error('accessKey and secretKey are required');
    this.accessKey = opts.accessKey;
    this.secretKey = opts.secretKey;
    this.host = normalizeApiHost(opts.host);
    this.log = opts.log || (() => {});
    const secretFingerprint = crypto.createHmac('sha256', this.secretKey).update('ecoflow-cache').digest('hex');
    this.cacheIdentity = `${this.host}:${this.accessKey}:${secretFingerprint}`;
  }

  // ----- Public endpoints --------------------------------------------------

  /** GET /iot-open/sign/device/list — devices bound to the account. */
  async getDeviceList(): Promise<EcoFlowDevice[]> {
    const data = await this.cachedRequest('device-list', 30000, () => this.request('GET', '/iot-open/sign/device/list'));
    return (data as EcoFlowDevice[]) || [];
  }

  /**
   * GET /iot-open/sign/device/system/main/sn — resolve the MAIN device SN of a
   * multi-device STREAM/BKW system. Most STREAM commands target the main SN.
   */
  async getMainSn(anySn: string): Promise<string> {
    const data = await this.cachedRequest(`main-sn:${anySn}`, 5 * 60 * 1000, () => (
      this.request('GET', '/iot-open/sign/device/system/main/sn', { query: { sn: anySn } })
    ));
    return (data && (data.sn as string)) || anySn;
  }

  /** GET /iot-open/sign/device/quota/all — all current quota fields (flat map). */
  async getQuotaAll(sn: string): Promise<Quota> {
    const data = await this.cachedRequest(`quota:${sn}`, 1500, () => (
      this.request('GET', '/iot-open/sign/device/quota/all', { query: { sn } })
    ));
    return (data as Quota) || {};
  }

  /** POST /iot-open/sign/device/quota — read specific quota fields. */
  async getQuota(sn: string, quotas: string[]): Promise<Quota> {
    const data = await this.request('POST', '/iot-open/sign/device/quota', { body: { sn, params: { quotas } } });
    return (data as Quota) || {};
  }

  /**
   * PUT /iot-open/sign/device/quota — set a command.
   * Pass the full payload (e.g. the STREAM cmdFunc-254 envelope or a
   * { sn, cmdCode, params } object for PowerStream).
   */
  async setQuota(payload: Record<string, any>): Promise<Quota> {
    return (await this.request('PUT', '/iot-open/sign/device/quota', { body: payload })) as Quota;
  }

  /** GET /iot-open/sign/certification — MQTT broker credentials. */
  async getCertification(): Promise<AppCertification> {
    return (await this.request('GET', '/iot-open/sign/certification')) as AppCertification;
  }

  /** POST /iot-open/sign/device/quota/data — historical metric query (STREAM). */
  async getHistory(sn: string, code: string, beginTime: string, endTime: string): Promise<HistoryPoint[]> {
    const data = await this.request('POST', '/iot-open/sign/device/quota/data', {
      body: { sn, params: { beginTime, endTime, code } },
    });
    // The history endpoint nests its payload under data.data.
    const inner = data && (data.data as HistoryPoint[] | undefined);
    return (inner as HistoryPoint[]) || (data as HistoryPoint[]) || [];
  }

  // ----- Transport ---------------------------------------------------------

  private async cachedRequest<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const fullKey = `${this.cacheIdentity}:${key}`;
    const cached = EcoFlowClient.responseCache.get(fullKey);
    if (cached && cached.expires > Date.now()) return cached.value as T;
    const existing = EcoFlowClient.inFlight.get(fullKey);
    if (existing) return existing as Promise<T>;
    const request = load().then((value) => {
      EcoFlowClient.responseCache.set(fullKey, { expires: Date.now() + ttlMs, value });
      return value;
    }).finally(() => EcoFlowClient.inFlight.delete(fullKey));
    EcoFlowClient.inFlight.set(fullKey, request);
    return request;
  }

  private request(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    opts: { query?: Record<string, any>; body?: Record<string, any> } = {},
  ): Promise<any> {
    const isJson = method === 'POST' || method === 'PUT';
    // Per the signing rule: JSON body => sign the body; otherwise sign the query.
    const signParams = isJson ? opts.body || {} : opts.query || {};
    const headers: Record<string, string> = authHeaders(signParams, this.accessKey, this.secretKey);

    const url = new URL(this.host + path);
    if (!isJson && opts.query) {
      for (const [k, v] of Object.entries(opts.query)) url.searchParams.append(k, String(v));
    }

    let payload: string | undefined;
    if (isJson && opts.body) {
      payload = JSON.stringify(opts.body);
      headers['Content-Type'] = 'application/json;charset=UTF-8';
      headers['Content-Length'] = String(Buffer.byteLength(payload));
    }

    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          method,
          hostname: url.hostname,
          path: url.pathname + url.search,
          port: url.port || 443,
          headers,
          timeout: 15000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c as Buffer));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            let json: any;
            try {
              json = text ? JSON.parse(text) : {};
            } catch (e) {
              reject(new Error(`EcoFlow API: invalid JSON (HTTP ${res.statusCode}): ${text.slice(0, 200)}`));
              return;
            }
            const code = String(json.code ?? '');
            if (code !== '0') {
              reject(new EcoFlowApiError(code || String(res.statusCode), json.message || 'Request failed'));
              return;
            }
            resolve(json.data);
          });
        },
      );
      req.on('timeout', () => req.destroy(new Error('EcoFlow API: request timed out')));
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }
}
