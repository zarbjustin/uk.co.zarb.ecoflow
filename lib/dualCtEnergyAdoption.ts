/** Explicit future adoption plan, not an applied Homey configuration or an existing-device migration. */
import { DUAL_CT_ENERGY_RUNTIME_ENABLED } from './dualCtGridEnergySource';

export interface DualCtEnergyContributor { id: string; grid: string; contributes: boolean }
export interface DualCtEnergyAdoptionRequest {
  explicitConsent: boolean;
  target: 'new_energy_device' | 'existing_preview';
  accounting: 'power' | 'counter';
  binding: string;
  grid: string;
  inventoryComplete: boolean;
  contributors: DualCtEnergyContributor[];
  externalOverlapReviewed: boolean;
  contractQualified: boolean;
}

/** Inventory is a fresh app-side readback; the external-meter acknowledgement is separate. Never disables others. */
export function planDualCtEnergyAdoption(request: DualCtEnergyAdoptionRequest) {
  let reason = 'prepared_not_activated';
  if (!request || request.explicitConsent !== true) reason = 'consent_required';
  else if (request.target !== 'new_energy_device') reason = 'existing_device_conversion_blocked';
  else if (request.accounting !== 'power') reason = 'counter_path_blocked';
  else if (request.contractQualified !== true) reason = 'contract_blocked';
  else if (!/^[a-f0-9]{64}$/.test(request.binding) || !/^[A-Za-z0-9_-]{1,128}$/.test(request.grid)) reason = 'invalid_source';
  else if (request.inventoryComplete !== true || !Array.isArray(request.contributors) || request.contributors.length > 256
    || request.contributors.some((row) => !row || typeof row.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(row.id)
      || typeof row.grid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(row.grid) || typeof row.contributes !== 'boolean')) reason = 'inventory_unknown';
  else if (request.contributors.some((row) => row.contributes && row.grid === request.grid)) reason = 'grid_source_overlap';
  else if (request.externalOverlapReviewed !== true) reason = 'external_overlap_review_required';
  return {
    status: reason,
    preparationAllowed: reason === 'prepared_not_activated',
    runtimeEnabled: DUAL_CT_ENERGY_RUNTIME_ENABLED,
    contributesToEnergy: false as const,
    existingDevicesChanged: false as const,
    migrationAllowed: false as const,
  };
}

/** Proposed SDK declaration only. Not imported by a driver or applied through setEnergy. */
export const DUAL_CT_ENERGY_PROPOSAL = Object.freeze({
  class: 'sensor',
  capabilities: Object.freeze(['measure_power', 'meter_power.imported', 'meter_power.exported']),
  energy: Object.freeze({ cumulative: true, cumulativeImportedCapability: 'meter_power.imported', cumulativeExportedCapability: 'meter_power.exported' }),
});

/** One app-process authority, shared by future sessions. Claims are rechecked against inventory on restart. */
export class DualCtEnergyAuthority {
  private readonly leases = new Map<string, { binding: string; owner: symbol }>();

  claim(grid: string, binding: string, owner: symbol): boolean {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(grid) || !/^[a-f0-9]{64}$/.test(binding) || typeof owner !== 'symbol') return false;
    const lease = this.leases.get(grid);
    if (lease) return lease.binding === binding && lease.owner === owner;
    if (this.leases.size >= 256) return false;
    this.leases.set(grid, { binding, owner }); return true;
  }

  owns(grid: string, binding: string, owner: symbol): boolean {
    const lease = this.leases.get(grid);
    return !!lease && lease.binding === binding && lease.owner === owner;
  }

  release(grid: string, owner: symbol): void {
    if (this.leases.get(grid)?.owner === owner) this.leases.delete(grid);
  }
}
