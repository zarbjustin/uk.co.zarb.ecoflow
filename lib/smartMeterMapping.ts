'use strict';

import { Quota } from './types';

function num(q: Quota, key: string): number | undefined {
  const v = q[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

/** True if a quota payload looks like an EcoFlow Smart Meter. */
export function looksLikeSmartMeter(q: Quota): boolean {
  return (
    q['gridConnectionPowerL1'] !== undefined
    || q['gridConnectionVolL1'] !== undefined
    || q['gridConnectionDataRecord.totalActiveEnergy'] !== undefined
  );
}

/** Map an EcoFlow Smart Meter quota object to Homey capability values. */
export function mapSmartMeterQuota(q: Quota): Record<string, number> {
  const out: Record<string, number> = {};
  const set = (cap: string, v: number | undefined) => {
    if (v !== undefined) out[cap] = v;
  };

  set('measure_power', num(q, 'powGetSysGrid'));
  set('measure_power.l1', num(q, 'gridConnectionPowerL1'));
  set('measure_power.l2', num(q, 'gridConnectionPowerL2'));
  set('measure_power.l3', num(q, 'gridConnectionPowerL3'));

  set('measure_voltage.l1', num(q, 'gridConnectionVolL1'));
  set('measure_voltage.l2', num(q, 'gridConnectionVolL2'));
  set('measure_voltage.l3', num(q, 'gridConnectionVolL3'));

  set('measure_current.l1', num(q, 'gridConnectionAmpL1'));
  set('measure_current.l2', num(q, 'gridConnectionAmpL2'));
  set('measure_current.l3', num(q, 'gridConnectionAmpL3'));

  set('meter_power', num(q, 'gridConnectionDataRecord.totalActiveEnergy'));
  set('meter_power.today', num(q, 'gridConnectionDataRecord.todayActive'));
  set('power_factor', num(q, 'gridConnectionPowerFactor'));

  return out;
}
