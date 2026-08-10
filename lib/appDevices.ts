'use strict';

import { isStreamAc5000Sn } from './deviceIdentity';

export { isStreamAc5000Sn, STREAM_AC5000_PREFIX } from './deviceIdentity';

/**
 * EXPERIMENTAL — normalization and classification for devices discovered through
 * the EcoFlow **app** API (`GET /iot-service/user/device`).
 *
 * This is deliberately separate from `lib/ecoflowDevices.ts`, which classifies
 * the Developer/Open API device list. Only the STREAM AC 5000 (serial prefix
 * `ES22`) is consumed from the app API today; every other product keeps using
 * the supported Developer API path.
 *
 * The response shape and the ES22 prefix mapping are adapted from the
 * MIT-licensed https://github.com/shuette42/ecoflow-energy-ha
 * (`ecoflow/app_api.py`, `ecoflow/const.py`).
 */

/** Product name shown when EcoFlow's app API returns an empty productName. */
export const STREAM_AC5000_MODEL = 'STREAM AC 5000';

export interface AppDevice {
  sn: string;
  /** Best available name; falls back to a model + serial-tail label. */
  name: string;
  /** Raw productName as returned by the app API ('' when not provided). */
  productName: string;
  /** 1 when EcoFlow reports the device as online, 0 otherwise. */
  online: number;
  /** True when the device is shared with (rather than bound to) this account. */
  shared: boolean;
}

/**
 * Human-readable name for an ES22. EcoFlow's app API reports an empty
 * productName for this model, so a model name plus the serial tail is used —
 * the same convention the reference implementation applies.
 */
export function streamAc5000Name(sn: string, productName?: string, deviceName?: string): string {
  const explicit = (deviceName || '').trim() || (productName || '').trim();
  if (explicit) return explicit;
  const tail = (sn || '').slice(-4);
  return /^\d{4}$/.test(tail) ? `${STREAM_AC5000_MODEL} (${tail})` : STREAM_AC5000_MODEL;
}

function toOnline(value: unknown): number {
  if (typeof value === 'number') return value === 0 ? 0 : 1;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string' && value.trim() !== '') return Number(value) ? 1 : 0;
  return 0;
}

function pushDevice(
  raw: Record<string, any>,
  fallbackSn: string,
  shared: boolean,
  out: AppDevice[],
  seen: Set<string>,
): void {
  const sn = String(raw.sn || raw.deviceSn || fallbackSn || '').trim();
  if (!sn || seen.has(sn)) return;
  seen.add(sn);
  const productName = String(raw.productName || raw.productType || '').trim();
  const deviceName = String(raw.deviceName || raw.name || '').trim();
  out.push({
    sn,
    name: isStreamAc5000Sn(sn)
      ? streamAc5000Name(sn, productName, deviceName)
      : (deviceName || productName || sn),
    productName,
    online: toOnline(raw.online ?? raw.deviceStatus),
    shared,
  });
}

/**
 * Flatten the app API's `{ bound: {...}, share: {...} }` structure into a list.
 *
 * Both groups may be keyed by serial number (`{ SN: {...} }`) or hold arrays
 * (`{ groupKey: [{...}] }`); both shapes are handled and duplicates removed.
 */
export function normalizeAppDeviceList(data: unknown): AppDevice[] {
  const out: AppDevice[] = [];
  const seen = new Set<string>();
  if (!data || typeof data !== 'object') return out;

  const groups: Array<[string, boolean]> = [['bound', false], ['share', true]];
  for (const [key, shared] of groups) {
    const group = (data as Record<string, unknown>)[key];
    if (Array.isArray(group)) {
      for (const entry of group) {
        if (entry && typeof entry === 'object') pushDevice(entry as Record<string, any>, '', shared, out, seen);
      }
      continue;
    }
    if (!group || typeof group !== 'object') continue;
    for (const [entryKey, value] of Object.entries(group as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        for (const entry of value) {
          if (entry && typeof entry === 'object') pushDevice(entry as Record<string, any>, '', shared, out, seen);
        }
      } else if (value && typeof value === 'object') {
        pushDevice(value as Record<string, any>, entryKey, shared, out, seen);
      }
    }
  }
  return out;
}

/** The ES22 devices on the account, in a stable order. */
export function streamAc5000Devices(devices: AppDevice[]): AppDevice[] {
  return devices.filter((d) => isStreamAc5000Sn(d.sn)).sort((a, b) => a.sn.localeCompare(b.sn));
}
