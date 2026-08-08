'use strict';

import { isStreamAc5000Sn, STREAM_AC5000_PREFIX } from './appDevices';
import { EcoFlowDevice, Quota } from './types';

/**
 * Logical role of an EcoFlow device bound to an account.
 *  - stream_unit:  a controllable STREAM inverter/battery (Ultra/Pro/AC/AC Pro/Max/Ultra X)
 *  - smart_meter:  an EcoFlow Smart Meter (CT_EF_01)
 *  - microinverter: a STREAM Microinverter (no quota of its own via the open API)
 *  - stream_ac5000: a STREAM AC 5000 (ES22) — a different product line and a
 *    different protocol from the BK-series STREAM, only reachable through the
 *    experimental app-auth path. Never handled by the BK-series drivers.
 *  - other:        anything else (e.g. PowerStream)
 */
export type EcoFlowRole = 'stream_unit' | 'smart_meter' | 'microinverter' | 'stream_ac5000' | 'other';

/**
 * Serial-number prefix → role map.
 * Prefixes verified against a live STREAM account (BK01/BK21/BK31/BK61) and
 * cross-referenced with the community device maps
 * (rabits/ha-ef-ble, foxthefox/ioBroker.ecoflow-mqtt, tolwi/hassio-ecoflow-cloud).
 */
const PREFIX_ROLE: Record<string, EcoFlowRole> = {
  BK01: 'microinverter', // STREAM Microinverter
  BK02: 'microinverter',
  BK11: 'stream_unit', // STREAM Ultra
  BK12: 'stream_unit', // STREAM Pro
  BK21: 'smart_meter', // Smart Meter (CT_EF_01)
  BK31: 'stream_unit', // STREAM AC Pro
  BK41: 'stream_unit', // STREAM Max
  BK51: 'stream_unit', // STREAM AC
  BK61: 'stream_unit', // STREAM Ultra X
  // STREAM AC 5000 — shares the STREAM name only. It answers API code 1006 to
  // every public quota call, so it is served by the experimental app-auth
  // `stream_ac5000` driver and must never reach a BK-series driver.
  [STREAM_AC5000_PREFIX]: 'stream_ac5000',
};

function nameRole(name: string): EcoFlowRole | undefined {
  const n = name.toLowerCase();
  if (/smart\s*meter/.test(n)) return 'smart_meter';
  if (/microinverter/.test(n)) return 'microinverter';
  if (/powerstream/.test(n)) return 'other';
  if (/stream/.test(n)) return 'stream_unit';
  return undefined;
}

/** Quota keys that only a controllable STREAM inverter/battery reports. */
export function quotaIsStreamUnit(q: Quota | undefined): boolean {
  if (!q) return false;
  return (
    q['cmsBattSoc'] !== undefined
    || q['powGetSysLoad'] !== undefined
    || q['relay2Onoff'] !== undefined
    || q['energyStrategyOperateMode.operateSelfPoweredOpen'] !== undefined
  );
}

export function quotaIsEmpty(q: Quota | undefined): boolean {
  return !q || Object.keys(q).length === 0;
}

/**
 * Classify a device from its list metadata (sn + names). Combines the explicit
 * prefix map with productName/deviceName fallbacks. `quota` (optional) is used
 * as an authoritative tie-breaker when the prefix/name are inconclusive.
 */
export function classifyDevice(d: EcoFlowDevice, quota?: Quota): EcoFlowRole {
  const prefix = (d.sn || '').slice(0, 4).toUpperCase();
  const byPrefix = PREFIX_ROLE[prefix];
  if (byPrefix) return byPrefix;

  // The serial prefix is exact evidence and a product name is a substring
  // guess, so an ES22 is settled before any name matching: "STREAM AC 5000"
  // contains "stream" and would otherwise be treated as a BK-series unit.
  if (isStreamAc5000Sn(d.sn)) return 'stream_ac5000';

  const byName = nameRole(d.productName || '') || nameRole(d.deviceName || '');
  if (byName) return byName;

  // Authoritative fallback: a rich STREAM control quota means a STREAM unit.
  if (quotaIsStreamUnit(quota)) return 'stream_unit';

  return 'other';
}

export const isStreamUnit = (d: EcoFlowDevice, q?: Quota): boolean => classifyDevice(d, q) === 'stream_unit';
export const isSmartMeter = (d: EcoFlowDevice, q?: Quota): boolean => classifyDevice(d, q) === 'smart_meter';
export const isStreamAc5000 = (d: EcoFlowDevice): boolean => classifyDevice(d) === 'stream_ac5000';
