import { AppDevice } from './appDevices';
import { decodeFrameHeaders } from './streamAc5000Protocol';

export const DUAL_CT_CAPTURE_MS = 120000;
const MAX_FRAMES = 128;
const MAX_SHAPES = 16;

export function dualCtResearchSnapshot(input: any): Record<string, unknown> {
  const bounded = (value: any, max: number) => (Number.isInteger(value) && value >= 0 && value <= max ? value : 0);
  const statuses = ['not_started', 'discovering', 'listening', 'stopped', 'complete', 'sample_limit',
    'account_changed', 'no_explicit_model', 'transport_unavailable', 'discovery_unavailable'];
  return {
    status: statuses.includes(input?.status) ? input.status : 'not_started',
    source: 'manual_app_account_discovery',
    captureWindowSec: 120,
    captureAgeSec: typeof input?.captureAgeSec === 'number' && Number.isFinite(input.captureAgeSec)
      && input.captureAgeSec >= 0 ? input.captureAgeSec : null,
    completed: input?.completed === true,
    deviceCount: bounded(input?.deviceCount, 2),
    frames: bounded(input?.frames, MAX_FRAMES),
    rejectedFrames: bounded(input?.rejectedFrames, MAX_FRAMES),
    shapes: Array.isArray(input?.shapes) ? input.shapes.slice(0, MAX_SHAPES).map((shape: any) => ({
      deviceIndex: bounded(shape?.deviceIndex, 1),
      cmdFunc: bounded(shape?.cmdFunc, 65535),
      cmdId: bounded(shape?.cmdId, 65535),
      fields: Array.isArray(shape?.fields) ? shape.fields.slice(0, 32).filter((field: any) => Number.isInteger(field?.field) && field.field > 0 && field.field <= 536870911
        && [0, 1, 2, 5].includes(field?.wire)).map((field: any) => ({ field: field.field, wire: field.wire })) : [],
    })) : [],
    channelMapping: 'unverified',
    valuesCaptured: false,
    pairingEnabled: false,
    contributesToEnergy: false,
    controlsEnabled: false,
  };
}

/** Product metadata only. Never admit a renamed legacy meter or guess a prefix. */
export function dualCtResearchDevices(devices: AppDevice[]): AppDevice[] {
  const seen = new Set<string>();
  return devices.slice(0, 256).filter((device) => {
    const name = device.productName?.trim().replace(/[-_\s]+/g, ' ').toUpperCase();
    if (!/^(?:ECOFLOW )?SMART METER DUAL CT$/.test(name || '') || device.shared
      || !/^[A-Z0-9]{8,64}$/.test(device.sn) || seen.has(device.sn)) return false;
    seen.add(device.sn);
    return true;
  }).slice(0, 2);
}

/** No payload values, strings, serials, raw frames or recursively guessed messages. */
function fields(data: Buffer): Array<{ field: number; wire: number }> {
  let pos = 0;
  const out: Array<{ field: number; wire: number }> = [];
  const integer = (): bigint => {
    let value = 0n;
    for (let i = 0; i < 10; i += 1) {
      if (pos >= data.length) throw new Error('invalid');
      const byte = data[pos++];
      if (i === 9 && byte > 1) throw new Error('invalid');
      value |= BigInt(byte & 127) << BigInt(i * 7);
      if (!(byte & 128)) return value;
    }
    throw new Error('invalid');
  };
  while (pos < data.length) {
    const tag = Number(integer());
    if (!Number.isSafeInteger(tag) || tag < 8 || tag > 0xffffffff) throw new Error('invalid');
    const field = Math.floor(tag / 8); const wire = tag % 8;
    if (wire === 0) integer();
    else {
      const size = wire === 2 ? Number(integer()) : ({ 1: 8, 5: 4 } as Record<number, number>)[wire];
      if (!Number.isSafeInteger(size) || size < 0 || pos + size > data.length) throw new Error('invalid');
      pos += size;
    }
    if (out.length < 32 && !out.some((item) => item.field === field && item.wire === wire)) out.push({ field, wire });
  }
  return out;
}

interface ResearchHooks {
  list: () => Promise<AppDevice[]>;
  subscribe: (sn: string, handler: (data: Buffer, topic: string) => void) => Promise<boolean>;
  unsubscribe: (sn: string, handler: (data: Buffer, topic: string) => void) => void;
  timer: (callback: () => void, ms: number) => unknown;
  cancel: (timer: any) => void;
  now?: () => number;
}

export class DualCtResearch {
  private generation = 0;
  private timer: unknown = null;
  private bindings: Array<{ sn: string; handler: (data: Buffer, topic: string) => void }> = [];
  private startedAt: number | null = null;
  private endedAt: number | null = null;
  private status = 'not_started';
  private deviceCount = 0;
  private frames = 0;
  private rejected = 0;
  private shapes: Array<{ deviceIndex: number; cmdFunc: number; cmdId: number; fields: Array<{ field: number; wire: number }> }> = [];

  private readonly hooks: ResearchHooks;

  constructor(hooks: ResearchHooks) {
    this.hooks = hooks;
  }

  private now(): number {
    return (this.hooks.now || Date.now)();
  }

  stop(status = 'stopped', clear = false): void {
    this.generation += 1;
    if (this.timer !== null) this.hooks.cancel(this.timer);
    this.timer = null;
    for (const binding of this.bindings) this.hooks.unsubscribe(binding.sn, binding.handler);
    this.bindings = [];
    this.status = status;
    this.endedAt = this.startedAt === null ? null : this.now();
    if (clear) {
      this.startedAt = null; this.endedAt = null; this.deviceCount = 0;
      this.frames = 0; this.rejected = 0; this.shapes = [];
    }
  }

  async start(): Promise<void> {
    if (['discovering', 'listening'].includes(this.status)) return;
    this.stop('discovering', true);
    const { generation } = this;
    this.startedAt = this.now(); this.endedAt = null;
    this.timer = this.hooks.timer(() => this.stop('complete'), DUAL_CT_CAPTURE_MS);
    try {
      const devices = dualCtResearchDevices(await this.hooks.list());
      if (generation !== this.generation) return;
      this.deviceCount = devices.length;
      if (!devices.length) {
        this.stop('no_explicit_model'); return;
      }
      this.status = 'listening';
      for (const [deviceIndex, device] of devices.entries()) {
        const handler = (data: Buffer, topic: string) => {
          if (generation !== this.generation) return;
          if (this.now() < this.startedAt! || this.now() - this.startedAt! >= DUAL_CT_CAPTURE_MS) {
            this.stop('complete'); return;
          }
          // Cached get-replies are not fresh measurements. Only exact live property topics.
          if (topic !== `/app/device/property/${device.sn}` || !Buffer.isBuffer(data)) return;
          if (this.frames >= MAX_FRAMES) {
            this.stop('sample_limit'); return;
          }
          this.frames += 1;
          if (data.length > 65536) {
            this.rejected += 1; return;
          }
          try {
            const headers = decodeFrameHeaders(data);
            if (!headers.length || headers.length > 16) throw new Error('invalid');
            const candidates = headers.map((header) => {
              if (!header.pdata || !Number.isInteger(header.cmdFunc) || !Number.isInteger(header.cmdId)
                || header.cmdFunc < 0 || header.cmdFunc > 65535 || header.cmdId < 0 || header.cmdId > 65535
                || (header.deviceSn && header.deviceSn !== device.sn)) throw new Error('invalid');
              return {
                deviceIndex, cmdFunc: header.cmdFunc, cmdId: header.cmdId, fields: fields(header.pdata),
              };
            });
            for (const shape of candidates) {
              if (this.shapes.length < MAX_SHAPES && !this.shapes.some((item) => JSON.stringify(item) === JSON.stringify(shape))) {
                this.shapes.push(shape);
              }
            }
          } catch {
            this.rejected += 1;
          }
        };
        this.bindings.push({ sn: device.sn, handler });
        // eslint-disable-next-line no-await-in-loop
        const attached = await this.hooks.subscribe(device.sn, handler);
        if (generation !== this.generation) {
          if (attached) this.hooks.unsubscribe(device.sn, handler);
          return;
        }
        if (!attached) {
          this.stop('transport_unavailable'); return;
        }
      }
    } catch {
      if (generation === this.generation) this.stop('discovery_unavailable');
    }
  }

  snapshot(): Record<string, unknown> {
    const age = this.startedAt === null || this.now() < this.startedAt ? null : (this.now() - this.startedAt) / 1000;
    return {
      status: this.status,
      source: 'manual_app_account_discovery',
      captureWindowSec: DUAL_CT_CAPTURE_MS / 1000,
      captureAgeSec: age,
      completed: this.endedAt !== null,
      deviceCount: this.deviceCount,
      frames: this.frames,
      rejectedFrames: this.rejected,
      shapes: this.shapes.map((shape) => ({ ...shape, fields: shape.fields.map((field) => ({ ...field })) })),
      channelMapping: 'unverified',
      valuesCaptured: false,
      pairingEnabled: false,
      contributesToEnergy: false,
      controlsEnabled: false,
    };
  }
}
