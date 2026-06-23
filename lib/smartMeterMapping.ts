'use strict';

import { Quota } from './types';
import { integrateSignedPower } from './energyIntegration';

function num(q: Quota, key: string): number | undefined {
  const v = q[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

/**
 * True if a quota payload looks like a standalone EcoFlow Smart Meter (it
 * exposes its own per-phase grid telemetry). Note: when the meter is part of a
 * STREAM system its own SN returns an empty quota and the whole-home reading
 * lives on the STREAM main SN as `powGetSysGrid` — discovery handles that case
 * via the device classifier, not this probe.
 */
export function looksLikeSmartMeter(q: Quota): boolean {
  return (
    q['gridConnectionPowerL1'] !== undefined
    || q['gridConnectionVolL1'] !== undefined
    || q['gridConnectionDataRecord.totalActiveEnergy'] !== undefined
  );
}

/**
 * Map an EcoFlow Smart Meter (or STREAM main) quota to instantaneous Homey
 * capability values. `measure_power` is the whole-home grid power
 * (positive = importing from grid, negative = exporting). Cumulative energy is
 * derived by the device from this power, so no energy counters are mapped here.
 * Per-phase values are only present for standalone meters.
 */
export function mapSmartMeterQuota(q: Quota): Record<string, number> {
  const out: Record<string, number> = {};
  const set = (cap: string, v: number | undefined) => {
    if (v !== undefined) out[cap] = v;
  };

  // Whole-home grid power. `powGetSysGrid` is reported on the STREAM main SN;
  // `gridConnectionPower` is the fallback for a standalone meter.
  set('measure_power', num(q, 'powGetSysGrid') ?? num(q, 'gridConnectionPower'));

  set('measure_power.l1', num(q, 'gridConnectionPowerL1'));
  set('measure_power.l2', num(q, 'gridConnectionPowerL2'));
  set('measure_power.l3', num(q, 'gridConnectionPowerL3'));

  set('measure_voltage.l1', num(q, 'gridConnectionVolL1'));
  set('measure_voltage.l2', num(q, 'gridConnectionVolL2'));
  set('measure_voltage.l3', num(q, 'gridConnectionVolL3'));

  set('measure_current.l1', num(q, 'gridConnectionAmpL1'));
  set('measure_current.l2', num(q, 'gridConnectionAmpL2'));
  set('measure_current.l3', num(q, 'gridConnectionAmpL3'));

  set('power_factor', num(q, 'gridConnectionPowerFactor'));

  return out;
}

/** Split a signed grid power (W) into always-positive import and export. */
export function splitGridPower(powerW: number | undefined): { importW: number; exportW: number } | undefined {
  if (typeof powerW !== 'number' || !Number.isFinite(powerW)) return undefined;
  return { importW: Math.max(0, powerW), exportW: Math.max(0, -powerW) };
}

/**
 * Integrate instantaneous grid power into monotonic cumulative import/export
 * energy. Thin wrapper around the shared {@link integrateSignedPower} that keeps
 * the meter's import/export naming.
 *
 * @param powerW  signed grid power in Watts (+import / -export)
 * @param dtMs    elapsed time since the previous sample, in milliseconds
 */
export function accumulateEnergy(
  prev: { importWh: number; exportWh: number },
  powerW: number,
  dtMs: number,
): { importWh: number; exportWh: number } {
  const next = integrateSignedPower({ posWh: prev.importWh, negWh: prev.exportWh }, powerW, dtMs);
  return { importWh: next.posWh, exportWh: next.negWh };
}
