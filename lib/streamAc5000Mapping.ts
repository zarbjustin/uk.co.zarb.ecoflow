'use strict';

import { Es22Telemetry } from './streamAc5000Protocol';

/**
 * EXPERIMENTAL — map STREAM AC 5000 telemetry onto Homey capability values.
 *
 * Only fields the reference implementation verified against live ES22 hardware
 * are exposed. Keys are omitted when the frame did not carry them, so partial
 * (delta) frames never clear a good reading.
 */

/** Deadband (W) around zero before the pack counts as charging/discharging. */
export const CHARGE_STATE_DEADBAND_W = 5;

export type Es22CapabilityValues = Record<string, number | string>;

export function chargingState(battW: number): 'charging' | 'discharging' | 'idle' {
  if (battW > CHARGE_STATE_DEADBAND_W) return 'charging';
  if (battW < -CHARGE_STATE_DEADBAND_W) return 'discharging';
  return 'idle';
}

export function mapStreamAc5000(t: Es22Telemetry): Es22CapabilityValues {
  const out: Es22CapabilityValues = {};
  const set = (cap: string, value: number | string | undefined) => {
    if (value !== undefined && (typeof value === 'string' || Number.isFinite(value))) out[cap] = value;
  };
  const setInRange = (cap: string, value: number | undefined, min: number, max: number) => {
    if (value !== undefined && Number.isFinite(value) && value >= min && value <= max) out[cap] = value;
  };

  const soc = t.socPrecisePct ?? t.socPct;
  if (soc !== undefined && Number.isFinite(soc) && soc >= 0 && soc <= 100) {
    set('measure_battery', Math.round(soc));
  }
  setInRange('battery_soh', t.bmsSohPct, 0, 100);
  // The LFP pack should remain far inside this envelope. Rejecting impossible
  // values prevents a protocol-layout change overwriting a good Homey reading.
  setInRange('measure_temperature', t.battTempC, -50, 120);

  // Signed battery power, positive = charging — the same convention the
  // BK-series STREAM devices use for `measure_power`.
  if (t.battW !== undefined && Number.isFinite(t.battW) && Math.abs(t.battW) <= 10000) {
    set('measure_power', t.battW);
    set('battery_charging_state', chargingState(t.battW));
  }

  set('measure_power.load', t.homeW);
  set('measure_power.grid', t.gridW);
  setInRange('measure_power.grid_import', t.gridImportPowerW, 0, Number.MAX_SAFE_INTEGER);
  setInRange('measure_power.grid_export', t.gridExportPowerW, 0, Number.MAX_SAFE_INTEGER);

  return out;
}
