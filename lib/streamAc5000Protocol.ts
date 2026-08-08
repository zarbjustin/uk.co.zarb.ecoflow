'use strict';

/**
 * EXPERIMENTAL — protobuf telemetry parser for the EcoFlow STREAM AC 5000 (ES22).
 *
 * Despite the shared product name this is NOT the BK-series STREAM protocol:
 * an ES22 sends no `254/21` frame, its telemetry rides on `254/39`, and it
 * nests power readings where the BK series uses flat scalars. The only frame
 * the two families share is the `32/50` BMS heartbeat.
 *
 * Ported from the MIT-licensed https://github.com/shuette42/ecoflow-energy-ha
 * (`ecoflow/proto/decoder.py`, `ecoflow/parsers/stream_ac5000_proto.py`), whose
 * field map was derived from captures of live ES22 hardware. Only the subset of
 * fields that project verified against hardware or the EcoFlow app is mapped
 * here — nothing is inferred or guessed.
 *
 * This module is pure: no network, no Homey APIs, no logging.
 */

type ScalarType = 'int' | 'float';

interface FieldSpec {
  key: string;
  type: ScalarType;
  scale: number;
}

interface FieldNode {
  [fieldNumber: number]: FieldNode | FieldSpec;
}

/** `f11` node totals arrive in half-watt units. */
const HALF_WATT = 0.5;
const FLOAT_ZERO_EPS = 1e-6;

const HEADER_PDATA = 1;
const HEADER_CMD_FUNC = 8;
const HEADER_CMD_ID = 9;
const HEADER_DEVICE_SN = 25;

/**
 * cmd_func/cmd_id → dotted field path → mapping.
 *
 * A path is only followed where it is declared, which keeps the walker out of
 * length-delimited fields that are not submessages (timezone strings, packed
 * cell-voltage arrays).
 *
 * Keys prefixed with `_` are intermediates consumed by {@link finalize}.
 */
const FIELD_MAP: Record<string, Record<string, FieldSpec>> = {
  '254/39': {
    // --- node totals (half-watt) ---
    'f11.1': { key: 'homeW', type: 'float', scale: HALF_WATT },
    'f11.5': { key: 'socPct', type: 'int', scale: 1 },
    // Watts, not half-watts. Absent on units with no PV wired to the EcoFlow.
    'f11.9': { key: 'solarW', type: 'float', scale: 1 },
    // --- flow matrix edges (watts) ---
    'f12.4': { key: 'homeFromBattW', type: 'float', scale: 1 },
    'f12.5': { key: '_battToGridW', type: 'float', scale: 1 },
    'f12.6': { key: 'homeFromGridW', type: 'float', scale: 1 },
    'f12.7': { key: '_gridToBattW', type: 'float', scale: 1 },
    // `12.8` (solar → home) is deliberately NOT mapped: it appears in no
    // capture, so its position is inferred rather than shown.
    'f12.9': { key: '_solarToBattW', type: 'float', scale: 1 },
    'f12.10': { key: '_solarToGridW', type: 'float', scale: 1 },
    // --- meter block: Tibber Pulse variant ---
    'f15.3': { key: '_meterNetW', type: 'float', scale: 1 },
    // --- meter block: EcoFlow P1 variant (a unit reports one or the other) ---
    'f16.16': { key: '_meterNetW', type: 'float', scale: 1 },
    // --- precise state of charge ---
    'f33.6': { key: 'socPrecisePct', type: 'float', scale: 1 },
  },
  '32/2': {
    'f1.7': { key: 'maxChargeSocPct', type: 'int', scale: 1 },
    'f1.21': { key: 'minDischargeSocPct', type: 'int', scale: 1 },
  },
  // BMS heartbeat — same field numbers as the BK-series STREAM.
  '32/50': {
    f7: { key: '_battVoltageMv', type: 'int', scale: 1 },
    f8: { key: '_bmsCurrentMa', type: 'int', scale: 1 },
    f9: { key: 'battTempC', type: 'int', scale: 1 },
    f15: { key: 'bmsSohPct', type: 'int', scale: 1 },
  },
};

/**
 * Paths whose absence inside a *present* parent group decodes as zero.
 *
 * This reads proto3 rather than inventing a value: an omitted scalar in a
 * message that was sent is zero by definition. Without it an idle battery edge
 * would report its last power forever. An absent group means "unchanged".
 */
const ZERO_FILL_PATHS: Record<string, string[]> = {
  '254/39': ['f11.9', 'f12.4', 'f12.5', 'f12.6', 'f12.7'],
};

function cmdKey(cmdFunc: number, cmdId: number): string {
  return `${cmdFunc}/${cmdId}`;
}

/** `'f12.4'` → `[12, 4]`. The `f` prefix keeps the map keys readable. */
function pathParts(path: string): number[] {
  return path.replace(/^f/, '').split('.').map((part) => Number(part));
}

/** `'f12.4'` → `'12'`: the group whose presence enables zero-filling. */
function groupOf(path: string): string {
  return pathParts(path).slice(0, -1).join('.');
}

function compile(fieldMap: Record<string, FieldSpec>): FieldNode {
  const root: FieldNode = {};
  for (const [path, spec] of Object.entries(fieldMap)) {
    const parts = pathParts(path);
    let node = root;
    for (const part of parts.slice(0, -1)) {
      const child = node[part];
      if (child === undefined || 'key' in (child as FieldSpec)) {
        const created: FieldNode = {};
        node[part] = created;
        node = created;
      } else {
        node = child as FieldNode;
      }
    }
    node[parts[parts.length - 1]] = spec;
  }
  return root;
}

const FIELD_TREE: Record<string, FieldNode> = {};
for (const [cmd, map] of Object.entries(FIELD_MAP)) FIELD_TREE[cmd] = compile(map);

/** group path → [key, zeroValue] pairs applied once that group is seen. */
const ZERO_FILL_KEYS: Record<string, Record<string, Array<[string, number]>>> = {};
for (const [cmd, paths] of Object.entries(ZERO_FILL_PATHS)) {
  const groups: Record<string, Array<[string, number]>> = {};
  for (const path of paths) {
    const group = groupOf(path);
    const spec = FIELD_MAP[cmd][path];
    if (!groups[group]) groups[group] = [];
    groups[group].push([spec.key, spec.type === 'int' ? 0 : 0.0]);
  }
  ZERO_FILL_KEYS[cmd] = groups;
}

interface VarintResult {
  value: bigint;
  next: number;
}

function readVarint(buf: Buffer, pos: number): VarintResult {
  let shift = 0n;
  let value = 0n;
  let i = pos;
  for (;;) {
    if (i >= buf.length) throw new RangeError('truncated varint');
    const byte = buf[i];
    i += 1;
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value, next: i };
    shift += 7n;
    if (shift > 63n) throw new RangeError('oversized varint');
  }
}

const TWO_POW_63 = 1n << 63n;
const TWO_POW_64 = 1n << 64n;

function signedFromVarint(raw: bigint): number {
  return Number(raw >= TWO_POW_63 ? raw - TWO_POW_64 : raw);
}

interface RawField {
  bytes: Buffer;
  next: number;
}

function readField(buf: Buffer, pos: number, wireType: number): RawField {
  if (wireType === 0) {
    const { next } = readVarint(buf, pos);
    return { bytes: buf.subarray(pos, next), next };
  }
  if (wireType === 1) {
    if (pos + 8 > buf.length) throw new RangeError('truncated 64-bit field');
    return { bytes: buf.subarray(pos, pos + 8), next: pos + 8 };
  }
  if (wireType === 2) {
    const { value, next } = readVarint(buf, pos);
    const length = Number(value);
    if (next + length > buf.length) throw new RangeError('truncated length-delimited field');
    return { bytes: buf.subarray(next, next + length), next: next + length };
  }
  if (wireType === 5) {
    if (pos + 4 > buf.length) throw new RangeError('truncated 32-bit field');
    return { bytes: buf.subarray(pos, pos + 4), next: pos + 4 };
  }
  throw new RangeError(`unsupported wire type ${wireType}`);
}

function decodeScalar(wireType: number, raw: Buffer, type: ScalarType): number | undefined {
  if (wireType === 0) {
    let value = 0n;
    let shift = 0n;
    for (const byte of raw) {
      value |= BigInt(byte & 0x7f) << shift;
      shift += 7n;
    }
    return signedFromVarint(value);
  }
  if (wireType === 5) {
    if (raw.length !== 4) return undefined;
    const f = raw.readFloatLE(0);
    return type === 'float' ? f : Math.round(f);
  }
  if (wireType === 1) {
    if (raw.length !== 8) return undefined;
    const d = raw.readDoubleLE(0);
    return type === 'float' ? d : Math.round(d);
  }
  return undefined;
}

function walk(
  payload: Buffer,
  node: FieldNode,
  out: Record<string, number>,
  seenGroups: Set<string>,
  prefix = '',
): void {
  let pos = 0;
  while (pos < payload.length) {
    const tag = readVarint(payload, pos);
    pos = tag.next;
    const fieldNumber = Number(tag.value >> 3n);
    const wireType = Number(tag.value & 0x07n);
    const field = readField(payload, pos, wireType);
    pos = field.next;

    const child = node[fieldNumber];
    if (child === undefined) continue;

    if (!('key' in (child as FieldSpec))) {
      // Declared as a group but arriving as a scalar is a layout difference,
      // not something to guess at.
      if (wireType !== 2) continue;
      seenGroups.add(`${prefix}${fieldNumber}`);
      walk(field.bytes, child as FieldNode, out, seenGroups, `${prefix}${fieldNumber}.`);
      continue;
    }

    const spec = child as FieldSpec;
    const value = decodeScalar(wireType, field.bytes, spec.type);
    if (value === undefined) continue;
    out[spec.key] = spec.scale === 1 ? value : value * spec.scale;
  }
}

export interface Es22FrameHeader {
  cmdFunc: number;
  cmdId: number;
  deviceSn?: string;
  pdata?: Buffer;
}

function decodeHeader(buf: Buffer): Es22FrameHeader {
  const header: Es22FrameHeader = { cmdFunc: -1, cmdId: -1 };
  let pos = 0;
  while (pos < buf.length) {
    const tag = readVarint(buf, pos);
    pos = tag.next;
    const fieldNumber = Number(tag.value >> 3n);
    const wireType = Number(tag.value & 0x07n);
    const field = readField(buf, pos, wireType);
    pos = field.next;
    if (fieldNumber === HEADER_PDATA && wireType === 2) header.pdata = field.bytes;
    else if (fieldNumber === HEADER_DEVICE_SN && wireType === 2) header.deviceSn = field.bytes.toString('utf8');
    else if (wireType === 0) {
      const value = signedFromVarint(readVarint(field.bytes, 0).value);
      if (fieldNumber === HEADER_CMD_FUNC) header.cmdFunc = value;
      else if (fieldNumber === HEADER_CMD_ID) header.cmdId = value;
    }
  }
  return header;
}

/** Decode the EcoFlow frame wrapper into its headers (field 1, repeated). */
export function decodeFrameHeaders(frame: Buffer): Es22FrameHeader[] {
  const headers: Es22FrameHeader[] = [];
  let pos = 0;
  while (pos < frame.length) {
    const tag = readVarint(frame, pos);
    pos = tag.next;
    const fieldNumber = Number(tag.value >> 3n);
    const wireType = Number(tag.value & 0x07n);
    const field = readField(frame, pos, wireType);
    pos = field.next;
    if (fieldNumber !== 1 || wireType !== 2) continue;
    headers.push(decodeHeader(field.bytes));
  }
  return headers;
}

/** Flat, unit-normalized telemetry for a STREAM AC 5000. All fields optional. */
export interface Es22Telemetry {
  /** Whole-home consumption (W). */
  homeW?: number;
  /** Solar generation reported by the unit (W). */
  solarW?: number;
  /** Integer state of charge (%). */
  socPct?: number;
  /** Fractional state of charge (%), preferred when present. */
  socPrecisePct?: number;
  /** Signed battery power (W); positive charges the pack. */
  battW?: number;
  battChargePowerW?: number;
  battDischargePowerW?: number;
  /** Signed grid power (W) from the linked meter; positive imports. */
  gridW?: number;
  /** Non-negative grid import (W), derived from the flow matrix. */
  gridImportPowerW?: number;
  /** Non-negative grid export (W), derived from the flow matrix. */
  gridExportPowerW?: number;
  homeFromBattW?: number;
  homeFromGridW?: number;
  /** Battery temperature (°C) from the BMS heartbeat. */
  battTempC?: number;
  /** State of health (%) from the BMS heartbeat. */
  bmsSohPct?: number;
  battVoltageV?: number;
  bmsCurrentA?: number;
  maxChargeSocPct?: number;
  minDischargeSocPct?: number;
}

function finalize(parsed: Record<string, number>): Es22Telemetry {
  const raw: Record<string, number> = { ...parsed };
  for (const [key, value] of Object.entries(raw)) {
    if (Number.isFinite(value) && Math.abs(value) < FLOAT_ZERO_EPS) raw[key] = 0;
  }

  const out: Es22Telemetry = {};
  const copy: Array<keyof Es22Telemetry> = [
    'homeW', 'solarW', 'socPct', 'socPrecisePct', 'homeFromBattW', 'homeFromGridW',
    'battTempC', 'bmsSohPct', 'maxChargeSocPct', 'minDischargeSocPct',
  ];
  for (const key of copy) {
    const value = raw[key as string];
    if (typeof value === 'number') (out as Record<string, number>)[key as string] = value;
  }

  if (typeof raw._battVoltageMv === 'number') out.battVoltageV = raw._battVoltageMv / 1000;
  if (typeof raw._bmsCurrentMa === 'number') out.bmsCurrentA = raw._bmsCurrentMa / 1000;

  // The meter block is the only signed grid reading an ES22 sends, so a unit
  // without a linked meter reports no signed grid value at all.
  if (typeof raw._meterNetW === 'number') out.gridW = raw._meterNetW;

  const battToGrid = raw._battToGridW;
  const gridToBatt = raw._gridToBattW;
  const solarToGrid = raw._solarToGridW;
  const solarToBatt = raw._solarToBattW;
  const { homeFromGridW, homeFromBattW } = out;

  // Import/export come from the flow edges, so both are structurally
  // non-negative — which is what an energy dashboard needs.
  if (typeof gridToBatt === 'number' && typeof homeFromGridW === 'number') {
    out.gridImportPowerW = homeFromGridW + gridToBatt;
  }
  if (typeof battToGrid === 'number') {
    out.gridExportPowerW = battToGrid + (typeof solarToGrid === 'number' ? solarToGrid : 0);
  }

  // Signed battery power, positive is charge. All three zero-filled edges being
  // numbers means this frame actually carried `f12`; an absent group leaves
  // battW out so the caller keeps the last known value.
  if (typeof homeFromBattW === 'number' && typeof battToGrid === 'number' && typeof gridToBatt === 'number') {
    const into = gridToBatt + (typeof solarToBatt === 'number' ? solarToBatt : 0);
    out.battW = into - (homeFromBattW + battToGrid);
    out.battChargePowerW = out.battW > 0 ? out.battW : 0;
    out.battDischargePowerW = out.battW < 0 ? Math.abs(out.battW) : 0;
  }

  return out;
}

/**
 * Parse one STREAM AC 5000 MQTT frame.
 *
 * Returns `null` for a frame that is not valid protobuf, carries no recognised
 * command, or yields no mapped field — callers treat that as "nothing to apply"
 * rather than as an error.
 */
export function parseStreamAc5000Frame(frame: Buffer): Es22Telemetry | null {
  let headers: Es22FrameHeader[];
  try {
    headers = decodeFrameHeaders(frame);
  } catch {
    return null;
  }
  if (headers.length === 0) return null;

  const merged: Record<string, number> = {};
  let matched = false;
  for (const header of headers) {
    const tree = FIELD_TREE[cmdKey(header.cmdFunc, header.cmdId)];
    if (!tree || !header.pdata || header.pdata.length === 0) continue;
    const decoded: Record<string, number> = {};
    const seenGroups = new Set<string>();
    try {
      walk(header.pdata, tree, decoded, seenGroups);
    } catch {
      // A malformed message is contained: the rest of the bundle still counts.
      continue;
    }
    const zeroFill = ZERO_FILL_KEYS[cmdKey(header.cmdFunc, header.cmdId)] || {};
    for (const [group, defaults] of Object.entries(zeroFill)) {
      if (!seenGroups.has(group)) continue;
      for (const [key, zero] of defaults) if (decoded[key] === undefined) decoded[key] = zero;
    }
    matched = true;
    Object.assign(merged, decoded);
  }
  if (!matched || Object.keys(merged).length === 0) return null;

  const telemetry = finalize(merged);
  return Object.keys(telemetry).length > 0 ? telemetry : null;
}
