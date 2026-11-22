'use strict';

import { decodeFrameHeaders } from './streamAc5000Protocol';

export const STREAM_LIMIT_FIELDS = ['feedGridModePowLimit', 'sysGridInPwrLimit', 'feedGridModePowMax', 'feedGridSafetyPowMax'] as const;
const fields: Record<number, string> = {
  521: STREAM_LIMIT_FIELDS[0],
  1495: STREAM_LIMIT_FIELDS[1],
  727: STREAM_LIMIT_FIELDS[2],
  1543: STREAM_LIMIT_FIELDS[3],
};
const TTL = 180000;

/** Read-only DisplayPropertyUpload mapping. Upstream bk_series.proto at
 * rabits/ha-ef-ble 71f5b90a23dce7acdf7b8d701460de59f6d3b0f6.
 * ConfigWrite fields are deliberately not decoded or sent. BLE definitions do
 * not establish cloud control support or installation-wide measurement scope.
 */
export function decodeStreamLimits(frame: Buffer, sn: string): Record<string, number> {
  if (!/^(BK11|BK12|BK31|BK41|BK51|BK61)[A-Z0-9]+$/i.test(sn) || frame.length > 65536) return {};
  const out: Record<string, number> = {};
  try {
    for (const header of decodeFrameHeaders(frame)) {
      if (header.cmdFunc !== 254 || header.cmdId !== 21 || !header.pdata
        || (header.deviceSn && header.deviceSn.toUpperCase() !== sn.toUpperCase())) continue;
      const b = header.pdata;
      let pos = 0;
      const integer = () => {
        let value = 0n;
        for (let i = 0; i < 10; i += 1) {
          if (pos >= b.length) throw new Error('truncated');
          const byte = b[pos++];
          value |= BigInt(byte & 127) << BigInt(i * 7);
          if (!(byte & 128)) return Number(value);
        }
        throw new Error('oversized');
      };
      while (pos < b.length) {
        const tag = integer();
        if (!Number.isSafeInteger(tag) || tag <= 0 || tag > 0xffffffff) throw new Error('invalid tag');
        const field = Math.floor(tag / 8); const wire = tag % 8;
        if (!field) throw new Error('invalid field');
        if (wire === 0) {
          const value = integer();
          if (fields[field] && Number.isSafeInteger(value) && value >= 0 && value <= 100000) out[fields[field]] = value;
        } else {
          let size;
          if (wire === 2) size = integer();
          else if (wire === 1) size = 8;
          else if (wire === 5) size = 4;
          else throw new Error('invalid wire');
          if (!Number.isSafeInteger(size) || size < 0 || pos + size > b.length) throw new Error('truncated');
          pos += size;
        }
      }
    }
  } catch {
    return {};
  }
  return out;
}

export class StreamLimitObservations {
  private entries: Record<string, { value: number; at: number; source: string }> = {};

  observe(values: Record<string, unknown>, at: number, source: 'developer_quota' | 'app_property', now = Date.now()): void {
    if (!Number.isFinite(at) || at <= 0 || at > now || now - at > TTL) return;
    for (const key of STREAM_LIMIT_FIELDS) {
      const value = values[key]; const previous = this.entries[key];
      if (previous && previous.at <= now && at < previous.at) continue;
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100000) {
        this.entries[key] = { value, at, source };
      }
    }
  }

  snapshot(now = Date.now()): Record<string, unknown> {
    return Object.fromEntries(STREAM_LIMIT_FIELDS.map((key) => {
      const entry = this.entries[key];
      const ageSec = entry && entry.at <= now ? Math.floor((now - entry.at) / 1000) : null;
      const stale = ageSec === null || now - entry.at > TTL;
      return [key, {
        value: stale ? null : entry.value,
        ageSec,
        stale,
        source: entry?.source ?? 'unobserved',
        scopeVerified: false,
        controlEnabled: false,
      }];
    }));
  }
}
