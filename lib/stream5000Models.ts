'use strict';

/**
 * Product registry for EcoFlow's 5 kWh STREAM platform.
 *
 * A catalogue entry is not enough to enable a product. New models must only be
 * added after a real serial prefix and telemetry protocol have been verified.
 * This keeps product discovery separate from parser implementation and avoids
 * accidentally offering unsupported hardware merely because its name contains
 * "STREAM 5000".
 */

export type Stream5000TelemetryAdapterId = 'es22';

export interface Stream5000ModelSpec {
  /** Stable internal model identifier stored with newly paired Homey devices. */
  id: string;
  /** Name shown when EcoFlow omits both productName and deviceName. */
  name: string;
  /** Exact, verified four-character serial prefixes for this product. */
  serialPrefixes: readonly string[];
  /** Parser/mapping implementation used for this product's MQTT frames. */
  telemetryAdapter: Stream5000TelemetryAdapterId;
  /** App connection is deliberately read-only until commands are verified. */
  monitoringOnly: true;
}

export const STREAM_AC5000_MODEL_ID = 'stream_ac_5000';
export const STREAM_AC5000_MODEL = 'STREAM AC 5000';
export const STREAM_AC5000_PREFIX = 'ES22';

/** Driver IDs sharing one app-auth account and physical-device namespace. */
export const STREAM_5000_DRIVER_ID = 'stream_5000_unit';
export const LEGACY_STREAM_AC5000_DRIVER_ID = 'stream_ac5000';
export const STREAM_5000_DRIVER_IDS = Object.freeze([
  STREAM_5000_DRIVER_ID,
  LEGACY_STREAM_AC5000_DRIVER_ID,
] as const);

const MODELS: readonly Stream5000ModelSpec[] = Object.freeze([
  Object.freeze({
    id: STREAM_AC5000_MODEL_ID,
    name: STREAM_AC5000_MODEL,
    serialPrefixes: Object.freeze([STREAM_AC5000_PREFIX]),
    telemetryAdapter: 'es22' as const,
    monitoringOnly: true as const,
  }),
]);

const MODEL_BY_PREFIX = new Map<string, Stream5000ModelSpec>();
const MODEL_IDS = new Set<string>();
for (const model of MODELS) {
  if (MODEL_IDS.has(model.id)) throw new Error(`Duplicate STREAM 5000 model id: ${model.id}`);
  MODEL_IDS.add(model.id);
  for (const prefix of model.serialPrefixes) {
    if (!/^[A-Z0-9]{4}$/.test(prefix)) {
      throw new Error(`Invalid STREAM 5000 serial prefix for ${model.id}: ${prefix}`);
    }
    if (MODEL_BY_PREFIX.has(prefix)) throw new Error(`Duplicate STREAM 5000 serial prefix: ${prefix}`);
    MODEL_BY_PREFIX.set(prefix, model);
  }
}

export function stream5000SerialPrefix(sn: string | undefined): string {
  return (sn || '').slice(0, 4).toUpperCase();
}

/** Return a model only when its serial prefix and telemetry adapter are verified. */
export function stream5000ModelFromSn(sn: string | undefined): Stream5000ModelSpec | undefined {
  return MODEL_BY_PREFIX.get(stream5000SerialPrefix(sn));
}

export function isSupportedStream5000Sn(sn: string | undefined): boolean {
  return stream5000ModelFromSn(sn) !== undefined;
}

export function stream5000DeviceName(sn: string, productName?: string, deviceName?: string): string {
  const explicit = (deviceName || '').trim() || (productName || '').trim();
  if (explicit) return explicit;
  const model = stream5000ModelFromSn(sn);
  if (!model) return sn;
  const tail = (sn || '').slice(-4);
  return /^\d{4}$/.test(tail) ? `${model.name} (${tail})` : model.name;
}

/** Read-only snapshot used by tests and future pairing/help UI. */
export function supportedStream5000Models(): readonly Stream5000ModelSpec[] {
  return MODELS;
}
