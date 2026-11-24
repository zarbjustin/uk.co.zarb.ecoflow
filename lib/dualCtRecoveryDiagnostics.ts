import { LINKED_POWER_STATUSES } from './dualCtLinkedEs21';
import { appMqttDiagnosticsSnapshot } from './appMqttDiagnostics';
import { messageEvidenceSnapshot } from './dualCtMessageEvidence';

// Classifications shared with the bounded community feedback report.
export const CT1_PACKET_REJECTIONS = ['delivery_gap', 'connection_changed', 'sequence_required', 'sequence_duplicate', 'sequence_reset',
  'clock_discontinuity', 'delivery_not_live', 'delivery_scope', 'not_ct1_property_upload',
  'invalid_grid_payload', 'invalid_header', 'out_of_order',
  'unrelated_grid_packet', 'contract_blocked', 'source_qualification_mismatch', 'transport_rejected',
  'receipt_expired', 'measurement_time_required', 'timing_basis_conflict', 'header_rejected', 'ambiguous_packet',
  'encoding_contract_conflict', 'decode_rejected', 'incomplete_grid_phases', 'wiring_outside_qualification',
  'complete_grid_total_required', 'grid_total_mismatch', 'power_rejected'];

const otherSessionRejections = ['backpressure', 'clock_reset', 'accounting_overflow', 'checkpoint_conflict',
  'checkpoint_readback_failed', 'storage_failed', 'authority_lost', 'source_selection_mismatch',
  'model_firmware_changed', 'contract_changed', 'review_unavailable', 'inactive_session', 'invalid_scope',
  'consent_required', 'inventory_unknown', 'grid_source_overlap', 'external_overlap_review_required', 'other_rejection'];
function safeRejection(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return CT1_PACKET_REJECTIONS.includes(value) || otherSessionRejections.includes(value) ? value : 'other_rejection';
}

/** Observation only, scoped to one paired device and account. Store no frame, ID, or power value. */
export class DualCtSinglePhaseFeed {
  private packetAt: number | null = null;
  private acceptedAt: number | null = null;
  private rejectedAt: number | null = null;
  private reason: string | null = null;

  packet(now: number): void {
    this.packetAt = now;
  }

  outcome(status: string, receivedAt: number): void {
    if (status === 'anchor' || status === 'gap' || status === 'eligible_interval') {
      this.acceptedAt = receivedAt;
    } else {
      this.rejectedAt = Date.now();
      this.reason = safeRejection(status);
    }
  }

  snapshot(now = Date.now()) {
    const age = (at: number | null) => (at !== null && at > 0 && now >= at ? (now - at) / 1000 : null);
    return {
      lastPacketAgeSec: age(this.packetAt),
      lastAcceptedCt1AgeSec: age(this.acceptedAt),
      lastRejectionAgeSec: age(this.rejectedAt),
      lastRejectionReason: this.reason,
    };
  }
}

function singlePhaseFeedSnapshot(feed: any) {
  const age = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
  return {
    lastPacketAgeSec: age(feed?.lastPacketAgeSec),
    lastAcceptedCt1AgeSec: age(feed?.lastAcceptedCt1AgeSec),
    lastRejectionAgeSec: age(feed?.lastRejectionAgeSec),
    lastRejectionReason: safeRejection(feed?.lastRejectionReason),
  };
}

/** Fixed classifications only; no source IDs, values, raw errors or authority to change Energy. */
const drivers = ['smartmeter', 'smartmeter_dual_ct_energy', 'smartmeter_dual_ct_preview', 'stream', 'stream_unit',
  'stream_5000_unit', 'stream_5000_system', 'stream_ac5000', 'stream_micro', 'stream_socket', 'stream_solar'];
export const safeOwnedDriver = (value: unknown): string | null => (typeof value === 'string' && drivers.includes(value) ? value : null);
export function dualCtContextFailureSnapshot(input: any) {
  try {
    if (!input || !['selection', 'inventory'].includes(input.stage)) return null;
    const reasons = ['owned_inventory_read_failed', 'inventory_incomplete', 'account_required', 'owned_source_required',
      'firmware_readback_unavailable', 'source_changed', 'source_closed', 'inventory_read_cancelled', 'read_failed', 'energy_role_review_required'];
    const stages = ['manifest', 'driver', 'devices', 'identity', 'energy', 'capabilities', 'settings', 'classification'];
    return {
      stage: input.stage as string,
      reason: reasons.includes(input.reason) ? input.reason as string : 'read_failed',
      inventoryStage: stages.includes(input.inventoryStage) ? input.inventoryStage as string : null,
      driver: safeOwnedDriver(input.driver),
    };
  } catch {
    return null;
  }
}
function linkedRelaySnapshot(input: any) {
  if (!input || typeof input !== 'object') return null;
  const m = input.monitor;
  const count = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 65535 ? v : null);
  return {
    transport: appMqttDiagnosticsSnapshot(input.transport),
    monitor: m ? {
      eligiblePropertyCallbacks: count(m.eligiblePropertyCallbacks),
      gridFrames: count(m.gridFrames),
      rejectedMeterFrames: count(m.rejectedMeterFrames),
      labelledFrames: count(m.labelledFrames),
      cache: ['empty', 'net_only', 'same_meter', 'other_meter'].includes(m.cache) ? m.cache as string : null,
      cacheAgeSec: typeof m.cacheAgeSec === 'number' && Number.isFinite(m.cacheAgeSec) && m.cacheAgeSec >= 0 ? m.cacheAgeSec : null,
    } : null,
  };
}

export function dualCtEnergyRecoverySnapshot(input: any) {
  try {
    if (!input || !['single_phase', 'three_phase_community'].includes(input.mode)) return null;
    const stages = ['idle', 'source', 'contract', 'binding', 'admission', 'subscription', 'ready'];
    const admission = ['not_started', 'inventory_unknown', 'grid_source_overlap', 'external_overlap_review_required', 'consent_required',
      'source_qualification_mismatch', 'contract_blocked', 'checkpoint_invalid', 'checkpoint_rollback', 'projection_failed', 'waiting_for_fresh_power'];
    return {
      mode: input.mode as string,
      ...(input.mode === 'single_phase' ? {
        ...(input.linkedRelay ? { linkedRelay: linkedRelaySnapshot(input.linkedRelay) } : {}),
        feed: singlePhaseFeedSnapshot(input.feed),
        linkedPowerStatus: LINKED_POWER_STATUSES.includes(input.linkedPowerStatus) ? input.linkedPowerStatus as string : null,
        transport: appMqttDiagnosticsSnapshot(input.transport),
        messageEvidence: messageEvidenceSnapshot(input.messageEvidence),
      } : {}),
      startupStage: stages.includes(input.startupStage) ? input.startupStage as string : 'idle',
      context: dualCtContextFailureSnapshot(input.context),
      admission: admission.includes(input.admission) ? input.admission as string : null,
      retryScheduled: input.retryScheduled === true,
      active: input.active === true,
      readOnly: true,
    };
  } catch {
    return null;
  }
}
