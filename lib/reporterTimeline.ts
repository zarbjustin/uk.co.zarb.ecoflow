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
  private lastAt = 0;
  private state: 'active' | 'unavailable' | null = null;
  private telemetryUnavailable = false;
  private activeMs = 0;
  private unavailableMs = 0;
  private unavailableRunMs = 0;
  private telemetryRunMs = 0;
  private longestUnavailableMs = 0;
  private longestTelemetryMs = 0;
  private transitions = 0;
  private dropped = 0;
  private clockResets = 0;
  private lastReason: string | null = null;
  private lastHealthyAt = 0;

  reset(now: number): void {
    if (!Number.isFinite(now) || now <= 0) return;
    this.startedAt = now;
    this.lastAt = now;
    this.events = [];
    this.state = null;
    this.telemetryUnavailable = false;
    this.activeMs = 0;
    this.unavailableMs = 0;
    this.unavailableRunMs = 0;
    this.telemetryRunMs = 0;
    this.longestUnavailableMs = 0;
    this.longestTelemetryMs = 0;
    this.transitions = 0;
    this.dropped = 0;
    this.clockResets = 0;
    this.lastReason = null;
    this.lastHealthyAt = 0;
    this.record('session_started', now);
  }

  record(event: string, now: number, reason?: string): void {
    if (!EVENTS.includes(event) || !Number.isFinite(now) || now <= 0) return;
    const knownReason = REASONS.includes(reason || '') ? reason! : null;
    if (now < this.lastAt) {
      const resets = this.clockResets + 1;
      this.reset(now);
      this.clockResets = resets;
    }
    if (!this.startedAt) this.reset(now);
    const elapsed = now - this.lastAt;
    // Never fill a long unchecked interval with healthy time. Three minutes is
    // the trial's maximum field freshness; repeated successful checks renew it.
    if (this.state === 'active') this.activeMs += Math.max(0, Math.min(now, this.lastHealthyAt + 180000) - this.lastAt);
    if (this.state === 'unavailable') {
      this.unavailableMs += elapsed;
      this.unavailableRunMs += elapsed;
      this.longestUnavailableMs = Math.max(this.longestUnavailableMs, this.unavailableRunMs);
    }
    if (this.telemetryUnavailable) {
      this.telemetryRunMs += elapsed;
      this.longestTelemetryMs = Math.max(this.longestTelemetryMs, this.telemetryRunMs);
    }
    this.lastAt = now;
    const duplicateState = event === 'reporter_state' && knownReason !== null && knownReason === this.lastReason;
    if (event === 'reporter_state' && knownReason) {
      const state = knownReason === 'active' ? 'active' : 'unavailable';
      if (this.state !== state) this.transitions++;
      this.state = state;
      this.lastReason = knownReason;
      if (state === 'active') this.lastHealthyAt = now;
      if (state === 'active') this.unavailableRunMs = 0;
      this.telemetryUnavailable = ['fields_missing_or_stale', 'reporter_connection_unavailable'].includes(knownReason);
      if (!this.telemetryUnavailable) this.telemetryRunMs = 0;
    } else if (['trial_enabled', 'rollback_started', 'rollback_complete', 'session_stopped'].includes(event)) {
      this.state = null;
      this.lastReason = null;
      this.telemetryUnavailable = false;
      this.unavailableRunMs = 0;
      this.telemetryRunMs = 0;
    }
    if (duplicateState) return;
    this.events.push({ at: now, event, reason: knownReason });
    if (this.events.length > 32) {
      this.events.shift(); this.dropped++;
    }
  }

  snapshot(now: number) {
    const elapsed = Math.max(0, now - this.lastAt);
    const unavailableRun = this.unavailableRunMs + (this.state === 'unavailable' ? elapsed : 0);
    const telemetryRun = this.telemetryRunMs + (this.telemetryUnavailable ? elapsed : 0);
    const activeSec = Math.floor((this.activeMs + (this.state === 'active'
      ? Math.max(0, Math.min(now, this.lastHealthyAt + 180000) - this.lastAt) : 0)) / 1000);
    const unavailableSec = Math.floor((this.unavailableMs + (this.state === 'unavailable' ? elapsed : 0)) / 1000);
    // eslint-disable-next-line no-use-before-define -- Shared export projector below owns validation.
    return timelineSnapshot({
      startedAt: this.startedAt,
      events: this.events,
      summary: {
        activeSec,
        unavailableSec,
        unobservedSec: Math.max(0, Math.floor((now - this.startedAt) / 1000) - activeSec - unavailableSec),
        longestUnavailableSec: Math.floor(Math.max(this.longestUnavailableMs, unavailableRun) / 1000),
        longestObservedTelemetryUnavailableSec: Math.floor(Math.max(this.longestTelemetryMs, telemetryRun) / 1000),
        stateTransitions: this.transitions,
        discardedEvents: this.dropped,
        clockResets: this.clockResets,
      },
    }, now);
  }
}

/** Re-project even the device-provided snapshot before support export. */
export function timelineSnapshot(input: any, now: number) {
  const startedAt = typeof input?.startedAt === 'number' && Number.isFinite(input.startedAt)
    && input.startedAt > 0 && input.startedAt <= now ? input.startedAt : null;
  const uptime = startedAt === null ? null : Math.floor((now - startedAt) / 1000);
  const duration = (key: string) => (uptime !== null && Number.isSafeInteger(input?.summary?.[key])
    && input.summary[key] >= 0 && input.summary[key] <= uptime ? input.summary[key] : null);
  const count = (key: string) => (Number.isSafeInteger(input?.summary?.[key]) && input.summary[key] >= 0
    ? input.summary[key] : null);
  return {
    startedAt,
    sessionUptimeSec: uptime,
    summary: {
      scope: 'session_observed_monitoring_state_not_hardware_acceptance',
      activeSec: duration('activeSec'),
      unavailableSec: duration('unavailableSec'),
      unobservedSec: duration('unobservedSec'),
      longestUnavailableSec: duration('longestUnavailableSec'),
      longestObservedTelemetryUnavailableSec: duration('longestObservedTelemetryUnavailableSec'),
      stateTransitions: count('stateTransitions'),
      discardedEvents: count('discardedEvents'),
      clockResets: count('clockResets'),
    },
    events: (Array.isArray(input?.events) ? input.events : []).slice(-32).flatMap((entry: any) => {
      if (!EVENTS.includes(entry?.event) || typeof entry.at !== 'number' || !Number.isFinite(entry.at)
        || startedAt === null || entry.at < startedAt || entry.at > now) return [];
      return [{ at: entry.at, event: entry.event, reason: REASONS.includes(entry.reason) ? entry.reason : null }];
    }),
  };
}
