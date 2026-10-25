'use strict';

import { decodeFrameHeaders } from './streamAc5000Protocol';

/** Preparation only. No setting/API/Flow can enable or start this observer. */
export const STREAM_5000_TIME_OBSERVER_RUNTIME_ENABLED = false;
export const STREAM_5000_TIME_OBSERVER_LIMITS = Object.freeze({
  captureMs: 120000,
  retentionMs: 600000, // From explicit start, not extended by receipts or reads.
  frameBytes: 16384,
  inputBytes: 2097152,
  inspectedFrames: 512,
  samples: 64,
  rows: 2048,
  rowsPerHeader: 48,
  headersPerFrame: 8,
  parsedFieldsPerFrame: 1024,
  sampleIntervalMs: 5000, // Per command; unrelated packets do not renew it.
});

type State = 'disabled' | 'idle' | 'collecting' | 'complete' | 'expired' | 'stopped';
type Reason = 'time_limit' | 'input_limit' | 'frame_limit' | 'sample_limit' | 'row_limit'
  | 'clock_reset' | 'retention_expired' | 'closed' | null;
type Field = { number: number; wire: number; bytes?: Buffer; value?: number };
type Row = { path: string; wire: number; value: number; structuralScope: string };
type Sample = { receivedAt: number; command: string; fields: Row[]; truncated: boolean };
const MAX_SCALAR = 31536000; // Sanity bound only, NOT a duration unit/range contract.

function readVarint(bytes: Buffer, at: number): { value: bigint; next: number } {
  let value = 0n;
  for (let index = 0; index < 10; index += 1) {
    const position = at + index;
    if (position >= bytes.length || (index === 9 && bytes[position] > 1)) throw new RangeError('invalid scalar');
    value |= BigInt(bytes[position] & 127) << BigInt(index * 7);
    if (!(bytes[position] & 128)) return { value, next: position + 1 };
  }
  throw new RangeError('invalid scalar');
}

/** Parse only declared levels; never recurse into strings, packed arrays or arbitrary bytes. */
function fields(bytes: Buffer, budget: { remaining: number }): Field[] {
  const result: Field[] = [];
  let position = 0;
  while (position < bytes.length) {
    budget.remaining -= 1;
    if (budget.remaining < 0) throw new RangeError('field budget');
    const tag = readVarint(bytes, position);
    const number = Number(tag.value >> 3n);
    const wire = Number(tag.value & 7n);
    if (number < 1 || number > 536870911) throw new RangeError('invalid field');
    position = tag.next;
    const entry: Field = { number, wire };
    if (wire === 0) {
      const scalar = readVarint(bytes, position);
      const signed = scalar.value >= (1n << 63n) ? scalar.value - (1n << 64n) : scalar.value;
      if (signed >= BigInt(-Number.MAX_SAFE_INTEGER) && signed <= BigInt(Number.MAX_SAFE_INTEGER)) entry.value = Number(signed);
      position = scalar.next;
    } else {
      let size: number;
      if (wire === 2) {
        const length = readVarint(bytes, position);
        if (length.value > BigInt(bytes.length)) throw new RangeError('invalid length');
        size = Number(length.value);
        position = length.next;
      } else if (wire === 5) size = 4;
      else if (wire === 1) size = 8;
      else throw new RangeError('unsupported wire');
      if (position + size > bytes.length) throw new RangeError('truncated field');
      if (wire === 2) entry.bytes = bytes.subarray(position, position + size);
      else entry.value = wire === 5 ? bytes.readFloatLE(position) : bytes.readDoubleLE(position);
      position += size;
    }
    result.push(entry);
  }
  return result;
}

function unique(list: Field[], number: number): Field | undefined {
  const matches = list.filter((entry) => entry.number === number);
  if (matches.length > 1) throw new RangeError('ambiguous field');
  return matches[0];
}

function scalars(list: Field[], prefix: string, scope: string, allowed: readonly number[]): Row[] {
  return allowed.flatMap((number) => {
    const entry = unique(list, number);
    if (!entry || ![0, 1, 5].includes(entry.wire) || typeof entry.value !== 'number'
      || !Number.isFinite(entry.value) || Math.abs(entry.value) > MAX_SCALAR) return [];
    return [{
      path: `${prefix}${number}`, wire: entry.wire, value: entry.value, structuralScope: scope,
    }];
  });
}

const RANGE_1_16 = Object.freeze(Array.from({ length: 16 }, (_value, index) => index + 1));
const RANGE_2_12 = Object.freeze(Array.from({ length: 11 }, (_value, index) => index + 2));
const RANGE_1_32 = Object.freeze(Array.from({ length: 32 }, (_value, index) => index + 1));
const BMS_FIELDS = Object.freeze([7, 8, 9, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26]);

/** These are structural candidates, NOT a mapping to minutes, seconds or either native display. */
function candidateRows(pdata: Buffer, command: string, serial: string, budget: { remaining: number }): Row[] {
  const root = fields(pdata, budget);
  if (command === '32/50') return scalars(root, 'f', 'source_bms_message', BMS_FIELDS);
  if (command === '32/2') {
    const group = unique(root, 1);
    return group?.wire === 2 && group.bytes
      ? scalars(fields(group.bytes, budget), 'f1.', 'source_cms_message', RANGE_1_32) : [];
  }
  const rows: Row[] = [];
  // f44 is a separate source pack-summary candidate, not a replacement for
  // BMS telemetry or proof of the expanded panel's timer/temperature source.
  for (const number of [11, 33, 44]) {
    const group = unique(root, number);
    if (group?.wire === 2 && group.bytes) {
      rows.push(...scalars(fields(group.bytes, budget),
        `f${number}.`, `node_${number}`, RANGE_1_16));
    }
  }
  for (const number of [50, 54]) {
    const group = unique(root, number);
    if (group?.wire !== 2 || !group.bytes) continue;
    let ownEntries = 0;
    for (const entry of fields(group.bytes, budget).filter((field) => field.number === 1 && field.wire === 2 && field.bytes)) {
      const unit = fields(entry.bytes!, budget);
      const identity = unique(unit, 1);
      // Exact bytes only: never decode/export a serial, peer record, module name or text.
      if (identity?.wire !== 2 || !identity.bytes?.equals(Buffer.from(serial))) continue;
      ownEntries += 1;
      if (ownEntries > 1) throw new RangeError('ambiguous unit record');
      rows.push(...scalars(unit, `f${number}.1.`, `matching_${number}_record`, RANGE_2_12));
    }
  }
  return rows;
}

/** Session-only, explicit-start research. No transport, encoder, persistence or telemetry writes. */
export class Stream5000TimeObserver {
  private state: State;
  private reason: Reason = null;
  private startedAt = 0;
  private lastNow = 0;
  private inspected = 0;
  private inputBytes = 0;
  private rejected = 0;
  private rowCount = 0;
  private samples: Sample[] = [];
  private readonly sampledAt = new Map<string, number>();

  constructor(private readonly serial: string,
    enabled: boolean = STREAM_5000_TIME_OBSERVER_RUNTIME_ENABLED,
    private readonly clock: () => number = Date.now) {
    this.state = enabled === true && /^ES2[12][A-Z0-9]{4,60}$/.test(serial) ? 'idle' : 'disabled';
  }

  /** Future activation needs separate owner consent/integration. Never called by current runtime. */
  start(): boolean {
    if (this.state !== 'idle') return false;
    let now: number;
    try {
      now = this.clock();
    } catch {
      return false;
    }
    if (!Number.isSafeInteger(now) || now <= 0 || now > 8640000000000000 - STREAM_5000_TIME_OBSERVER_LIMITS.retentionMs) return false;
    this.startedAt = now;
    this.lastNow = now;
    this.state = 'collecting';
    return true;
  }

  private purge(state: State, reason: Reason): void {
    this.samples = [];
    this.sampledAt.clear();
    this.rowCount = 0;
    this.startedAt = 0;
    this.lastNow = 0;
    this.state = state;
    this.reason = reason;
  }

  /** Lazy TTL on reads/receipts, also called by the existing device watchdog. No extra timer. */
  tick(): void {
    if (!['collecting', 'complete'].includes(this.state)) return;
    let now: number;
    try {
      now = this.clock();
    } catch {
      this.purge('expired', 'clock_reset');
      return;
    }
    if (!Number.isSafeInteger(now) || now < this.lastNow) {
      this.purge('expired', 'clock_reset');
      return;
    }
    this.lastNow = now;
    const elapsed = now - this.startedAt;
    if (elapsed >= STREAM_5000_TIME_OBSERVER_LIMITS.retentionMs) this.purge('expired', 'retention_expired');
    else if (this.state === 'collecting' && elapsed >= STREAM_5000_TIME_OBSERVER_LIMITS.captureMs) this.finish('time_limit');
  }

  private finish(reason: Reason): void {
    this.state = 'complete';
    this.reason = reason;
  }

  observe(payload: Buffer, topic: string): void {
    if (this.state !== 'collecting') {
      this.tick(); return;
    }
    this.tick();
    if (this.state !== 'collecting') return;
    // Admit reports/get replies on this subscription only. Never set/get requests or acks.
    if (typeof topic !== 'string' || topic.length > 256) return;
    const parts = topic.split('/');
    const ownProperty = parts.length === 5 && parts[1] === 'app' && parts[2] === 'device'
      && parts[3] === 'property' && parts[4] === this.serial;
    const ownReply = parts.length === 7 && parts[1] === 'app' && Boolean(parts[2])
      && parts[3] === this.serial && parts[4] === 'thing' && parts[5] === 'property' && parts[6] === 'get_reply';
    if (!ownProperty && !ownReply) return;
    if (!Buffer.isBuffer(payload)) return;
    const limits = STREAM_5000_TIME_OBSERVER_LIMITS;
    if (this.inspected >= limits.inspectedFrames) {
      this.finish('frame_limit'); return;
    }
    this.inspected += 1;
    if (payload.length > limits.frameBytes || !payload.length) {
      this.rejected += 1;
      if (this.inspected >= limits.inspectedFrames) this.finish('frame_limit');
      return;
    }
    if (this.inputBytes + payload.length > limits.inputBytes) {
      this.finish('input_limit'); return;
    }
    this.inputBytes += payload.length;
    const now = this.lastNow;
    try {
      const headers = decodeFrameHeaders(payload);
      if (headers.length > limits.headersPerFrame) throw new RangeError('header limit');
      const budget = { remaining: limits.parsedFieldsPerFrame };
      const captured = new Set<string>();
      for (const header of headers) {
        const command = `${header.cmdFunc}/${header.cmdId}`;
        if (!['254/39', '32/2', '32/50'].includes(command) || header.candidateHeaderValid === false
          || (header.encType !== undefined && header.encType !== 0)
          || (header.deviceSn !== undefined && header.deviceSn !== this.serial) || !header.pdata) continue;
        const last = this.sampledAt.get(command);
        if (last !== undefined && now - last < limits.sampleIntervalMs) continue;
        try {
          const rows = candidateRows(header.pdata, command, this.serial, budget);
          if (!rows.length) continue;
          const capacity = Math.min(limits.rowsPerHeader, limits.rows - this.rowCount);
          const selected = rows.slice(0, capacity);
          if (selected.length === 0) {
            this.finish('row_limit'); break;
          }
          this.samples.push({
            receivedAt: now, command, fields: selected, truncated: rows.length > selected.length,
          });
          this.rowCount += selected.length;
          captured.add(command);
          if (this.rowCount >= limits.rows) {
            this.finish('row_limit'); break;
          }
          if (this.samples.length >= limits.samples) {
            this.finish('sample_limit'); break;
          }
        } catch {
          this.rejected += 1;
        } // Malformed siblings never affect production decoding.
      }
      for (const command of captured) this.sampledAt.set(command, now);
    } catch {
      this.rejected += 1;
    }
    if (this.state === 'collecting' && this.inspected >= limits.inspectedFrames) this.finish('frame_limit');
  }

  status(): Record<string, unknown> {
    this.tick();
    return {
      status: this.state,
      reason: this.reason,
      inspectedFrames: this.inspected,
      inputBytes: this.inputBytes,
      rejectedFrames: this.rejected,
      retainedSamples: this.samples.length,
      retainedRows: this.rowCount,
      controlsEnabled: false,
      energyContribution: false,
      durationMapped: false,
      automaticStart: false,
      limits: { ...STREAM_5000_TIME_OBSERVER_LIMITS },
    };
  }

  /** Explicit private/local retrieval only. NOT called by support reports, logs, Flows or Insights. */
  readEvidence(): Record<string, unknown> {
    this.tick();
    return {
      source: 'passive_existing_app_subscription',
      receiptOnly: true,
      historicalCandidates: true,
      durationUnitsVerified: false,
      nativeDisplayScopeVerified: false,
      samples: this.samples.map((sample) => ({ ...sample, fields: sample.fields.map((field) => ({ ...field })) })),
    };
  }

  close(): void {
    this.purge(this.state === 'disabled' ? 'disabled' : 'stopped', 'closed');
  }
}
