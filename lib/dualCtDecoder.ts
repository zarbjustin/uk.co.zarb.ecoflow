/**
 * Experimental scalar candidates only. Numbers/wires overlap the BK21 parser:
 * shuette42/ecoflow-energy-ha, smart_meter_proto.py at 563226ad9b2d40eb909eafb5b1b3aeaad39b3225.
 * Dual CT units, roles and direction have NOT been validated. Not wired to Homey.
 */
const CANDIDATES: Record<number, { key: string; unit: string }> = {
  515: { key: 'aggregatePower', unit: 'W' },
  962: { key: 'phase1Power', unit: 'W' },
  963: { key: 'phase2Power', unit: 'W' },
  772: { key: 'phase3Power', unit: 'W' },
  956: { key: 'phase1Voltage', unit: 'V' },
  957: { key: 'phase2Voltage', unit: 'V' },
  771: { key: 'phase3Voltage', unit: 'V' },
  958: { key: 'phase1Current', unit: 'A' },
  959: { key: 'phase2Current', unit: 'A' },
  784: { key: 'phase3Current', unit: 'A' },
};

export interface DualCtDecodeContext {
  productType: number;
  cmdFunc: number;
  cmdId: number;
  source: string;
  encoding: string;
  receivedAt: number;
  now: number;
}

/** Input is one explicitly plain pdata, not an encrypted frame or JSON quota. */
export function decodeDualCtCandidates(payload: Buffer, context: DualCtDecodeContext) {
  if (!context || typeof context !== 'object' || !Buffer.isBuffer(payload) || !payload.length || payload.length > 65536
    || context.productType !== 421 || context.cmdFunc !== 254 || context.cmdId !== 21
    || context.source !== 'app_mqtt' || context.encoding !== 'plain'
    || !Number.isFinite(context.now) || !Number.isFinite(context.receivedAt)
    || context.receivedAt <= 0 || context.receivedAt > context.now || context.now - context.receivedAt > 90000) return null;
  let pos = 0; let count = 0;
  const readings: Array<{ field: number; candidate: string; value: number; candidateUnit: string }> = [];
  const seen = new Set<number>();
  const varint = (): bigint => {
    let n = 0n;
    for (let i = 0; i < 10; i += 1) {
      if (pos >= payload.length) throw new Error('Truncated');
      const byte = payload[pos++];
      if (i === 9 && byte > 1) throw new Error('Overflow');
      n |= BigInt(byte & 127) << BigInt(7 * i);
      if (!(byte & 128)) return n;
    }
    throw new Error('Overflow');
  };
  try {
    while (pos < payload.length) {
      if (++count > 256) return null;
      const tag = varint();
      if (tag < 8n || tag > 0xffffffffn) return null;
      const field = Number(tag >> 3n); const wire = Number(tag & 7n);
      if (wire === 0) {
        varint(); continue;
      }
      let length: number;
      if (wire === 2) {
        const n = varint();
        if (n > BigInt(payload.length)) return null;
        length = Number(n);
      } else if (wire === 1) length = 8;
      else if (wire === 5) length = 4;
      else return null;
      if (pos + length > payload.length) return null;
      const mapping = CANDIDATES[field];
      if (mapping && wire === 5) {
        if (seen.has(field)) return null; // Conflicting duplicates must not silently win.
        seen.add(field);
        const value = payload.readFloatLE(pos);
        // Broad corruption limit, not a rating or a validated measurement range.
        if (Number.isFinite(value) && Math.abs(value) <= 1000000) {
          readings.push({
            field, candidate: mapping.key, value, candidateUnit: mapping.unit,
          });
        }
      }
      pos += length;
    }
  } catch {
    return null;
  }
  if (!readings.length) return null;
  return {
    source: 'app_mqtt',
    interpretation: 'legacy_meter_overlap_unverified',
    receivedAgeSec: (context.now - context.receivedAt) / 1000,
    measurementTimestampKnown: false,
    hardwareValidated: false,
    readings,
    channelMapping: 'unverified',
    pairingEnabled: false,
    contributesToEnergy: false,
    controlsEnabled: false,
  };
}
