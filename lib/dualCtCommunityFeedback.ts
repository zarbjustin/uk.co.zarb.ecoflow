import { messageEvidenceSnapshot } from './dualCtMessageEvidence';
import { DualCtDiagnosticEvents, dualCtEventSnapshot } from './dualCtDiagnosticEvents';
import { appMqttDiagnosticsSnapshot } from './appMqttDiagnostics';

import { CT1_PACKET_REJECTIONS } from './dualCtRecoveryDiagnostics';

/** Local, bounded classifications only. No powers, energy totals, IDs, timestamps or uploads. */
const statuses = ['startup_source_failed', 'startup_contract_failed', 'startup_binding_failed', 'startup_admission_failed', 'startup_subscription_failed',
  'identity_refresh_failed', 'anchor', 'gap', 'eligible_interval', 'delivery_rejected', 'recovery', ...CT1_PACKET_REJECTIONS];

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
    messageEvidence: messageEvidenceSnapshot(input.messageEvidence),
    recentEvents: dualCtEventSnapshot(input.recentEvents, statuses),
    transport: appMqttDiagnosticsSnapshot(input.transport),
    retryScheduled: input.retryScheduled === true,
    eligibleIntervalMs: count(input.eligibleIntervalMs),
    rejectedGapMs: count(input.rejectedGapMs),
    coveragePercent: null,
    referenceAccuracy: null,
    uploadedAutomatically: false,
  };
}
export class DualCtCommunityFeedback {
  private readonly events: Record<string, number> = {};
  private readonly recentEvents = new DualCtDiagnosticEvents(statuses);
  private eligibleMs = 0;
  private gapMs = 0;
  record(status: string, durationMs = 0): void {
    if (!statuses.includes(status)) return;
    this.recentEvents.record(status);
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
      recentEvents: this.recentEvents.snapshot(),
      eligibleIntervalMs: this.eligibleMs,
      rejectedGapMs: this.gapMs,
      coveragePercent: null,
      referenceAccuracy: null,
      uploadedAutomatically: false,
    };
  }
}
