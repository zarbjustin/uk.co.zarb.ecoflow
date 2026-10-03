'use strict';

import type { Stream5000CapabilityValues } from './stream5000Adapters';

/**
 * Convert already unit-scoped telemetry into the physical capability namespace.
 * The standard measure_power capability is intentionally removed because Homey
 * treats it as an Energy contribution for battery-class devices.
 */
export function stream5000PhysicalCapabilityValues(
  values: Stream5000CapabilityValues,
): Stream5000CapabilityValues {
  const unitValues = { ...values };
  if (Object.prototype.hasOwnProperty.call(unitValues, 'measure_power')) {
    unitValues.stream_unit_power_battery_flow = unitValues.measure_power;
  }
  delete unitValues.measure_power;
  return unitValues;
}
