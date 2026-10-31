/** Local, bounded classifications only. No powers, energy totals, IDs, timestamps or uploads. */
const statuses = ['delivery_gap', 'sequence_required', 'sequence_duplicate', 'sequence_reset',
  'clock_discontinuity', 'delivery_not_live', 'delivery_scope', 'not_ct1_property_upload',
  'invalid_grid_payload', 'invalid_header', 'anchor', 'gap', 'eligible_interval', 'out_of_order', 'delivery_rejected', 'recovery',
  'unrelated_grid_packet', 'contract_blocked', 'source_qualification_mismatch', 'transport_rejected',
  'receipt_expired', 'measurement_time_required', 'timing_basis_conflict', 'header_rejected', 'ambiguous_packet',
  'encoding_contract_conflict', 'decode_rejected', 'incomplete_grid_phases', 'wiring_outside_qualification',
  'complete_grid_total_required', 'grid_total_mismatch', 'power_rejected'];
const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER ? v : 0);
export function dualCtCommunityFeedbackSnapshot(input: any) {
  if (input?.scope !== 'three_phase_community_trial') return null;
  const counts: Record<string, number> = {};
  for (const status of statuses) if (count(input.counts?.[status]) > 0) counts[status] = count(input.counts[status]);
  return {
    schemaVersion: 1,
    scope: 'three_phase_community_trial',
    hardwareValidated: false,
    accountingPolicy: 'signed_phase_sum',
    timing: 'receipt_estimate',
    persistence: 'since_app_start',
    counts,
    eligibleIntervalMs: count(input.eligibleIntervalMs),
    rejectedGapMs: count(input.rejectedGapMs),
    coveragePercent: null,
    referenceAccuracy: null,
    uploadedAutomatically: false,
  };
}
export class DualCtCommunityFeedback {
  private readonly events: Record<string, number> = {};
  private eligibleMs = 0;
  private gapMs = 0;
  record(status: string, durationMs = 0): void {
    if (!statuses.includes(status)) return;
    if (!Object.prototype.hasOwnProperty.call(this.events, status) && Object.keys(this.events).length >= 64) return;
    this.events[status] = Math.min(Number.MAX_SAFE_INTEGER, (this.events[status] || 0) + 1);
    if (Number.isFinite(durationMs) && durationMs > 0 && durationMs < 86400000) {
      if (status === 'eligible_interval') this.eligibleMs = Math.min(Number.MAX_SAFE_INTEGER, this.eligibleMs + durationMs);
      if (status === 'gap') this.gapMs = Math.min(Number.MAX_SAFE_INTEGER, this.gapMs + durationMs);
    }
  }

  snapshot() {
    return {
      schemaVersion: 1,
      scope: 'three_phase_community_trial',
      hardwareValidated: false,
      accountingPolicy: 'signed_phase_sum',
      timing: 'receipt_estimate',
      persistence: 'since_app_start',
      counts: { ...this.events },
      eligibleIntervalMs: this.eligibleMs,
      rejectedGapMs: this.gapMs,
      coveragePercent: null,
      referenceAccuracy: null,
      uploadedAutomatically: false,
    };
  }
}
