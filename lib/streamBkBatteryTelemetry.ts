'use strict';

import { decodeFrameHeaders } from './streamAc5000Protocol';

/** BK BMS 32/50, fields 26/27: charge/discharge DC pack watts. Both must
 * occur in one packet. Source: shuette42/ecoflow-energy-ha stream_proto.py
 * at 12509ef6f198f57675a98872b08a870fc009943d (#486).
 * Never use 254/21 field 518 (aggregate) or 616 (grid connection).
 */
export function decodeBkBatteryReading(frame: Buffer, sn: string): { chargeW: number; dischargeW: number; powerW: number } | undefined {
  if (!/^(BK11|BK12|BK31|BK41|BK51|BK61)[A-Z0-9]+$/i.test(sn) || frame.length > 65536) return undefined;
  let result: { chargeW: number; dischargeW: number; powerW: number } | undefined;
  try {
    for (const header of decodeFrameHeaders(frame)) {
      if (header.cmdFunc !== 32 || header.cmdId !== 50 || !header.pdata
        || (header.deviceSn && header.deviceSn.toUpperCase() !== sn.toUpperCase())) continue;
      const data = header.pdata;
      let pos = 0;
      const integer = (): bigint => {
        let value = 0n;
        for (let i = 0; i < 10; i += 1) {
          if (pos >= data.length) throw new RangeError('truncated');
          const byte = data[pos++];
          if (i === 9 && byte > 1) throw new RangeError('overflow');
          value |= BigInt(byte & 127) << BigInt(i * 7);
          if (!(byte & 128)) return value;
        }
        throw new RangeError('overflow');
      };
      const fields = new Map<number, number>();
      while (pos < data.length) {
        const tag = Number(integer());
        if (!Number.isSafeInteger(tag) || tag < 8 || tag > 0xffffffff) throw new RangeError('tag');
        const field = Math.floor(tag / 8); const wire = tag % 8;
        if (wire === 0) {
          const value = integer();
          if (field === 26 || field === 27) {
            if (fields.has(field) || value > 100000n) throw new RangeError('power');
            fields.set(field, Number(value));
          }
        } else {
          const size = wire === 2 ? Number(integer()) : ({ 1: 8, 5: 4 } as Record<number, number>)[wire];
          if (field === 26 || field === 27 || !Number.isSafeInteger(size) || size < 0
            || pos + size > data.length) throw new RangeError('wire');
          pos += size;
        }
      }
      const charge = fields.get(26); const discharge = fields.get(27);
      if (charge !== undefined && discharge !== undefined) {
        if (charge > 0 && discharge > 0) return undefined;
        result = { chargeW: charge, dischargeW: discharge, powerW: charge - discharge };
      }
    }
  } catch {
    return undefined;
  }
  return result;
}

export function decodeBkBatteryPower(frame: Buffer, sn: string): number | undefined {
  return decodeBkBatteryReading(frame, sn)?.powerW;
}
