'use strict';

import type { Stream5000CapabilityValues } from './stream5000Adapters';

/** Capabilities assigned when a 5000-series installation is paired as the shared Home Battery driver. */
export const STREAM_5000_HOME_BATTERY_CAPABILITIES = Object.freeze([
  'measure_battery',
  'battery_charging_state',
  'measure_power',
  'meter_power.charged',
  'meter_power.discharged',
  'measure_power.load',
  'measure_power.grid',
  'measure_power.grid_import',
  'measure_power.grid_export',
  'measure_temperature',
  'battery_soh',
] as const);

/**
 * Convert installation telemetry into the physical-unit capability namespace.
 * The standard measure_power capability is intentionally removed because Homey
 * treats it as an Energy contribution for battery-class devices.
 */
export function stream5000PhysicalCapabilityValues(
  values: Stream5000CapabilityValues,
): Stream5000CapabilityValues {
  const unitValues = { ...values };
  if (typeof unitValues.measure_power === 'number') {
    unitValues.stream_unit_power_battery_flow = unitValues.measure_power;
  }
  delete unitValues.measure_power;
  return unitValues;
}
