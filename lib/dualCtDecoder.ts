/**
 * Experimental scalar candidates only. Numbers/wires overlap the BK21 parser:
 * shuette42/ecoflow-energy-ha, smart_meter_proto.py at 4c6c54991515a2a5f200ab876f50331e799f4cc2.
 * Dual CT units, roles and direction have NOT been validated. Not wired to Homey.
 */
import { DUAL_CT_EXTRA_SCALARS } from './dualCtDiagnostics';
import { DualCtEncodingBasis } from './dualCtEncoding';
import { checkDualCtBanks, dualCtBankCandidate } from './dualCtBanks';

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
  encodingBasis?: DualCtEncodingBasis;
}

/** Input is one unchanged pdata candidate, never decrypted bytes or cached JSON quota. */
export function decodeDualCtCandidates(payload: Buffer, context: DualCtDecodeContext) {
  if (!context || typeof context !== 'object' || !Buffer.isBuffer(payload) || !payload.length || payload.length > 65536
    || context.productType !== 421 || context.cmdFunc !== 254 || context.cmdId !== 21
    || context.source !== 'app_mqtt' || context.encoding !== 'plain'
    || (context.encodingBasis !== undefined && !['explicit_zero', 'omitted_zero_candidate'].includes(context.encodingBasis))
    || !Number.isFinite(context.now) || !Number.isFinite(context.receivedAt)
    || context.receivedAt <= 0 || context.receivedAt > context.now || context.now - context.receivedAt > 90000) return null;
  let pos = 0; let count = 0;
  const encodingBasis = context.encodingBasis || 'explicit_zero';
  const readings: Array<{ field: number; candidate: string; value: number; candidateUnit: string | null;
    encodingBasis: DualCtEncodingBasis; representation: 'float32_candidate' }> = [];
  const seen = new Set<number>();
  let legacyFields = 0;
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
      const mapping = CANDIDATES[field];
      const extra = DUAL_CT_EXTRA_SCALARS.includes(field);
      if (mapping || extra) {
        // Mixed/wrong-wire duplicates are ambiguous even when one copy is well formed.
        if (wire !== 5 || seen.has(field)) return null;
        seen.add(field);
      }
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
      if (mapping || extra) {
        const value = payload.readFloatLE(pos);
        // Broad corruption limit, not a rating or a validated measurement range.
        if (!Number.isFinite(value) || Math.abs(value) > 1000000) return null;
        if (mapping) legacyFields += 1;
        readings.push({
          field,
          candidate: mapping?.key || `bankB_${dualCtBankCandidate(field)!.quantity}`,
          value,
          candidateUnit: mapping?.unit || null,
          encodingBasis,
          representation: 'float32_candidate',
        });
      }
      pos += length;
    }
  } catch {
    return null;
  }
  // An absent marker never admits a lone plausible float/unknown-bank-only payload.
  // Two legacy wire-5 fields plus a fully valid payload are a candidate signature,
  // not proof that arbitrary absent-marker frames are plaintext.
  if (!readings.length || (encodingBasis === 'omitted_zero_candidate' && legacyFields < 2)) return null;
  return {
    source: 'app_mqtt',
    interpretation: 'legacy_meter_overlap_unverified',
    receivedAgeSec: (context.now - context.receivedAt) / 1000,
    measurementTimestampKnown: false,
    hardwareValidated: false,
    encodingVerified: false,
    additionalBankMappingVerified: false,
    bankChecks: checkDualCtBanks(readings),
    readings,
    channelMapping: 'unverified',
    pairingEnabled: false,
    contributesToEnergy: false,
    controlsEnabled: false,
  };
}
