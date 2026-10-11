'use strict';

const EVENTS = ['session_started', 'session_stopped', 'trial_enabled', 'rollback_started',
  'rollback_complete', 'lookup_failed', 'setting_failed', 'state_invalid', 'reporter_state'];
const REASONS = ['active', 'fields_missing_or_stale', 'waiting_for_validation', 'resolution_unavailable',
  'resolution_stale', 'legacy_address_mismatch', 'reporter_unchanged', 'resolved_reporter_not_paired',
  'ambiguous_representations', 'fresh_peer_correlation_missing', 'duplicate_energy_aggregate',
  'unsupported_reporter', 'reporter_identity_unavailable', 'selected_reporter_changed',
  'topology_truncated', 'reporter_connection_unavailable', 'fresh_comparison_required',
  'evidence_unavailable', 'application_failed', 'pending_apply', 'aggregate_unavailable'];

/** Session-only, bounded, fixed vocabulary: never accept IDs or exception strings. */
export class ReporterTimeline {
  private startedAt = 0;
  private events: { at: number; event: string; reason: string | null }[] = [];

  reset(now: number): void {
    this.startedAt = now;
    this.events = [];
    this.record('session_started', now);
  }

  record(event: string, now: number, reason?: string): void {
    if (!EVENTS.includes(event) || !Number.isFinite(now) || now <= 0) return;
    this.events.push({ at: now, event, reason: REASONS.includes(reason || '') ? reason! : null });
    if (this.events.length > 32) this.events.shift();
  }

  snapshot(now: number) {
    // eslint-disable-next-line no-use-before-define -- Shared export projector below owns validation.
    return timelineSnapshot({ startedAt: this.startedAt, events: this.events }, now);
  }
}

/** Re-project even the device-provided snapshot before support export. */
export function timelineSnapshot(input: any, now: number) {
  const startedAt = typeof input?.startedAt === 'number' && Number.isFinite(input.startedAt)
    && input.startedAt > 0 && input.startedAt <= now ? input.startedAt : null;
  return {
    startedAt,
    sessionUptimeSec: startedAt === null ? null : Math.floor((now - startedAt) / 1000),
    events: (Array.isArray(input?.events) ? input.events : []).slice(-32).flatMap((entry: any) => {
      if (!EVENTS.includes(entry?.event) || typeof entry.at !== 'number' || !Number.isFinite(entry.at)
        || startedAt === null || entry.at < startedAt || entry.at > now) return [];
      return [{ at: entry.at, event: entry.event, reason: REASONS.includes(entry.reason) ? entry.reason : null }];
    }),
  };
}
