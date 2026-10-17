/** Explicit, bounded Homey reads only. No cloud/device commands, background polling or persisted telemetry. */
import { randomUUID } from 'crypto';
import { coordinationCatalog, normalizeCoordinationBindings, boundCoordinationView } from './coordinationBindings';

export interface CoordinationReader {
  list(): Promise<any>;
  read(id: string): Promise<any>;
  close(): void;
}
export interface CoordinationWorkspaceTimers {
  set(fn: () => void, ms: number): any;
  clear(timer: any): void;
}
const defaultTimers: CoordinationWorkspaceTimers = {
  // eslint-disable-next-line homey-app/global-timers -- bounded workspace timers are cancelled on revoke/shutdown
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (timer) => clearTimeout(timer),
};
export class CoordinationWorkspace {
  private reader: CoordinationReader | null = null;
  private token: string | null = null;
  private clientId: string | null = null;
  private idleTimer: any = null;
  private generation = 0;
  private operation: { cancel(reason: string): void } | null = null;
  private lastRead = -Infinity;
  private startedAt = 0;
  private lastNow = 0;
  private stopped = false;

  constructor(private readonly factory: (signal?: AbortSignal) => Promise<CoordinationReader>, private readonly now = () => Date.now(),
    private readonly timers: CoordinationWorkspaceTimers = defaultTimers) {
    this.lastNow = 0;
  }

  revoke(reason = 'session_expired'): void {
    this.generation += 1; this.token = null; this.clientId = null;
    const { operation } = this; this.operation = null;
    operation?.cancel(reason);
    if (this.idleTimer !== null) this.timers.clear(this.idleTimer);
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
    if (this.operation) return fail('busy');
    if (body.action !== 'open' && (!this.token || body.token !== this.token || now - this.startedAt >= 600000)) {
      if (this.token && now - this.startedAt >= 600000) this.revoke();
      return fail('session_expired');
    }
    if (!['open', 'validate'].includes(body.action) && now - this.lastRead < 2000) return fail('rate_limited');
    if (body.action === 'open') {
      this.revoke();
      this.clientId = typeof body.clientId === 'string' && /^[A-Za-z0-9-]{1,80}$/.test(body.clientId) ? body.clientId : null;
    }
    const epoch = this.generation;
    const controller = new AbortController();
    let timer: any;
    let cancel = (_reason: string) => {};
    const cancelled = new Promise<Record<string, any>>((resolve) => {
      cancel = (reason) => resolve(fail(reason));
    });
    const operation = {
      cancel: (reason: string) => {
        controller.abort();
        if (timer !== undefined) this.timers.clear(timer);
        cancel(reason);
      },
    };
    this.operation = operation;
    const live = () => !this.stopped && epoch === this.generation && this.operation === operation;
    timer = this.timers.set(() => {
      if (live()) this.revoke('read_timeout');
    }, 10000);
    const work = (async () => {
      try {
        if (body.action === 'open') {
          const reader = await this.factory(controller.signal);
          if (!live()) {
            reader.close(); return fail('session_expired');
          }
          this.reader = reader; this.token = randomUUID(); this.startedAt = this.now(); this.lastRead = -Infinity;
          this.idleTimer = this.timers.set(() => {
            if (epoch === this.generation) this.revoke();
          }, 600000);
          this.idleTimer?.unref?.();
          return {
            ...base, state: 'ready', reason: 'session_open', token: this.token,
          };
        }
        this.lastRead = now;
        if (body.action === 'catalog') {
          const devices = await this.reader!.list();
          if (!live()) return fail('session_expired');
          return {
            ...base, state: 'ready', reason: 'catalog_ready', ...coordinationCatalog(devices),
          };
        }
        const bindings = normalizeCoordinationBindings(body.bindings);
        if (!bindings) return fail('bindings_invalid');
        if (body.action === 'validate') return { ...base, reason: 'bindings_valid', bindings };
        const devices = new Map<string, any>();
        for (const id of new Set(Object.values(bindings.sources).map((row) => row!.deviceId))) {
          if (!live()) return fail('session_expired');
          // Only explicitly selected IDs, sequential and capped at five. Never enumerate to refresh values.
          const device = await this.reader!.read(id);
          if (!live()) return fail('session_expired');
          devices.set(id, device);
        }
        return boundCoordinationView(bindings, devices, this.now(), this.token!, body.acknowledgements,
          body.previous, body.action === 'manual' ? 'manual' : 'homey', body.manual);
      } catch {
        if (live()) this.revoke('read_failed');
        return fail('read_failed'); // Raw errors can include URLs/tokens/device details.
      } finally {
        if (timer !== undefined) this.timers.clear(timer);
        // An abandoned operation may finish after a new request has acquired the slot.
        if (this.operation === operation) this.operation = null;
      }
    })();
    return Promise.race([work, cancelled]);
  }
}

/** Created only after explicit opt-in request; retain only narrow read/close methods. */
export async function createHomeyCoordinationReader(homey: any, signal?: AbortSignal): Promise<CoordinationReader> {
  if (signal?.aborted) throw new Error('Local API reader closed');
  let token: string | null = await homey.api.getOwnerApiToken();
  if (signal?.aborted) {
    token = null; throw new Error('Local API reader closed');
  }
  const base = new URL(await homey.api.getLocalUrl());
  if (signal?.aborted) {
    token = null; throw new Error('Local API reader closed');
  }
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash
    || typeof token !== 'string' || !token || /[\r\n]/.test(token)) throw new Error('Local API unavailable');
  const controller = new AbortController();
  const close = () => {
    token = null; controller.abort(); signal?.removeEventListener('abort', close);
  };
  signal?.addEventListener('abort', close, { once: true });
  const read = async (path: string) => {
    if (!token || controller.signal.aborted) throw new Error('Local API reader closed');
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
    close,
  };
}
