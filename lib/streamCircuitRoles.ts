/** Circuit descriptions are caller assertions, never telemetry/command/Energy authority. */
export const STREAM_CIRCUIT_ROLES = ['unknown', 'grid', 'hybrid_inverter', 'solar_inverter', 'load'] as const;
export type StreamCircuitRole = typeof STREAM_CIRCUIT_ROLES[number];

export function streamCircuitRole(value: unknown): StreamCircuitRole {
  return typeof value === 'string' && STREAM_CIRCUIT_ROLES.includes(value as StreamCircuitRole)
    ? value as StreamCircuitRole : 'unknown';
}

export function streamCircuitMeaning(value: unknown) {
  const role = streamCircuitRole(value);
  const meanings = {
    unknown: 'unknown',
    grid: 'whole_installation_grid_exchange',
    hybrid_inverter: 'combined_solar_and_battery_exchange',
    solar_inverter: 'solar_only_inverter_exchange',
    load: 'branch_consumption',
  };
  return {
    role,
    meaning: meanings[role],
    assertionOnly: true,
    // A declared solar-only circuit is eligible for investigation, not verified generation.
    solarOnlyDeclared: role === 'solar_inverter',
    suppliesSeparateBatteryState: false,
    measurementMappingVerified: false,
    contributesToEnergy: false,
    controlsEnabled: false,
  };
}
