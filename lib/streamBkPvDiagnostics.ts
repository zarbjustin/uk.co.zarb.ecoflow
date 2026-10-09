'use strict';

import { decodeFrameHeaders } from './streamAc5000Protocol';
import { streamModelFromSn } from './streamModels';

export const BK_PV_STALE_MS = 20 * 60 * 1000;
export const BK_PV_CAPS = ['stream_unit_pv3_voltage', 'stream_unit_pv3_current',
  'stream_unit_pv4_voltage', 'stream_unit_pv4_current'];

/** Candidate port ordering, from pinned upstream 254/21 captures (PR 523).
 * Header decoding is shared framing only; no ES telemetry or energy mapper is used.
 */
export function decodeBkPvDiagnostics(frame: Buffer, sn: string): Record<string, number> {
  const ports = streamModelFromSn(sn).solarInputs;
  if (!/^(BK11|BK12|BK61)[A-Z0-9]+$/i.test(sn) || frame.length > 65536) return {};
  const out: Record<string, number> = {};
  try {
    for (const h of decodeFrameHeaders(frame)) {
      if (h.cmdFunc !== 254 || h.cmdId !== 21 || !h.pdata) continue;
      if (h.deviceSn && h.deviceSn.toUpperCase() !== sn.toUpperCase()) continue;
      const b = h.pdata;
      let pos = 0;
      const integer = () => {
        let value = 0n;
        for (let i = 0; i < 10; i += 1) {
          if (pos >= b.length) throw new RangeError('truncated');
          const byte = b[pos++];
          value |= BigInt(byte & 127) << BigInt(i * 7);
          if (!(byte & 128)) {
            // Skip unknown uint64 scalar fields; tags/lengths below must be safe.
            return Number(value);
          }
        }
        throw new RangeError('oversized');
      };
      while (pos < b.length) {
        const tag = integer();
        if (!Number.isSafeInteger(tag) || tag > 0xffffffff) throw new RangeError('invalid tag');
        const field = Math.floor(tag / 8); const wire = tag % 8;
        if (!field) throw new RangeError('invalid tag');
        if (wire === 0) integer();
        else {
          let size: number;
          if (wire === 2) size = integer();
          else if (wire === 1) size = 8;
          else if (wire === 5) size = 4;
          else throw new RangeError('invalid wire');
          if (!Number.isSafeInteger(size) || size < 0 || pos + size > b.length) throw new RangeError('truncated');
          if (wire === 5 && field >= 998 && field <= 1001) {
            const index = field - 998;
            const port = index < 2 ? 3 : 4;
            const max = index % 2 === 0 ? 100 : 30; // Broad diagnostic sanity bounds, not ratings.
            const value = b.readFloatLE(pos);
            if (port <= ports && Number.isFinite(value) && value >= 0 && value <= max) {
              out[BK_PV_CAPS[index]] = value;
            }
          }
          pos += size;
        }
      }
    }
  } catch {
    return {};
  }
  return out;
}

/** Each component has its own receipt; never multiply cached components for power. */
export class BkPvReceipts {
  private readonly receipts = new Map<string, number>();

  observe(key: string, at: number, now: number): boolean {
    if (!BK_PV_CAPS.includes(key) || !Number.isFinite(at) || at < 0 || at > now
      || at < (this.receipts.get(key) ?? -1)) return false;
    this.receipts.set(key, at);
    return true;
  }

  expired(now: number): string[] {
    return [...this.receipts].filter(([, at]) => at > now || now - at > BK_PV_STALE_MS).map(([key]) => key);
  }

  forget(key: string): void {
    this.receipts.delete(key);
  }

  snapshot(now: number): Record<string, { ageSec: number | null; stale: boolean }> {
    return Object.fromEntries([...this.receipts].map(([key, at]) => [key, {
      ageSec: at > now ? null : Math.floor((now - at) / 1000),
      stale: at > now || now - at > BK_PV_STALE_MS,
    }]));
  }
}
