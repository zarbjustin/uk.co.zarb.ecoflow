import { DualCtCounterRecord } from './dualCtCounters';

const FIELDS = [1, 2, 3, 4, 6, 7];
const LIMIT_MS = 15 * 60 * 1000;
export const DUAL_CT_CONTINUITY_STATES = ['baseline', 'compared', 'increased', 'decreased', 'unchanged', 'missing',
  'invalid', 'gap', 'source_changed', 'out_of_order', 'same_receipt', 'structure_only'] as const;
type State = typeof DUAL_CT_CONTINUITY_STATES[number];
type Row = { receivedAt: number; source: string; samples: number; firstAt: number;
  fields: Map<number, number>; latest: Array<{ field: number; status: State }>;
  status: State; events: Record<string, number> };

/** Calendar evidence, not a daily total. UTC elapsed time never uses a fixed 24h local day. */
export function dualCtPeriodEvidence(firstAt: number, lastAt: number, timeZone?: string) {
  let boundary = 'unavailable';
  const valid = Number.isFinite(firstAt) && firstAt > 0 && Number.isFinite(lastAt) && lastAt >= firstAt;
  if (valid && typeof timeZone === 'string' && timeZone.length <= 64) {
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      });
      boundary = formatter.format(firstAt) === formatter.format(lastAt) ? 'same_local_day' : 'local_day_changed';
    } catch { /* No valid timezone means no local-day assertion. */ }
  }
  return {
    boundary,
    observedSpanSec: valid ? (lastAt - firstAt) / 1000 : null,
    observationBasis: 'receipt_time_only',
    dailyAvailable: false,
    dailyUnavailableReason: 'unverified_period_and_no_day_start_baseline',
    cumulativeOrigin: 'unknown',
    restartContinuityVerified: false,
  };
}

/** Fixed-size capture-local observations, NOT an integrator or a reset detector. */
export class DualCtContinuity {
  private rows = new Map<string, Row>();
  private startedAt: number | null = null;
  private lastNow = 0;
  private expired = false;

  private readonly enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled === true;
  }

  clear(): void {
    this.rows.clear(); this.startedAt = null; this.lastNow = 0; this.expired = false;
  }

  private clock(now: number): boolean {
    if (!Number.isFinite(now) || now <= 0 || now < this.lastNow) {
      this.clear(); return false;
    }
    this.lastNow = now;
    if (this.startedAt !== null && now - this.startedAt >= LIMIT_MS) {
      this.rows.clear(); this.expired = true;
    }
    return !this.expired;
  }

  /** Called only after strict model/topic/header/encoding/scalar admission. Missing records break the chain. */
  observe(deviceIndex: number, records: DualCtCounterRecord[], receivedAt: number, now: number, source: string): void {
    if (!this.enabled || !this.clock(now) || ![0, 1].includes(deviceIndex)
      || !Number.isFinite(receivedAt) || receivedAt <= 0 || receivedAt > now || now - receivedAt >= 90000
      || !['explicit_zero', 'omitted_zero_candidate'].includes(source)) return;
    if (this.startedAt === null) this.startedAt = now;
    for (const parent of [773, 997]) {
      const key = `${deviceIndex}:${parent}`;
      const previous = this.rows.get(key);
      if (previous && previous.samples >= 2048) continue;
      const event = (row: Row, state: State) => {
        row.events[state] = Math.min(2048, (row.events[state] || 0) + 1);
      };
      if (previous && receivedAt < previous.receivedAt) {
        event(previous, 'out_of_order'); continue; // Cannot refresh evidence or replace a baseline.
      }
      const row: Row = previous || {
        receivedAt, source, samples: 0, firstAt: receivedAt, fields: new Map(), latest: [], status: 'baseline', events: {},
      };
      const matches = records.filter((record) => record.parent === parent);
      const record = matches.length === 1 ? matches[0] : null;
      const next = new Map<number, number>();
      let state: State = 'baseline';
      if (!matches.length) state = 'missing';
      else if (!record || record.status !== 'observed') state = 'invalid';
      else if (parent === 997) state = 'structure_only';
      else {
        for (const candidate of record.candidates) {
          if (!FIELDS.includes(candidate.field) || candidate.candidateUnit !== null || next.has(candidate.field)
            || !Number.isFinite(candidate.value) || Math.abs(candidate.value) > 1e12) {
            state = 'invalid'; break;
          }
          next.set(candidate.field, candidate.value);
        }
        if (state !== 'invalid' && previous) {
          if (receivedAt === previous.receivedAt) state = 'same_receipt';
          else if (source !== previous.source) state = 'source_changed';
          else if (receivedAt - previous.receivedAt >= 90000) state = 'gap';
        }
      }
      row.latest = parent === 773 ? FIELDS.map((field) => {
        let status: State = state;
        if (!['invalid', 'missing', 'same_receipt'].includes(state)) {
          if (!next.has(field)) status = 'missing';
          else if (state === 'baseline' && row.fields.has(field)) {
            const value = next.get(field)!; const old = row.fields.get(field)!;
            if (value === old) status = 'unchanged';
            else status = value > old ? 'increased' : 'decreased';
          }
        }
        return { field, status };
      }) : [];
      if (state === 'baseline' && row.fields.size) state = 'compared';
      row.status = state; event(row, state);
      // Preserve evidence of an earlier change even after the latest packet is unchanged.
      // Each outcome is counted at most once per record/receipt, not once per child.
      for (const outcome of ['increased', 'decreased', 'unchanged', 'missing'] as const) {
        if (outcome !== state && row.latest.some((field) => field.status === outcome)) event(row, outcome);
      }
      row.samples += 1; row.receivedAt = receivedAt; row.source = source;
      // A same-receipt conflict, invalid or absent record cannot establish the next comparison baseline.
      row.fields = ['invalid', 'missing', 'same_receipt'].includes(state) ? new Map() : next;
      this.rows.set(key, row);
    }
  }

  snapshot(now: number) {
    const valid = this.clock(now);
    return {
      enabled: this.enabled === true,
      scope: 'bounded_capture_receipt_observations',
      valuesIncluded: false,
      period: 'unknown',
      dailyAvailable: false,
      unitsVerified: false,
      resetVerified: false,
      contributesToEnergy: false,
      records: valid && this.enabled ? [...this.rows].map(([key, row]) => {
        const [deviceIndex, parent] = key.split(':').map(Number);
        return {
          deviceIndex,
          parent,
          status: row.status,
          observations: row.samples,
          receivedAgeSec: (now - row.receivedAt) / 1000,
          stale: now - row.receivedAt >= 90000,
          fields: row.latest.map((field) => ({ ...field })),
          events: Object.fromEntries(DUAL_CT_CONTINUITY_STATES.filter((state) => row.events[state]).map((state) => [state, row.events[state]])),
          periodEvidence: dualCtPeriodEvidence(row.firstAt, row.receivedAt),
        };
      }) : [],
    };
  }
}
