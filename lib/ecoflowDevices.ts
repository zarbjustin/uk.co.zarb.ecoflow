'use strict';

import {
  isStreamAc5000Sn, knownDeveloperApiRole,
} from './deviceIdentity';
import { EcoFlowDevice, Quota } from './types';

/**
 * Logical role of an EcoFlow device bound to an account.
 *  - stream_unit:  a controllable STREAM inverter/battery (Ultra/Pro/AC/AC Pro/Max/Ultra X)
 *  - smart_meter:  an EcoFlow Smart Meter (CT_EF_01)
 *  - microinverter: a STREAM Microinverter (no quota of its own via the open API)
 *  - stream_5000_unit: a verified STREAM 5000-family physical unit — a
 *    different protocol from the BK-series STREAM, reachable through the
 *    app-auth path. Never handled by the BK-series drivers.
 *  - unsupported_stream_5000: a new-generation STREAM AC 5000 / STREAM 5000
 *    identified by name but without the confirmed ES22 serial prefix. It must
 *    not be offered through the Developer API drivers.
 *  - other:        anything else (e.g. PowerStream)
 */
export type EcoFlowRole =
  | 'stream_unit'
  | 'smart_meter'
  | 'microinverter'
  | 'stream_5000_unit'
  | 'unsupported_stream_5000'
  | 'other';

/** Product-name fallback used only after the shared prefix-role lookup. */
function nameRole(name: string): EcoFlowRole | undefined {
  const n = name.toLowerCase();
  if (/smart\s*meter/.test(n)) return 'smart_meter';
  if (/microinverter/.test(n)) return 'microinverter';
  if (/powerstream/.test(n)) return 'other';
  // Quarantine the new 5 kWh platform before the broad STREAM fallback. This
  // includes compound catalogue names such as "STREAM Expansion Battery
  // 5000" as well as the platform gateway. A name alone never proves that a
  // device speaks the older BK-series Developer API protocol.
  if (/stream/.test(n) && (/(?:^|\D)5000(?:\D|$)/.test(n) || /\bgateway\b/.test(n))) {
    return 'unsupported_stream_5000';
  }
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

/** True only for a documented BK-series STREAM unit prefix. */
export function hasKnownStreamUnitPrefix(sn: string | undefined): boolean {
  return knownDeveloperApiRole(sn) === 'stream_unit';
}

/**
 * Classify a device from its list metadata (sn + names). Combines the explicit
 * prefix map with productName/deviceName fallbacks. `quota` (optional) is used
 * as an authoritative tie-breaker when the prefix/name are inconclusive.
 */
export function classifyDevice(d: EcoFlowDevice, quota?: Quota): EcoFlowRole {
  const byPrefix = knownDeveloperApiRole(d.sn);
  if (byPrefix) return byPrefix;

  // The serial prefix is exact evidence and a product name is a substring
  // guess, so an ES22 is settled before any name matching: "STREAM AC 5000"
  // contains "stream" and would otherwise be treated as a BK-series unit.
  if (isStreamAc5000Sn(d.sn)) return 'stream_5000_unit';

  const byName = nameRole(d.productName || '') || nameRole(d.deviceName || '');
  if (byName) return byName;

  // Authoritative fallback: a rich STREAM control quota means a STREAM unit.
  if (quotaIsStreamUnit(quota)) return 'stream_unit';

  return 'other';
}

export const isStreamUnit = (d: EcoFlowDevice, q?: Quota): boolean => classifyDevice(d, q) === 'stream_unit';
export const isSmartMeter = (d: EcoFlowDevice, q?: Quota): boolean => classifyDevice(d, q) === 'smart_meter';
export const isStreamAc5000 = (d: EcoFlowDevice): boolean => isStreamAc5000Sn(d.sn);
