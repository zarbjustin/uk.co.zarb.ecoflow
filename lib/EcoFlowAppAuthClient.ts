'use strict';

import https from 'https';
import { URL } from 'url';
import { ECOFLOW_API_HOSTS, normalizeApiHost } from './apiHost';
import { decryptCertification } from './appAuthCrypto';
import { normalizeAppDeviceList } from './appDevices';
import type { AppDevice } from './appDevices';

/**
 * EXPERIMENTAL — EcoFlow **app** (mobile/portal) authentication client.
 *
 * This is NOT the documented Developer/Open API used by every other device in
 * this app. It exists because verified STREAM 5000-family units such as the
 * STREAM AC 5000 (ES22) answer `1006` to every public quota call. Using it
 * means signing in with your EcoFlow account, which EcoFlow does not sanction —
 * see docs/EXPERIMENTAL_STREAM_AC5000.md.
 *
 * Adapted from the MIT-licensed https://github.com/shuette42/ecoflow-energy-ha
 * (`ecoflow/enhanced_auth.py`, `ecoflow/app_api.py`).
 *
 * Hard rules honoured throughout this file:
 *  - the password, the token and the MQTT certificate are never logged, never
 *    put into an Error message and never returned in diagnostics;
 *  - only the approved EcoFlow API origins are ever contacted.
 */

const LOGIN_PATH = '/auth/login';
const DEVICE_LIST_PATH = '/iot-service/user/device';
const CERTIFICATION_PATH = '/iot-auth/enterprise-development/user/certification';

/** Re-login before the token gets old enough for the broker to reject it. */
const TOKEN_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15000;

export interface AppAuthCredentials {
  email: string;
  password: string;
  /** Preferred API origin; the other approved origin is still tried as fallback. */
  host?: string;
}

export interface AppAuthSession {
  token: string;
  userId: string;
  /** The origin that accepted the login; all later calls use it. */
  host: string;
}

export interface AppMqttCredentials {
  account: string;
  password: string;
  /** Broker hostname, e.g. mqtt-e.ecoflow.com. */
  url: string;
}

export interface AppAuthResponse {
  status: number;
  body: any;
}

export interface AppAuthRequest {
  method: 'GET' | 'POST';
  url: string;
  headers: Record<string, string>;
  body?: string;
}

/** Injectable transport so the client can be unit-tested without a network. */
export type AppAuthTransport = (req: AppAuthRequest) => Promise<AppAuthResponse>;

export class EcoFlowAppAuthError extends Error {
  public readonly code: string;

  /** True when the account/token was rejected rather than the request failing. */
  public readonly authFailure: boolean;

  constructor(code: string, message: string, authFailure = false) {
    super(`EcoFlow app API ${code}: ${message}`);
    this.name = 'EcoFlowAppAuthError';
    this.code = code;
    this.authFailure = authFailure;
  }
}

/** EcoFlow codes that mean "these credentials/this token are not accepted". */
const AUTH_FAILURE_CODES = new Set(['401', '403', '1000', '1001', '1002', '1003', '1004', '5001']);

function isAuthFailure(code: string, status: number): boolean {
  return status === 401 || status === 403 || AUTH_FAILURE_CODES.has(code);
}

function hostsToTry(preferred?: string): string[] {
  const ordered: string[] = [];
  if (preferred) {
    // Throws on anything outside the approved origins, before credentials are attached.
    ordered.push(normalizeApiHost(preferred));
  }
  for (const host of ECOFLOW_API_HOSTS) if (!ordered.includes(host)) ordered.push(host);
  return ordered;
}

const httpsTransport: AppAuthTransport = (req) => new Promise<AppAuthResponse>((resolve, reject) => {
  const url = new URL(req.url);
  const request = https.request(
    {
      method: req.method,
      hostname: url.hostname,
      path: url.pathname + url.search,
      port: url.port || 443,
      headers: req.headers,
      timeout: REQUEST_TIMEOUT_MS,
    },
    (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c as Buffer));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let body: any = {};
        if (text) {
          try {
            body = JSON.parse(text);
          } catch {
            reject(new Error(`EcoFlow app API: invalid JSON (HTTP ${res.statusCode})`));
            return;
          }
        }
        resolve({ status: res.statusCode || 0, body });
      });
    },
  );
  request.on('timeout', () => request.destroy(new Error('EcoFlow app API: request timed out')));
  request.on('error', reject);
  if (req.body) request.write(req.body);
  request.end();
});

export interface EcoFlowAppAuthClientOptions extends AppAuthCredentials {
  transport?: AppAuthTransport;
  /** Optional logger. Never receives credentials, tokens or certificates. */
  log?: (...args: any[]) => void;
}

/**
 * Token-authenticated EcoFlow app API client with regional fallback, lazy
 * login and automatic re-login when a token is rejected or ages out.
 */
export class EcoFlowAppAuthClient {
  private readonly email: string;
  private readonly password: string;
  private readonly preferredHost?: string;
  private readonly transport: AppAuthTransport;
  private readonly log: (...args: any[]) => void;
  private session: AppAuthSession | null = null;
  private sessionAt = 0;
  private loginInFlight: Promise<AppAuthSession> | null = null;

  constructor(opts: EcoFlowAppAuthClientOptions) {
    if (!opts.email || !opts.password) throw new Error('EcoFlow account email and password are required');
    this.email = opts.email.trim();
    this.password = opts.password;
    this.preferredHost = opts.host;
    this.transport = opts.transport || httpsTransport;
    this.log = opts.log || (() => {});
  }

  /** The origin that accepted the last login, if any. */
  get host(): string | undefined {
    return this.session?.host;
  }

  /** The account's userId — needed for the app MQTT topics. */
  get userId(): string | undefined {
    return this.session?.userId;
  }

  /** Discard the cached token so the next call re-authenticates. */
  invalidateSession(): void {
    this.session = null;
    this.sessionAt = 0;
  }

  /** Log in (or reuse a fresh token) and return the session. */
  async getSession(force = false): Promise<AppAuthSession> {
    if (!force && this.session && Date.now() - this.sessionAt < TOKEN_MAX_AGE_MS) return this.session;
    if (this.loginInFlight) return this.loginInFlight;
    this.loginInFlight = this.login().finally(() => {
      this.loginInFlight = null;
    });
    return this.loginInFlight;
  }

  private async login(): Promise<AppAuthSession> {
    const payload = JSON.stringify({
      email: this.email,
      password: Buffer.from(this.password, 'utf8').toString('base64'),
      scene: 'IOT_APP',
      userType: 'ECOFLOW',
    });

    let lastError: Error | null = null;
    let authError: EcoFlowAppAuthError | null = null;
    for (const host of hostsToTry(this.preferredHost)) {
      try {
        const data = await this.send(host, {
          method: 'POST',
          url: `${host}${LOGIN_PATH}`,
          headers: {
            'Content-Type': 'application/json;charset=UTF-8',
            'Content-Length': String(Buffer.byteLength(payload)),
          },
          body: payload,
        });
        const token = typeof data?.token === 'string' ? data.token : '';
        const userId = data?.user?.userId !== undefined ? String(data.user.userId) : '';
        if (!token || !userId) {
          const incomplete = new EcoFlowAppAuthError('0', 'login response did not contain a token', true);
          lastError = incomplete;
          if (!authError) authError = incomplete;
          continue;
        }
        this.session = { token, userId, host };
        this.sessionAt = Date.now();
        this.log('app-auth login accepted by', host);
        return this.session;
      } catch (e: any) {
        lastError = e;
        if (e instanceof EcoFlowAppAuthError && e.authFailure) {
          // An account only exists in one region, and the other region rejects it
          // exactly like a wrong password would. Keep trying the remaining
          // approved origins before calling the account itself invalid.
          if (!authError) authError = e;
          // Host only: the rejection reason is never logged.
          this.log('app-auth login rejected by', host);
          continue;
        }
        this.log('app-auth login failed on', host, '-', e?.message || 'unknown error');
      }
    }
    this.invalidateSession();
    // Prefer the account rejection: it is the actionable one for the user.
    throw authError || lastError || new Error('EcoFlow app API: login failed on all regions');
  }

  /** All devices bound to (or shared with) the account. */
  async getDeviceList(): Promise<AppDevice[]> {
    const data = await this.authorized((session) => ({
      method: 'GET' as const,
      url: `${session.host}${DEVICE_LIST_PATH}`,
      headers: { Authorization: `Bearer ${session.token}` },
    }));
    return normalizeAppDeviceList(data);
  }

  /** Broker credentials for the app (WSS) MQTT session. */
  async getMqttCredentials(): Promise<AppMqttCredentials> {
    const session = await this.getSession();
    const data = await this.authorized((s) => ({
      method: 'GET' as const,
      url: `${s.host}${CERTIFICATION_PATH}`,
      headers: { Authorization: `Bearer ${s.token}` },
    }));
    // The payload is encrypted with a key derived from the token that fetched it,
    // so decrypt with the token of the session that actually served the request.
    const token = this.session?.token || session.token;
    const decoded = typeof data === 'string' ? decryptCertification(token, data) : (data as Record<string, unknown>);
    const account = String(decoded?.certificateAccount || decoded?.userName || '');
    const password = String(decoded?.certificatePassword || decoded?.password || '');
    const url = String(decoded?.url || '');
    if (!account || !password) throw new Error('EcoFlow app API: certification response was incomplete');
    return { account, password, url };
  }

  /**
   * Run an authorized request, re-logging in once when the token is rejected.
   * The request is built from the session so a refreshed token/region applies.
   */
  private async authorized(build: (session: AppAuthSession) => AppAuthRequest): Promise<any> {
    const session = await this.getSession();
    try {
      return await this.send(session.host, build(session));
    } catch (e: any) {
      if (!(e instanceof EcoFlowAppAuthError) || !e.authFailure) throw e;
      this.invalidateSession();
      const refreshed = await this.getSession(true);
      return this.send(refreshed.host, build(refreshed));
    }
  }

  /** Send one request and unwrap EcoFlow's `{ code, message, data }` envelope. */
  private async send(host: string, req: AppAuthRequest): Promise<any> {
    // Re-validate the origin at the point of use: this request carries credentials.
    normalizeApiHost(host);
    const res = await this.transport(req);
    const body = res.body || {};
    const code = String(body.code ?? '');
    if (code !== '0') {
      const message = typeof body.message === 'string' && body.message ? body.message : 'Request failed';
      throw new EcoFlowAppAuthError(code || String(res.status), message, isAuthFailure(code, res.status));
    }
    return body.data;
  }
}
