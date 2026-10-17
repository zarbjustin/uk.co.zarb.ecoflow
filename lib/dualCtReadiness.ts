import { verifiedDualCtContract } from './dualCtChannels';

/** Developer-owned gates, never set from customer annotations, telemetry or request bodies. */
export function dualCtReleaseReadiness() {
  const contract = verifiedDualCtContract({ productType: 421 });
  return {
    status: 'research_only',
    contractRegistered: contract !== null,
    devicePreview: {
      status: 'blocked',
      missingEvidence: ['model_firmware_contract', 'bank_roles', 'units_scaling', 'direction_phase_order', 'physical_reading_comparison'],
    },
    energyAdoption: {
      status: 'blocked',
      missingEvidence: ['model_firmware_contract', 'grid_role', 'authoritative_source', 'upgrade_rollback', 'physical_energy_comparison'],
      powerPath: {
        status: 'blocked',
        nativeCountersRequired: false,
        totalsBasis: 'derived_from_power',
        missingEvidence: ['model_firmware_contract', 'grid_role', 'power_units_direction', 'measurement_freshness', 'authoritative_source', 'upgrade_rollback', 'physical_energy_comparison'],
      },
      counterPath: {
        status: 'blocked',
        missingEvidence: ['model_firmware_contract', 'grid_role', 'counter_units_period', 'counter_reset_restart', 'authoritative_source', 'upgrade_rollback', 'physical_energy_comparison'],
      },
    },
    pairingEnabled: false,
    experimentalPreview: {
      driverId: 'smartmeter_dual_ct_preview',
      optInRequired: true,
      rawCandidatesOnly: true,
      verifiedMeterPairingEnabled: false,
      contributesToEnergy: false,
      controlsEnabled: false,
    },
    contributesToEnergy: false,
    controlsEnabled: false,
  };
}
