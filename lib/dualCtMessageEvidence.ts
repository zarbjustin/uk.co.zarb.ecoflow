import { decodeFrameHeaders } from './streamAc5000Protocol';
import { dualCtContainsFields } from './dualCtLiveDelivery';
import { DUAL_CT_MONITOR_EVENTS } from './dualCtDiagnosticEvents';

const OUTCOMES = [...DUAL_CT_MONITOR_EVENTS, 'delivery_eligible', 'delivery_scope', 'delivery_not_live',
  'connection_changed', 'not_ct1_property_upload', 'unrelated_grid_packet', 'invalid_grid_payload', 'invalid_header',
  'sequence_required', 'sequence_duplicate', 'sequence_reset', 'clock_discontinuity', 'delivery_gap'];
const FIELDS = [515, 962, 963, 772];
const TTL = 900000;
const categories = ['property', 'get_reply', 'other'];
const formats = ['binary', 'json', 'invalid', 'oversized'];
type Shape = { topicKind: string; format: string; cmdFunc: number | null; cmdId: number | null;
  headerCount: number; encoding: string; ct1FieldsPresent: number[]; outcome: string };
type Row = Shape & { first: number; last: number; count: number; minGapMs: number | null; maxGapMs: number | null };

/** A second whitelist at the export boundary, including nested properties. */
export function messageEvidenceSnapshot(input: any) {
  const bounded = (v: any, max: number) => Number.isSafeInteger(v) && v >= 0 && v <= max;
  const age = (v: any) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  return {
    schemaVersion: 1,
    scope: 'incoming_consumer_metadata',
    retentionSec: TTL / 1000,
    maxGroups: 32,
    outgoingRequestsObserved: false,
    fieldPresenceIsNotValidation: true,
    gapBasis: 'between_consumer_messages_not_measurements',
    evictedGroups: bounded(input?.evictedGroups, 65535) ? input.evictedGroups : 0,
    groups: (Array.isArray(input?.groups) ? input.groups : []).slice(-32).filter((r: any) => r && categories.includes(r.topicKind)
      && formats.includes(r.format) && OUTCOMES.includes(r.outcome) && bounded(r.count, 65535) && r.count > 0
      && age(r.firstAgeSec) && age(r.lastAgeSec) && r.firstAgeSec >= r.lastAgeSec && r.firstAgeSec < TTL / 1000)
      .map((r: any) => ({
        topicKind: r.topicKind,
        format: r.format,
        outcome: r.outcome,
        cmdFunc: bounded(r.cmdFunc, 65535) ? r.cmdFunc : null,
        cmdId: bounded(r.cmdId, 65535) ? r.cmdId : null,
        headerCount: bounded(r.headerCount, 17) ? r.headerCount : 0,
        encoding: ['zero', 'omitted', 'other'].includes(r.encoding) ? r.encoding : 'unknown',
        ct1FieldsPresent: FIELDS.filter((id) => Array.isArray(r.ct1FieldsPresent) && r.ct1FieldsPresent.includes(id)),
        firstAgeSec: r.firstAgeSec,
        lastAgeSec: r.lastAgeSec,
        count: r.count,
        minGapMs: age(r.minGapMs) ? r.minGapMs : null,
        maxGapMs: age(r.maxGapMs) ? r.maxGapMs : null,
      })),
  };
}

/** Metadata only. Never retain bytes, readings, serials, topics or wall-clock exports. */
export class DualCtMessageEvidence {
  private rows: Row[] = [];
  private lastAt: number | null = null;
  private evicted = 0;
  record(payload: Buffer, topicKind: string, outcome: string, now = Date.now()): void {
    if (!Number.isFinite(now) || now <= 0 || !OUTCOMES.includes(outcome)) return;
    if (this.lastAt !== null && now < this.lastAt) {
      this.rows = []; this.evicted = 0; this.lastAt = null;
    }
    this.rows = this.rows.filter((r) => now - r.first < TTL);
    const shape: Shape = {
      topicKind: categories.includes(topicKind) ? topicKind : 'other',
      format: 'invalid',
      cmdFunc: null,
      cmdId: null,
      headerCount: 0,
      encoding: 'unknown',
      ct1FieldsPresent: [],
      outcome,
    };
    if (Buffer.isBuffer(payload) && payload.length > 65536) shape.format = 'oversized';
    else if (Buffer.isBuffer(payload) && payload.length) {
      try {
        if (payload.toString('utf8').trimStart().startsWith('{')) {
          try {
            JSON.parse(payload.toString('utf8')); shape.format = 'json';
          } catch { /* Binary may contain a brace. */ }
        }
        if (shape.format !== 'json') {
          const headers = decodeFrameHeaders(payload);
          shape.headerCount = Math.min(17, headers.length);
          if (headers.length === 1 && headers[0].candidateHeaderValid !== false) {
            const h = headers[0]; shape.format = 'binary';
            shape.cmdFunc = Number.isInteger(h.cmdFunc) && h.cmdFunc >= 0 && h.cmdFunc <= 65535 ? h.cmdFunc : null;
            shape.cmdId = Number.isInteger(h.cmdId) && h.cmdId >= 0 && h.cmdId <= 65535 ? h.cmdId : null;
            shape.encoding = 'other';
            if (h.encType === undefined) shape.encoding = 'omitted';
            else if (h.encType === 0) shape.encoding = 'zero';
            if (shape.cmdFunc === 254 && [21, 39].includes(shape.cmdId!) && shape.encoding !== 'other' && h.pdata) {
              shape.ct1FieldsPresent = FIELDS.filter((id) => dualCtContainsFields(h.pdata!, [id]) === true);
            }
          }
        }
      } catch { /* Classified invalid; never copy exception text. */ }
    }
    const gap = this.lastAt === null ? null : now - this.lastAt;
    const last = this.rows[this.rows.length - 1];
    const key = (r: Shape) => JSON.stringify([r.topicKind, r.format, r.cmdFunc, r.cmdId, r.headerCount, r.encoding, r.ct1FieldsPresent, r.outcome]);
    if (last && key(last) === key(shape)) {
      last.last = now; last.count = Math.min(65535, last.count + 1);
      if (gap !== null) {
        last.minGapMs = Math.min(last.minGapMs ?? gap, gap); last.maxGapMs = Math.max(last.maxGapMs ?? gap, gap);
      }
    } else {
      this.rows.push({
        ...shape, first: now, last: now, count: 1, minGapMs: gap, maxGapMs: gap,
      });
      if (this.rows.length > 32) {
        this.rows.shift(); this.evicted = Math.min(65535, this.evicted + 1);
      }
    }
    this.lastAt = now;
  }

  snapshot(now = Date.now()) {
    if (!Number.isFinite(now) || (this.lastAt !== null && now < this.lastAt)) {
      this.rows = []; this.lastAt = null; this.evicted = 0;
    }
    this.rows = this.rows.filter((r) => now >= r.last && now - r.first < TTL);
    return messageEvidenceSnapshot({
      evictedGroups: this.evicted,
      groups: this.rows.map(({ first, last, ...r }) => ({
        ...r,
        firstAgeSec: (now - first) / 1000,
        lastAgeSec: (now - last) / 1000,
      })),
    });
  }
}
