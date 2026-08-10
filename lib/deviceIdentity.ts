'use strict';

/** Serial-number prefix of the STREAM AC 5000. */
export const STREAM_AC5000_PREFIX = 'ES22';

export type KnownDeveloperApiRole = 'stream_unit' | 'smart_meter' | 'microinverter';

/**
 * Prefixes verified against a live STREAM account and cross-referenced with
 * the community device maps used by the Developer API integration.
 */
const KNOWN_DEVELOPER_API_ROLE_BY_PREFIX: Readonly<Record<string, KnownDeveloperApiRole>> = {
  BK01: 'microinverter',
  BK02: 'microinverter',
  BK11: 'stream_unit',
  BK12: 'stream_unit',
  BK21: 'smart_meter',
  BK31: 'stream_unit',
  BK41: 'stream_unit',
  BK51: 'stream_unit',
  BK61: 'stream_unit',
};

export function serialPrefix(sn: string | undefined): string {
  return (sn || '').slice(0, 4).toUpperCase();
}

/** True for a STREAM AC 5000 (ES22). Never true for a BK-series STREAM. */
export function isStreamAc5000Sn(sn: string | undefined): boolean {
  return serialPrefix(sn) === STREAM_AC5000_PREFIX;
}

/** Supported Developer API role for a documented serial prefix. */
export function knownDeveloperApiRole(sn: string | undefined): KnownDeveloperApiRole | undefined {
  return KNOWN_DEVELOPER_API_ROLE_BY_PREFIX[serialPrefix(sn)];
}

/** True for a serial family explicitly supported by the Developer API drivers. */
export function hasKnownDeveloperApiPrefix(sn: string | undefined): boolean {
  return knownDeveloperApiRole(sn) !== undefined;
}
