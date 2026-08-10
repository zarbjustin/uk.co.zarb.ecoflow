'use strict';

import { createHash } from 'crypto';
import { decodeFrameHeaders } from './streamAc5000Protocol';

const DEFAULT_SAMPLE_BYTES = 192;
const SHAPE_BUCKET_BYTES = 32;
const DEFAULT_SHAPE_LIMIT = 8;
const DEFAULT_SAMPLE_BUDGET = 24;
const DEFAULT_SHAPE_REFRESH_MS = 15 * 60 * 1000;

const SAFE_VALUE_NAMES: Record<string, string> = {
  measure_battery: 'battery_pct',
  battery_charging_state: 'state',
  measure_power: 'battery_w',
  'measure_power.load': 'home_w',
  'measure_power.grid': 'grid_w',
  'measure_power.grid_import': 'grid_import_w',
  'measure_power.grid_export': 'grid_export_w',
  measure_temperature: 'temperature_c',
  battery_soh: 'health_pct',
};

export interface Es22FrameDiagnostic {
  bytes: number;
  sha256: string;
  commands: string[];
  sampleBase64: string;
  truncated: boolean;
}

/**
 * Group changing protobuf payloads into a stable, privacy-safe diagnostic
 * shape. Values and identifiers are deliberately excluded: command IDs and a
 * coarse byte-size bucket are enough to prevent one noisy command consuming
 * every sample slot, while nearby delta-frame sizes remain one family.
 */
export function es22FrameShape(diagnostic: Pick<Es22FrameDiagnostic, 'bytes' | 'commands'>): string {
  const commands = diagnostic.commands.join(',') || 'none';
  const bucket = Math.max(
    SHAPE_BUCKET_BYTES,
    Math.round(Math.max(0, diagnostic.bytes) / SHAPE_BUCKET_BYTES) * SHAPE_BUCKET_BYTES,
  );
  return `${commands}@${bucket}`;
}

/** Bounded, rolling admission control for unparsed raw-frame samples. */
export class Es22SampleGate {
  private accepted = 0;
  private readonly shapes = new Map<string, { at: number; sha256: string }>();
  private readonly shapeLimit: number;
  private readonly sampleBudget: number;
  private readonly refreshMs: number;

  constructor(
    shapeLimit = DEFAULT_SHAPE_LIMIT,
    sampleBudget = DEFAULT_SAMPLE_BUDGET,
    refreshMs = DEFAULT_SHAPE_REFRESH_MS,
  ) {
    this.shapeLimit = shapeLimit;
    this.sampleBudget = sampleBudget;
    this.refreshMs = refreshMs;
  }

  shouldCapture(diagnostic: Es22FrameDiagnostic, now = Date.now()): boolean {
    const shape = es22FrameShape(diagnostic);
    const previous = this.shapes.get(shape);
    if (previous?.sha256 === diagnostic.sha256) return false;
    if (previous && now - previous.at < this.refreshMs) return false;
    if (this.accepted >= Math.max(0, this.sampleBudget)) return false;

    if (!previous && this.shapes.size >= Math.max(1, this.shapeLimit)) {
      const oldest = [...this.shapes.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) this.shapes.delete(oldest[0]);
    }
    this.shapes.set(shape, { at: now, sha256: diagnostic.sha256 });
    this.accepted += 1;
    return true;
  }
}

/**
 * Format only the known Homey capability projection for submitted logs.
 * Keeping an explicit allow-list prevents settings, identifiers or future
 * protocol internals from accidentally entering a diagnostic snapshot.
 */
export function formatEs22CapabilitySnapshot(values: Record<string, number | string>): string {
  const parts: string[] = [];
  for (const capability of Object.keys(SAFE_VALUE_NAMES)) {
    const value = values[capability];
    if (typeof value === 'number' && !Number.isFinite(value)) continue;
    if (typeof value !== 'number' && typeof value !== 'string') continue;
    parts.push(`${SAFE_VALUE_NAMES[capability]}=${value}`);
  }
  return parts.join(',') || 'none';
}

function redactAscii(payload: Buffer, value: string): Buffer {
  const redacted = Buffer.from(payload);
  const needle = Buffer.from(value, 'utf8');
  if (needle.length === 0) return redacted;

  let offset = redacted.indexOf(needle);
  while (offset !== -1) {
    redacted.fill(0x2a, offset, offset + needle.length);
    offset += needle.length;
    offset = redacted.indexOf(needle, offset);
  }
  return redacted;
}

/**
 * Produce a bounded frame sample suitable for Homey's submitted app log.
 *
 * The device serial is replaced before encoding, no account identifiers or
 * credentials are included, and the sample is capped so malformed or noisy
 * devices cannot flood a diagnostic report.
 */
export function describeEs22Frame(
  payload: Buffer,
  deviceSn: string,
  sampleBytes = DEFAULT_SAMPLE_BYTES,
): Es22FrameDiagnostic {
  let commands: string[] = [];
  try {
    commands = [...new Set(
      decodeFrameHeaders(payload)
        .filter((header) => header.cmdFunc >= 0 && header.cmdId >= 0)
        .map((header) => `${header.cmdFunc}/${header.cmdId}`),
    )].sort();
  } catch {
    // Invalid protobuf is still useful as a bounded redacted sample.
  }

  const redacted = redactAscii(payload, deviceSn);
  const limit = Math.max(0, Math.min(sampleBytes, DEFAULT_SAMPLE_BYTES));
  return {
    bytes: payload.length,
    sha256: createHash('sha256').update(payload).digest('hex').slice(0, 16),
    commands,
    sampleBase64: redacted.subarray(0, limit).toString('base64'),
    truncated: redacted.length > limit,
  };
}

export function es22TopicKind(topic: string): string {
  if (/^\/app\/device\/property\/[^/]+$/.test(topic)) return 'device_property';
  if (/^\/app\/[^/]+\/[^/]+\/thing\/property\/get_reply$/.test(topic)) return 'get_reply';
  return 'other';
}
