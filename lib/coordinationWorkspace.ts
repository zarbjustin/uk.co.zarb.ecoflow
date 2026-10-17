/** Explicit, bounded Homey reads only. No cloud/device commands, background polling or persisted telemetry. */
import { randomUUID } from 'crypto';
import { coordinationCatalog, normalizeCoordinationBindings, boundCoordinationView } from './coordinationBindings';

export interface CoordinationReader {
  list(): Promise<any>;
  read(id: string): Promise<any>;
  close(): void;
}
export class CoordinationWorkspace {
  private reader: CoordinationReader | null = null;
  private token: string | null = null;
  private clientId: string | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private generation = 0;
  private busy = false;
  private lastRead = -Infinity;
  private startedAt = 0;
  private lastNow = 0;
  private stopped = false;

  constructor(private readonly factory: () => Promise<CoordinationReader>, private readonly now = () => Date.now()) {
    this.lastNow = 0;
  }

  revoke(): void {
    this.generation += 1; this.token = null; this.clientId = null;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    try {
      this.reader?.close();
    } catch { /* Never disclose provider errors or keep a revoked reader. */ }
    this.reader = null;
  }

  stop(): void {
    this.stopped = true; this.revoke();
  }

  async request(body: any): Promise<Record<string, any>> {
    const base = {
      advisoryOnly: true, controlsEnabled: false, contributesToEnergy: false, commandWrites: 0,
    };
    const fail = (reason: string) => ({
      ...base, state: 'blocked', reason, readings: [], decision: null,
    });
    if (body?.action === 'revoke') {
      const owns = (this.token && body.token === this.token) || (this.clientId && body.clientId === this.clientId);
      if ((this.token || this.clientId) && !owns) return fail('session_expired');
      this.revoke(); return fail('preview_disabled');
    }
    const now = this.now();
    if (this.stopped || !Number.isFinite(now) || now <= 0 || now < this.lastNow) {
      this.revoke(); return fail('session_expired');
    }
    this.lastNow = now;
    if (body?.consent !== true) return fail('consent_required');
    if (!['open', 'catalog', 'evaluate', 'manual', 'validate'].includes(body?.action)) return fail('unsupported_action');
    if (this.busy) return fail('busy');
    if (body.action !== 'open' && (!this.token || body.token !== this.token || now - this.startedAt >= 600000)) {
      if (this.token && now - this.startedAt >= 600000) this.revoke();
      return fail('session_expired');
    }
    if (!['open', 'validate'].includes(body.action) && now - this.lastRead < 2000) return fail('rate_limited');
    this.busy = true;
    if (body.action === 'open') {
      this.revoke();
      this.clientId = typeof body.clientId === 'string' && /^[A-Za-z0-9-]{1,80}$/.test(body.clientId) ? body.clientId : null;
    }
    const epoch = this.generation;
    const live = () => !this.stopped && epoch === this.generation;
    let timer: NodeJS.Timeout | undefined;
    let timedOut = false;
    const deadline = new Promise<Record<string, any>>((resolve) => {
      // eslint-disable-next-line homey-app/global-timers -- cleared when the bounded operation settles
      timer = setTimeout(() => {
        timedOut = true; this.revoke(); resolve(fail('read_timeout'));
      }, 10000);
    });
    const work = (async () => {
      try {
        if (body.action === 'open') {
          const reader = await this.factory();
          if (!live() || timedOut) {
            reader.close(); return fail('session_expired');
          }
          this.reader = reader; this.token = randomUUID(); this.startedAt = this.now(); this.lastRead = -Infinity;
          // eslint-disable-next-line homey-app/global-timers -- revocation and app shutdown clear this timer
          this.idleTimer = setTimeout(() => this.revoke(), 600000);
          this.idleTimer.unref?.();
          return {
            ...base, state: 'ready', reason: 'session_open', token: this.token,
          };
        }
        this.lastRead = now;
        if (body.action === 'catalog') {
          const devices = await this.reader!.list();
          if (!live() || timedOut) return fail('session_expired');
          return {
            ...base, state: 'ready', reason: 'catalog_ready', ...coordinationCatalog(devices),
          };
        }
        const bindings = normalizeCoordinationBindings(body.bindings);
        if (!bindings) return fail('bindings_invalid');
        if (body.action === 'validate') return { ...base, reason: 'bindings_valid', bindings };
        const devices = new Map<string, any>();
        for (const id of new Set(Object.values(bindings.sources).map((row) => row!.deviceId))) {
          if (!live() || timedOut) return fail('session_expired');
          // Only explicitly selected IDs, sequential and capped at five. Never enumerate to refresh values.
          const device = await this.reader!.read(id);
          if (!live() || timedOut) return fail('session_expired');
          devices.set(id, device);
        }
        return boundCoordinationView(bindings, devices, this.now(), this.token!, body.acknowledgements,
          body.previous, body.action === 'manual' ? 'manual' : 'homey', body.manual);
      } catch {
        if (live()) this.revoke();
        return fail('read_failed'); // Raw errors can include URLs/tokens/device details.
      } finally {
        if (timer) clearTimeout(timer);
        this.busy = false;
      }
    })();
    return Promise.race([work, deadline]);
  }
}

/** Created only after explicit opt-in request; retain only narrow read/close methods. */
export async function createHomeyCoordinationReader(homey: any): Promise<CoordinationReader> {
  const token = await homey.api.getOwnerApiToken();
  const base = new URL(await homey.api.getLocalUrl());
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash
    || typeof token !== 'string' || !token || /[\r\n]/.test(token)) throw new Error('Local API unavailable');
  const controller = new AbortController();
  const read = async (path: string) => {
    const url = new URL(base); url.pathname = path;
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!response.ok) throw new Error('Local API read unavailable');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Local API response unavailable');
    const parts: Buffer[] = []; let size = 0;
    try {
      let finished = false;
      while (!finished) {
        // eslint-disable-next-line no-await-in-loop
        const part = await reader.read();
        finished = part.done === true;
        if (finished) break;
        size += part.value.length;
        if (size > 4 * 1024 * 1024) {
          await reader.cancel(); throw new Error('Local API response too large');
        }
        parts.push(Buffer.from(part.value));
      }
      return JSON.parse(Buffer.concat(parts).toString('utf8'));
    } finally {
      reader.releaseLock();
    }
  };
  return {
    list: () => read('/api/manager/devices/device/'),
    read: (id: string) => {
      if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(id)) return Promise.reject(new Error('Invalid device selection'));
      return read(`/api/manager/devices/device/${encodeURIComponent(id)}`);
    },
    close: () => controller.abort(),
  };
}
