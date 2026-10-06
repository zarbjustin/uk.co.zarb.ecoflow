'use strict';

import { decodeFrameHeaders } from './streamAc5000Protocol';

/** Capture-derived, read-only. No encoder, transport or control authority.
 * Source: shuette42/ecoflow-energy-ha, MIT, revision 6f3c327fcd3bc2cdd22b7c006bb4d19607ef7e61.
 * These are subscription-source settings, NOT verified whole-installation limits.
 */
export interface Stream5000Task {
  slot?: number;
  enabled: boolean;
  startMinute?: number;
  endMinute?: number;
  chargeW?: number;
  chargeTargetSoc?: number;
  dischargeW?: number;
}

export interface Stream5000Configuration {
  maxGridInputW?: number;
  maxGridOutputW?: number;
  outputCeilingObservedW?: number;
  mode?: 'self_powered' | 'intelligent_plus' | 'custom' | null;
  backupSocketEnabled?: boolean;
  backupReserveEnabled?: boolean;
  backupReservePct?: number;
  maxChargeSocPct?: number;
  minDischargeSocPct?: number;
  tasks?: Stream5000Task[];
}

interface Field { number: number; wire: number; value: number | Buffer }
const MAX_FRAME_BYTES = 256 * 1024;
const MAX_TASKS = 32;
const STALE_AFTER_MS = 20 * 60 * 1000;

function varint(buffer: Buffer, start: number): { value: bigint; next: number } {
  let value = 0n;
  for (let index = 0; index < 10; index += 1) {
    const position = start + index;
    if (position >= buffer.length) throw new RangeError('truncated varint');
    const byte = buffer[position];
    if (index === 9 && byte > 1) throw new RangeError('oversized varint');
    value |= BigInt(byte & 127) << BigInt(index * 7);
    if (!(byte & 128)) return { value, next: position + 1 };
  }
  throw new RangeError('oversized varint');
}

function fields(buffer: Buffer): Field[] {
  const result: Field[] = [];
  let position = 0;
  while (position < buffer.length) {
    const tag = varint(buffer, position);
    const number = Number(tag.value >> 3n);
    const wire = Number(tag.value & 7n);
    if (!number || number > 536870911) throw new RangeError('invalid field');
    position = tag.next;
    if (wire === 0) {
      const scalar = varint(buffer, position);
      if (scalar.value > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('unsafe scalar');
      result.push({ number, wire, value: Number(scalar.value) });
      position = scalar.next;
    } else {
      let length: number;
      if (wire === 2) {
        const size = varint(buffer, position);
        if (size.value > BigInt(buffer.length)) throw new RangeError('invalid size');
        length = Number(size.value);
        position = size.next;
      } else if (wire === 5) length = 4;
      else if (wire === 1) length = 8;
      else throw new RangeError('unsupported wire');
      if (position + length > buffer.length) throw new RangeError('truncated field');
      result.push({ number, wire, value: buffer.subarray(position, position + length) });
      position += length;
    }
  }
  return result;
}

function child(list: Field[], number: number): Field[] | undefined {
  const field = list.find((entry) => entry.number === number);
  if (!field) return undefined;
  if (field.wire !== 2 || !Buffer.isBuffer(field.value)) throw new RangeError('invalid group');
  return fields(field.value);
}

function integer(list: Field[], number: number, max = 100000): number | undefined {
  // Decoder sanity bound, NEVER an approved electrical/control limit.
  const field = list.find((entry) => entry.number === number);
  if (!field) return undefined;
  if (field.wire !== 0 || typeof field.value !== 'number' || field.value > max) throw new RangeError('invalid scalar');
  return field.value;
}

function taskList(list: Field[]): Stream5000Task[] | undefined {
  const containers = list.filter((entry) => entry.number === 40);
  if (!containers.length) return undefined; // delta: unchanged
  if (containers.length !== 1) throw new RangeError('ambiguous task lists');
  const tasks = child(list, 40)!;
  if (tasks.length > MAX_TASKS || tasks.some((field) => field.number !== 1 || field.wire !== 2)) {
    throw new RangeError('unknown task list');
  }
  return tasks.map((field) => {
    const task = fields(field.value as Buffer);
    const charge = child(task, 8);
    const chargeSettings = charge ? child(charge, 3) : undefined;
    const discharge = child(task, 9);
    if ((!chargeSettings && !discharge) || (chargeSettings && discharge)) throw new RangeError('unknown task kind');
    const result: Stream5000Task = { enabled: (integer(task, 3, 1) ?? 0) === 1 };
    const slot = integer(task, 2);
    if (slot !== undefined) result.slot = slot;
    const window = task.find((entry) => entry.number === 7);
    if (window) {
      if (window.wire !== 2 || !Buffer.isBuffer(window.value) || !window.value.length) throw new RangeError('invalid window');
      const packed = varint(window.value, 0);
      if (packed.next !== window.value.length || packed.value > 0xffffffffn) throw new RangeError('invalid window');
      result.startMinute = Number(packed.value & 65535n);
      result.endMinute = Number(packed.value >> 16n);
      if (result.startMinute > 1439 || result.endMinute > 1439) throw new RangeError('invalid minutes');
    }
    if (chargeSettings) {
      result.chargeW = integer(chargeSettings, 3) ?? 0; // present container + absent scalar = explicit zero
      const soc = integer(chargeSettings, 2, 100);
      if (soc !== undefined) result.chargeTargetSoc = soc;
    }
    if (discharge) result.dischargeW = integer(discharge, 1) ?? 0;
    return result;
  });
}

/** Reject foreign headers, writes/acks and malformed messages; preserve valid bundle siblings. */
export function parseStream5000Configuration(frame: Buffer, expectedSerial: string): Stream5000Configuration[] {
  if (!/^ES2[12][A-Z0-9]{4,60}$/i.test(expectedSerial) || frame.length > MAX_FRAME_BYTES) return [];
  try {
    return decodeFrameHeaders(frame).flatMap((header) => {
      if (header.deviceSn && header.deviceSn.toUpperCase() !== expectedSerial.toUpperCase()) return [];
      if (!header.pdata) return [];
      if (!(header.cmdFunc === 254 && header.cmdId === 39) && !(header.cmdFunc === 32 && header.cmdId === 2)) return [];
      try {
        const list = fields(header.pdata);
        const result: Stream5000Configuration = {};
        const put = (key: keyof Stream5000Configuration, value: number | undefined) => {
          if (value !== undefined) Object.assign(result, { [key]: value });
        };
        if (header.cmdFunc === 32) {
          const limits = child(list, 1);
          if (limits) {
            put('maxChargeSocPct', integer(limits, 7, 100));
            put('minDischargeSocPct', integer(limits, 21, 100));
          }
        } else {
          const grid = child(list, 10);
          if (grid) {
            put('maxGridOutputW', integer(grid, 1));
            put('maxGridInputW', integer(grid, 2));
            put('outputCeilingObservedW', integer(grid, 6));
          }
          const mode = integer(list, 25);
          if (mode !== undefined) result.mode = (['self_powered', 'intelligent_plus', 'custom'] as const)[mode] ?? null;
          const socket = child(list, 19);
          if (socket) result.backupSocketEnabled = (integer(socket, 1, 1) ?? 0) === 1;
          const reserve = child(list, 30);
          if (reserve) {
            result.backupReserveEnabled = (integer(reserve, 1, 1) ?? 0) === 1;
            put('backupReservePct', integer(reserve, 2, 100));
          }
          const tasks = taskList(list);
          if (tasks !== undefined) result.tasks = tasks;
        }
        return Object.keys(result).length ? [result] : [];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

/** Receipt order only: no trustworthy device revision is available to establish cloud ordering.
 * Session-only, per-field age; no restored settings masquerade as live readback after restart.
 */
export class Stream5000ConfigurationTracker {
  private readonly entries = new Map<string, { value: unknown; at: number }>();
  private readonly serial: string;

  constructor(serial: string) {
    this.serial = serial;
  }

  observe(frame: Buffer, receivedAt: number): void {
    if (!Number.isFinite(receivedAt) || receivedAt < 0) return;
    for (const update of parseStream5000Configuration(frame, this.serial)) {
      for (const [key, value] of Object.entries(update)) {
        if (receivedAt < (this.entries.get(key)?.at ?? -1)) continue;
        this.entries.set(key, { value, at: receivedAt });
      }
    }
  }

  snapshot(now = Date.now()): Record<string, unknown> {
    return {
      source: 'captured_app_protocol',
      scope: 'subscription_source',
      ordering: 'receipt_only',
      controlsEnabled: false,
      values: Object.fromEntries([...this.entries].map(([key, entry]) => [key, {
        value: JSON.parse(JSON.stringify(entry.value)),
        ageSec: Math.max(0, Math.floor((now - entry.at) / 1000)),
        stale: entry.at > now || now - entry.at > STALE_AFTER_MS,
      }])),
    };
  }
}

/** Explicit privacy projection even for unexpected/custom device getter results. */
export function stream5000ConfigurationSnapshot(input: any): Record<string, unknown> | null {
  if (!input || input.source !== 'captured_app_protocol' || !input.values) return null;
  const values: Record<string, unknown> = {};
  const numeric = ['maxGridInputW', 'maxGridOutputW', 'outputCeilingObservedW',
    'backupReservePct', 'maxChargeSocPct', 'minDischargeSocPct'];
  const boolean = ['backupSocketEnabled', 'backupReserveEnabled'];
  for (const key of [...numeric, ...boolean, 'mode', 'tasks']) {
    const entry = input.values[key];
    if (!entry || !Number.isFinite(entry.ageSec) || entry.ageSec < 0) continue;
    let value: unknown;
    if (numeric.includes(key)) {
      const max = key.endsWith('Pct') ? 100 : 100000;
      if (!Number.isSafeInteger(entry.value) || entry.value < 0 || entry.value > max) continue;
      value = entry.value;
    } else if (boolean.includes(key)) {
      if (typeof entry.value !== 'boolean') continue;
      value = entry.value;
    } else if (key === 'mode') {
      if (entry.value !== null && !['self_powered', 'intelligent_plus', 'custom'].includes(entry.value)) continue;
      value = entry.value;
    } else {
      if (!Array.isArray(entry.value) || entry.value.length > MAX_TASKS) continue;
      const tasks: Record<string, unknown>[] = [];
      let valid = true;
      for (const task of entry.value) {
        if (!task || typeof task.enabled !== 'boolean') {
          valid = false; break;
        }
        const projected: Record<string, unknown> = { enabled: task.enabled };
        for (const field of ['slot', 'startMinute', 'endMinute', 'chargeW', 'dischargeW', 'chargeTargetSoc']) {
          if (task[field] === undefined) continue;
          let max = 100000;
          if (field.endsWith('Minute')) max = 1439;
          if (field === 'chargeTargetSoc') max = 100;
          if (!Number.isSafeInteger(task[field]) || task[field] < 0 || task[field] > max) {
            valid = false; break;
          }
          projected[field] = task[field];
        }
        if (!valid) break;
        tasks.push(projected);
      }
      if (!valid) continue;
      value = tasks;
    }
    values[key] = { value, ageSec: Math.floor(entry.ageSec), stale: entry.stale === true || entry.ageSec * 1000 > STALE_AFTER_MS };
  }
  return {
    source: 'captured_app_protocol', scope: 'subscription_source', ordering: 'receipt_only', controlsEnabled: false, values,
  };
}
