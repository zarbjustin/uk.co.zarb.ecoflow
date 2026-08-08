'use strict';

import { createHash } from 'crypto';
import { decodeFrameHeaders } from './streamAc5000Protocol';

const DEFAULT_SAMPLE_BYTES = 192;

export interface Es22FrameDiagnostic {
  bytes: number;
  sha256: string;
  commands: string[];
  sampleBase64: string;
  truncated: boolean;
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
