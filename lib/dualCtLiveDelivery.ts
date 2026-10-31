import { AppFrameDelivery } from './EcoFlowAppMqtt';
import { decodeFrameHeaders } from './streamAc5000Protocol';

/** Receipt-estimate accounting is deliberately narrower than the diagnostic 90 s display TTL. */
export const DUAL_CT_LIVE_INTERVAL_MS = 5000;

function fields(bytes: Buffer): Array<{ id: number; wire: number; value: bigint | Buffer }> {
  let at = 0;
  const integer = () => {
    let value = 0n;
    for (let shift = 0n; shift < 70n && at < bytes.length; shift += 7n) {
      const n = bytes[at++]; value |= BigInt(n & 127) << shift;
      if (!(n & 128)) return value;
    }
    throw new Error('invalid_wire');
  };
  const rows: Array<{ id: number; wire: number; value: bigint | Buffer }> = [];
  while (at < bytes.length) {
    const tag = integer(); const id = Number(tag >> 3n); const wire = Number(tag & 7n);
    if (id <= 0 || id > 0x1fffffff) throw new Error('invalid_field');
    if (wire === 0) rows.push({ id, wire, value: integer() });
    else {
      let length = -1;
      if (wire === 2) length = Number(integer());
      else if (wire === 5) length = 4;
      else if (wire === 1) length = 8;
      if (!Number.isSafeInteger(length) || length < 0 || at + length > bytes.length) throw new Error('invalid_length');
      rows.push({ id, wire, value: bytes.subarray(at, at + length) }); at += length;
    }
  }
  return rows;
}

/** Presence only. An unrelated voltage/counter/CT2 packet must not erase a CT1 power anchor. */
export function dualCtContainsFields(bytes: Buffer, ids: readonly number[]): boolean | null {
  try {
    return fields(bytes).some((field) => ids.includes(field.id));
  } catch {
    return null;
  }
}

/** Product-421 observed envelope sequence, not a hardware measurement timestamp. */
function sequence(payload: Buffer): number | null {
  try {
    const headers = fields(payload).filter((f) => f.id === 1);
    if (headers.length !== 1 || headers[0].wire !== 2 || !Buffer.isBuffer(headers[0].value)) return null;
    const values = fields(headers[0].value).filter((f) => f.id === 14);
    if (values.length !== 1 || values[0].wire !== 0 || typeof values[0].value !== 'bigint'
      || values[0].value > 0xffffffffn) return null;
    return Number(values[0].value);
  } catch {
    return null;
  }
}

/** Per owned subscription epoch. No storage, capability, Energy or network operations. */
export class DualCtLiveDelivery {
  private previous: { seq: number; wall: number; mono: number } | null = null;

  inspect(payload: Buffer, topic: string, expectedTopic: string, delivery: Readonly<AppFrameDelivery> | undefined, now: number) {
    const reject = (status: string, restartAnchor = false) => {
      if (restartAnchor) this.previous = null;
      return { accepted: false, status, restartAnchor };
    };
    if (topic !== expectedTopic || !Buffer.isBuffer(payload) || !payload.length || payload.length > 65536) return reject('delivery_scope');
    if (!delivery || delivery.retained !== false || delivery.duplicate !== false
      || !Number.isFinite(delivery.receivedAt) || delivery.receivedAt <= 0 || !Number.isFinite(delivery.receivedMonoMs) || delivery.receivedMonoMs < 0
      || !Number.isFinite(now) || now < delivery.receivedAt || now - delivery.receivedAt >= DUAL_CT_LIVE_INTERVAL_MS) return reject('delivery_not_live');
    try {
      const headers = decodeFrameHeaders(payload);
      if (headers.length !== 1 || headers[0].candidateHeaderValid === false
        || headers[0].cmdFunc !== 254 || headers[0].cmdId !== 21) return reject('not_ct1_property_upload');
      const hasPower = headers[0].pdata && dualCtContainsFields(headers[0].pdata, [515, 962, 963, 772]);
      if (hasPower === false) return reject('unrelated_grid_packet');
      if (!hasPower) return reject('invalid_grid_payload');
    } catch {
      return reject('invalid_header');
    }
    const seq = sequence(payload);
    if (seq === null) return reject('sequence_required');
    const last = this.previous;
    if (last) {
      if (seq === last.seq) return reject('sequence_duplicate');
      if (seq < last.seq) return reject('sequence_reset', true);
      const wall = delivery.receivedAt - last.wall; const mono = delivery.receivedMonoMs - last.mono;
      if (wall < 0 || mono < 0 || Math.abs(wall - mono) > 1000) return reject('clock_discontinuity', true);
      if (mono >= DUAL_CT_LIVE_INTERVAL_MS) return reject('delivery_gap', true);
    }
    this.previous = { seq, wall: delivery.receivedAt, mono: delivery.receivedMonoMs };
    return { accepted: true, status: 'receipt_estimate', restartAnchor: false };
  }
}
