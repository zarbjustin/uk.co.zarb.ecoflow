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
export function dualCtEnergyRecoverySnapshot(input: any) {
  try {
    if (!input || !['single_phase', 'three_phase_community'].includes(input.mode)) return null;
    const stages = ['idle', 'source', 'contract', 'binding', 'admission', 'subscription', 'ready'];
    const admission = ['not_started', 'inventory_unknown', 'grid_source_overlap', 'external_overlap_review_required', 'consent_required',
      'source_qualification_mismatch', 'contract_blocked', 'checkpoint_invalid', 'checkpoint_rollback', 'projection_failed', 'waiting_for_fresh_power'];
    return {
      mode: input.mode as string,
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
