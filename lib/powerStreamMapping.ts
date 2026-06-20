'use strict';

import { Quota } from './types';

/** Read a numeric field, checking both the 20_1-prefixed and bare key. */
function num(q: Quota, key: string): number | undefined {
  const candidates = [`20_1.${key}`, key];
  for (const k of candidates) {
    const v = q[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  }
  return undefined;
}

/** True if a quota payload looks like a PowerStream micro-inverter. */
export function looksLikePowerStream(q: Quota): boolean {
  return num(q, 'invOutputWatts') !== undefined || num(q, 'permanentWatts') !== undefined || num(q, 'batSoc') !== undefined;
}

/** Map a PowerStream quota object (0.1 W / 0.1 °C units) to Homey capabilities. */
export function mapPowerStreamQuota(q: Quota): Record<string, number | string> {
  const out: Record<string, number | string> = {};
  const set = (cap: string, v: number | string | undefined) => {
    if (v !== undefined) out[cap] = v;
  };
  const w = (v?: number) => (v === undefined ? undefined : v / 10);

  set('measure_battery', num(q, 'batSoc'));
  set('measure_power', w(num(q, 'invOutputWatts')));
  const pv1 = num(q, 'pv1InputWatts');
  const pv2 = num(q, 'pv2InputWatts');
  if (pv1 !== undefined || pv2 !== undefined) set('measure_power.pv', ((pv1 || 0) + (pv2 || 0)) / 10);
  set('measure_power.battery', w(num(q, 'batInputWatts')));

  const temp = num(q, 'batTemp');
  if (temp !== undefined) set('measure_temperature', temp / 10);

  const out2 = num(q, 'permanentWatts');
  if (out2 !== undefined) set('output_target_power', out2 / 10);
  const sp = num(q, 'supplyPriority');
  if (sp !== undefined) set('supply_priority', sp === 1 ? 'power_storage' : 'power_supply');
  set('led_brightness', num(q, 'invBrightness'));
  set('ps_charge_limit', num(q, 'upperLimit'));
  set('ps_discharge_limit', num(q, 'lowerLimit'));

  return out;
}
