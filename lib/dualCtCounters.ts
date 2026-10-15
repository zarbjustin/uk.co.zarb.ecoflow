import { decodeDualCtCandidates, DualCtDecodeContext } from './dualCtDecoder';

const PARENTS = [773, 997];
const FLOAT_CANDIDATES = [1, 2, 3, 4, 6, 7];
type Field = { field: number; wire: number; start: number; end: number };

/** Bounded one-level wire walk. Never recurse into strings, blobs or further records. */
function walk(bytes: Buffer, maxFields: number): Field[] {
  let pos = 0;
  const out: Field[] = [];
  const integer = () => {
    let result = 0n;
    for (let i = 0; i < 10; i += 1) {
      if (pos >= bytes.length) throw new Error('truncated');
      const byte = bytes[pos++];
      if (i === 9 && byte > 1) throw new Error('overflow');
      result |= BigInt(byte & 127) << BigInt(i * 7);
      if (!(byte & 128)) return result;
    }
    throw new Error('overflow');
  };
  while (pos < bytes.length) {
    if (out.length >= maxFields) throw new Error('limit');
    const tag = integer();
    if (tag < 8n || tag > 0xffffffffn) throw new Error('tag');
    const field = Number(tag >> 3n); const wire = Number(tag & 7n);
    let start = pos;
    if (wire === 0) integer();
    else {
      const length = wire === 2 ? integer() : BigInt(({ 1: 8, 5: 4 } as Record<number, number>)[wire] || 0);
      if (![1, 2, 5].includes(wire) || length > BigInt(bytes.length - pos)) throw new Error('length');
      start = pos; pos += Number(length);
    }
    out.push({
      field, wire, start, end: pos,
    });
  }
  return out;
}

/** Hypothetical field arithmetic only. Not Wh, daily/lifetime, import/export or CT roles. */
export function checkDualCtCounterFields(parent: number, candidates: Array<{ field: number; value: number }>) {
  if (parent !== 773) return [];
  const fields = new Map<number, number>();
  let invalid = false;
  for (const row of candidates) {
    if (!FLOAT_CANDIDATES.includes(row.field) || fields.has(row.field)
      || !Number.isFinite(row.value) || Math.abs(row.value) > 1e12) invalid = true;
    fields.set(row.field, row.value);
  }
  return [{ expression: '4-6=7', required: [4, 6, 7] }, { expression: '1+2+3=7', required: [1, 2, 3, 7] }].map(({ expression, required }) => {
    let status = 'partial';
    if (invalid) status = 'invalid';
    else if (required.every((field) => fields.has(field))) {
      const values = required.map((field) => fields.get(field)!);
      const difference = expression === '4-6=7' ? values[0] - values[1] - values[2] : values[0] + values[1] + values[2] - values[3];
      const tolerance = 0.001 + 1e-6 * values.reduce((sum, value) => sum + Math.abs(value), 0);
      status = Math.abs(difference) <= tolerance ? 'consistent' : 'mismatch';
    }
    return {
      expression, status, scope: 'single_nested_record', verified: false,
    };
  });
}

/** Only after the existing scalar signature/model/topic/encoding checks pass. */
export function inspectDualCtCounterRecords(payload: Buffer, context: DualCtDecodeContext, numericEnabled = false) {
  if (!decodeDualCtCandidates(payload, context)) return [];
  const outer = walk(payload, 256);
  return PARENTS.flatMap((parent) => {
    const matches = outer.filter((row) => row.field === parent);
    if (!matches.length) return [];
    const metadata = {
      parent,
      status: 'observed',
      fields: [] as Array<{ field: number; wire: number }>,
      fieldsAvailable: 0,
      fieldsIncluded: 0,
      fieldsOmitted: false,
      candidates: [] as Array<{ field: number; value: number; candidateUnit: null }>,
      checks: [] as ReturnType<typeof checkDualCtCounterFields>,
      unitsVerified: false,
      period: 'unknown',
      roleVerified: false,
    };
    if (matches.length !== 1 || matches[0].wire !== 2) return [{ ...metadata, status: 'invalid' }];
    const row = matches[0];
    if (row.end - row.start > 2048) return [{ ...metadata, status: 'oversized' }];
    try {
      const inner = payload.subarray(row.start, row.end);
      const children = walk(inner, 32);
      if (new Set(children.map((field) => field.field)).size !== children.length) throw new Error('duplicate');
      // Child numbers/wires only; no arbitrary text, raw bytes, nesting or guessed units.
      metadata.fields = children.filter((field) => field.field <= 64).map((field) => ({ field: field.field, wire: field.wire }));
      metadata.fieldsAvailable = children.length;
      metadata.fieldsIncluded = metadata.fields.length;
      metadata.fieldsOmitted = children.length !== metadata.fields.length;
      if (numericEnabled && parent === 773) {
        for (const field of children.filter((item) => FLOAT_CANDIDATES.includes(item.field))) {
          if (field.wire !== 5) throw new Error('unsupported');
          const value = inner.readFloatLE(field.start);
          if (!Number.isFinite(value) || Math.abs(value) > 1e12) throw new Error('invalid');
          metadata.candidates.push({ field: field.field, value, candidateUnit: null });
        }
        metadata.checks = checkDualCtCounterFields(parent, metadata.candidates);
      }
      // 997 remains structure-only: no independent numeric contract or 773 map clone.
      return [metadata];
    } catch {
      return [{
        ...metadata, status: 'invalid', candidates: [], checks: [],
      }];
    }
  });
}

export type DualCtCounterRecord = ReturnType<typeof inspectDualCtCounterRecords>[number];
