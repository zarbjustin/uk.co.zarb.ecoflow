'use strict';

import { reporterShadowSnapshot } from './streamReporterShadow';
import { reportingSnapshot } from './streamReportingDiagnostics';
import { readStreamTopologyEvidence, streamTopologyFamily } from './streamTopology';
import { systemReporterSnapshot } from './streamReporterEvidence';
import { chargingState } from './streamAc5000Mapping';
import { timelineSnapshot } from './reporterTimeline';

export const MONITORING_TRIAL_SETTING = 'use_5000_reporter_trial';
export const MONITORING_TRIAL_STORE = 'monitoringReporterId';
export const MONITORING_STATE_STORE = 'monitoringTrialState';
export const MONITORING_TICK_MS = 15000;
export const MONITORING_RESOLVE_MS = 240000;
export const MONITORING_LOOKUP_DEADLINE_MS = 20000;

export interface MonitoringState {
  version: 1;
  mode: 'trial' | 'rollback' | 'original';
  reporterId: string | null;
}

/** Single private state record; invalid records never enable a guessed reporter. */
export function readMonitoringState(input: any): MonitoringState | null {
  if (input?.version !== 1 || !['trial', 'rollback', 'original'].includes(input.mode)) return null;
  if (input.mode === 'trial') {
    if (typeof input.reporterId !== 'string' || !input.reporterId.trim() || input.reporterId.length > 256) return null;
  } else if (input.reporterId !== null) return null;
  return { version: 1, mode: input.mode, reporterId: input.reporterId };
}

// Never present old installation totals/flows alongside a new reporter's SOC.
// Unit sensors and control settings retain their original source and labels.
export const TRIAL_SUPPRESSED_CAPABILITIES = [
  'measure_power.pv', 'measure_power.grid', 'measure_power.load',
  'measure_power.grid_import', 'measure_power.grid_export',
  'measure_power.pv1', 'measure_power.pv2', 'measure_power.pv3', 'measure_power.pv4',
  'measure_power.schuko1', 'measure_power.schuko2',
  'measure_power.from_pv', 'measure_power.from_battery', 'measure_power.from_grid',
  'charge_remaining', 'discharge_remaining',
] as const;

const devices = (homey: any, driverId: string): any[] => {
  try {
    const found = homey.drivers.getDriver(driverId)?.getDevices?.();
    return Array.isArray(found) ? found : [];
  } catch {
    return [];
  }
};

export interface MonitoringSelection {
  status: string;
  reporterId: string | null;
  candidateDevice: { driverId: string; deviceIndex: number } | null;
  /** Conservative expiry of this exact applied snapshot, not a later packet. */
  validUntil: number | null;
  values: { measure_battery: number | null; measure_power: number | null; battery_charging_state: string | null };
}

/** Local cache only. No account discovery, subscriptions, identity writes or commands. */
export function selectMonitoringReporter(homey: any, device: any, now: number,
  pinnedId?: string | null, activating = false): MonitoringSelection {
  const empty = (status: string): MonitoringSelection => ({
    status,
    reporterId: null,
    candidateDevice: null,
    validUntil: null,
    values: { measure_battery: null, measure_power: null, battery_charging_state: null },
  });
  try {
    const original = devices(homey, 'stream');
    const index = original.indexOf(device);
    if (index < 0) return empty('aggregate_unavailable');
    const aggregates = original.map((d, deviceIndex) => ({
      driverId: 'stream',
      deviceIndex,
      addressSn: readStreamTopologyEvidence(d)?.addressSn,
      resolution: d.getResolvedReporterEvidence?.(),
      reporting: reportingSnapshot(d, now),
    }));
    const reporters = ['stream_5000_unit', 'stream_5000_system', 'stream_ac5000'].flatMap((driverId) => (
      devices(homey, driverId).map((d, deviceIndex) => ({
        driverId,
        deviceIndex,
        device: d,
        evidence: readStreamTopologyEvidence(d),
        system: systemReporterSnapshot(d.getSystemReporterDiagnostics?.()),
      }))
    ));
    const result = reporterShadowSnapshot(aggregates, reporters, now)[index] as any;
    if (result.status !== 'comparison_ready') return empty(result.status);
    const candidate = reporters.find((r) => r.driverId === result.candidateDevice?.driverId
      && r.deviceIndex === result.candidateDevice?.deviceIndex)!;
    // A second Energy aggregate is never used as a cache donor: that would count
    // the same installation twice. Keep the optional physical monitor instead.
    if (candidate.driverId === 'stream_5000_system') return empty('duplicate_energy_aggregate');
    if (!['ac_5000', 'stream_5000'].includes(streamTopologyFamily(candidate.evidence!.addressSn))) {
      return empty('unsupported_reporter');
    }
    const reporterId = candidate.device.getId?.();
    if (typeof reporterId !== 'string' || !reporterId) return empty('reporter_identity_unavailable');
    if (pinnedId && reporterId !== pinnedId) return empty('selected_reporter_changed');
    if (original.some((other, i) => other !== device
      && (aggregates[i].addressSn?.toUpperCase() === aggregates[index].addressSn?.toUpperCase()
        || candidate.evidence?.peers.some((peer) => peer.sn === aggregates[i].addressSn
          && peer.seenAt <= now && now - peer.seenAt <= 180000)
        || readMonitoringState(other.getStoreValue?.(MONITORING_STATE_STORE))?.reporterId === reporterId
        || (other.getStoreValue?.(MONITORING_STATE_STORE) == null
          && other.getStoreValue?.(MONITORING_TRIAL_STORE) === reporterId)))) return empty('ambiguous_representations');
    if (reporters.some((r) => r.driverId === 'stream_5000_system'
      && r.evidence?.peers.some((peer) => peer.sn === aggregates[index].addressSn
        && peer.seenAt <= now && now - peer.seenAt <= 180000))) return empty('duplicate_energy_aggregate');
    if (candidate.evidence?.truncated) return empty('topology_truncated');
    const connection = candidate.device.getConnectionDiagnostics?.();
    if (connection?.subscriptionState !== 'active') return empty('reporter_connection_unavailable');
    if (activating && ['socPct', 'batteryW'].some((key) => (
      result.comparisons[key].status !== 'comparable_receipts'
    ))) return empty('fresh_comparison_required');
    const soc = candidate.system.socPct;
    const power = candidate.system.batteryW;
    const fresh = (field: any) => field?.stale === false && field.ageSec <= 180;
    const socValue = fresh(soc) ? soc.value : null;
    const powerValue = fresh(power) ? power.value : null;
    return {
      status: socValue !== null && powerValue !== null ? 'active' : 'fields_missing_or_stale',
      reporterId,
      candidateDevice: result.candidateDevice,
      // Ages are rounded down in diagnostics. Subtract another second so a
      // changing donor cannot renew the lifetime of older applied values.
      validUntil: socValue !== null && powerValue !== null
        ? now + Math.max(0, 179 - Math.max(soc.ageSec, power.ageSec)) * 1000 : null,
      values: {
        measure_battery: socValue,
        measure_power: powerValue,
        battery_charging_state: powerValue === null ? null : chargingState(powerValue),
      },
    };
  } catch {
    return empty('evidence_unavailable');
  }
}

/** Fixed anonymous support projection, including partial/stale trial states. */
export function monitoringTrialSnapshot(input: any): Record<string, unknown> {
  const statuses = ['disabled', 'waiting_for_validation', 'active', 'fields_missing_or_stale',
    'aggregate_unavailable', 'resolution_unavailable', 'resolution_stale', 'legacy_address_mismatch',
    'reporter_unchanged', 'resolved_reporter_not_paired', 'ambiguous_representations',
    'fresh_peer_correlation_missing', 'duplicate_energy_aggregate', 'unsupported_reporter',
    'reporter_identity_unavailable', 'selected_reporter_changed', 'topology_truncated',
    'reporter_connection_unavailable', 'fresh_comparison_required', 'evidence_unavailable', 'application_failed', 'pending_apply'];
  const candidate = input?.candidateDevice;
  return {
    enabled: input?.enabled === true,
    status: statuses.includes(input?.status) ? input.status : 'disabled',
    candidateDevice: candidate && ['stream_5000_unit', 'stream_ac5000'].includes(candidate.driverId)
      && Number.isSafeInteger(candidate.deviceIndex) && candidate.deviceIndex >= 0
      ? { driverId: candidate.driverId, deviceIndex: candidate.deviceIndex } : null,
    readingScope: 'system_soc_and_derived_battery_power_only',
    accountingSource: 'original_address_unchanged_scope_unverified',
    controlMigrationAllowed: false,
    installationScopeVerified: false,
    requiresRePairing: false,
    rollbackAvailable: true,
    rollbackAwaitingFreshOriginal: input?.rollbackAwaitingFreshOriginal === true,
    updatePending: input?.enabled === true && input?.updatePending === true,
    readiness: {
      eligibilityScope: 'activation_only',
      eligible: input?.readiness?.eligible === true && input?.enabled !== true
        && input?.rollbackAwaitingFreshOriginal !== true && input?.readiness?.status === 'active',
      status: statuses.includes(input?.readiness?.status) ? input.readiness.status : 'waiting_for_validation',
    },
    timeline: timelineSnapshot(input?.timeline, Date.now()),
    coalescedLocalTicks: Number.isSafeInteger(input?.coalescedLocalTicks) && input.coalescedLocalTicks >= 0
      ? input.coalescedLocalTicks : 0,
    localRefreshIntervalSec: 15,
    resolutionCheckIntervalSec: 240,
  };
}
