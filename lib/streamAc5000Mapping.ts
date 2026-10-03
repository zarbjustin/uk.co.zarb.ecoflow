'use strict';

import { Es22Telemetry } from './streamAc5000Protocol';

/**
 * EXPERIMENTAL — map STREAM AC 5000 telemetry onto Homey capability values.
 *
 * Only fields the reference implementation verified against live ES22 hardware
 * are exposed. Missing fields in partial (delta) frames preserve readings;
 * explicit nulls invalidate signed unit readings when peer evidence makes
 * the former single-unit fallback ambiguous.
 */

/** Deadband (W) around zero before the pack counts as charging/discharging. */
export const CHARGE_STATE_DEADBAND_W = 5;
/** Sanity envelopes, NOT product ratings or permitted control setpoints. */
export const SYSTEM_POWER_SANITY_MAX_W = 100000;
export const UNIT_POWER_SANITY_MAX_W = 10000;

export type Es22CapabilityValues = Record<string, number | string | null>;

export interface Es22MappingContext {
  scope?: 'system' | 'unit';
  serialNumber?: string;
  allowSystemSocFallback?: boolean;
  allowSystemPowerForUnit?: boolean;
}

export function chargingState(battW: number): 'charging' | 'discharging' | 'idle' {
  if (battW > CHARGE_STATE_DEADBAND_W) return 'charging';
  if (battW < -CHARGE_STATE_DEADBAND_W) return 'discharging';
  return 'idle';
}

export function mapStreamAc5000(t: Es22Telemetry, context: Es22MappingContext = {}): Es22CapabilityValues {
  const out: Es22CapabilityValues = {};
  const set = (cap: string, value: number | string | undefined) => {
    if (value !== undefined && (typeof value === 'string' || Number.isFinite(value))) out[cap] = value;
  };
  const setInRange = (cap: string, value: number | undefined, min: number, max: number) => {
    if (value !== undefined && Number.isFinite(value) && value >= min && value <= max) out[cap] = value;
  };

  const serial = context.serialNumber?.toUpperCase();
  const unitScope = context.scope === 'unit';
  const unit = serial ? t.unitsBySn?.[serial] : undefined;
  const localSource = !serial || !t.sourceSn || t.sourceSn === serial;
  const hasPeers = (t.unitRecordCount ?? 0) > 1
    || Boolean(serial && Object.keys(t.unitsBySn || {}).some((sn) => sn !== serial));
  const singleUnitSoc = !hasPeers && t.unitRecordCount === 1
    && (!serial || t.singleUnitSn === serial) ? t.singleUnitSocPct : undefined;
  // f33 and the repeated blocks belong to individual units. A unit-only delta
  // must not overwrite a previously received f11 installation percentage.
  const soc = unitScope
    ? (localSource ? t.socPrecisePct : undefined) ?? unit?.socPrecisePct ?? unit?.socPct ?? singleUnitSoc
    : t.socPct ?? (context.allowSystemSocFallback !== false ? singleUnitSoc : undefined);
  if (soc !== undefined && Number.isFinite(soc) && soc >= 0 && soc <= 100) {
    set('measure_battery', Math.round(soc));
  }
  setInRange('battery_soh', localSource ? t.bmsSohPct : undefined, 0, 100);
  // The LFP pack should remain far inside this envelope. Rejecting impossible
  // values prevents a protocol-layout change overwriting a good Homey reading.
  setInRange('measure_temperature', localSource ? t.battTempC : undefined, -50, 120);

  // Signed battery power, positive = charging — the same convention the
  // BK-series STREAM devices use for `measure_power`.
  const canUseSingleUnitFlow = context.allowSystemPowerForUnit && !hasPeers && localSource;
  const batteryPower = unitScope && !canUseSingleUnitFlow ? undefined : t.battW;
  // f54's per-unit power is positive even in captured discharge states. Do not
  // invent direction from that magnitude or from another unit's/system state.
  // Clear any old aggregate-as-unit reading once linkage makes it ambiguous.
  if (unitScope && (hasPeers || context.allowSystemPowerForUnit === false)) {
    out.measure_power = null;
    out.battery_charging_state = null;
  }
  const powerMax = unitScope ? UNIT_POWER_SANITY_MAX_W : SYSTEM_POWER_SANITY_MAX_W;
  if (batteryPower !== undefined && Number.isFinite(batteryPower) && Math.abs(batteryPower) <= powerMax) {
    set('measure_power', batteryPower);
    set('battery_charging_state', chargingState(batteryPower));
  }

  set('measure_power.load', t.homeW);
  set('measure_power.grid', t.gridW);
  setInRange('measure_power.grid_import', t.gridImportPowerW, 0, Number.MAX_SAFE_INTEGER);
  setInRange('measure_power.grid_export', t.gridExportPowerW, 0, Number.MAX_SAFE_INTEGER);

  return out;
}

/** Per-device scope history; no unit delta can re-enable a disproven singleton fallback. */
export function createStreamAc5000Mapper(serialNumber: string, scope: 'system' | 'unit'):
(telemetry: Es22Telemetry) => Es22CapabilityValues {
  const serial = serialNumber.toUpperCase();
  let systemSocSeen = false;
  let peersSeen = false;
  return (telemetry) => {
    if (telemetry.socPct !== undefined && Number.isFinite(telemetry.socPct)
      && telemetry.socPct >= 0 && telemetry.socPct <= 100) systemSocSeen = true;
    if ((telemetry.unitRecordCount ?? 0) > 1
      || Object.keys(telemetry.unitsBySn || {}).some((sn) => sn !== serial)) peersSeen = true;
    return mapStreamAc5000(telemetry, {
      scope,
      serialNumber: serial,
      allowSystemSocFallback: !systemSocSeen && !peersSeen,
      // Legacy single-unit captures lack f54 power. Retain that beta behaviour
      // only until peer evidence appears; never copy aggregate power to a linked unit.
      allowSystemPowerForUnit: !peersSeen,
    });
  };
}
