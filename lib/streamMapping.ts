'use strict';

import { Quota } from './types';

function num(q: Quota, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = q[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  }
  return undefined;
}

function bool(q: Quota, key: string): boolean | undefined {
  const v = q[key];
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  return undefined;
}

/** Per-PV watts for input i (1-4), handling both firmware variants. */
function perPv(q: Quota, i: number): number | undefined {
  const legacy = num(q, [i === 1 ? 'powGetPv' : `powGetPv${i}`]);
  if (legacy !== undefined && legacy !== 0) return legacy;
  const amp = num(q, [i === 1 ? 'plugInInfoPvAmp' : `plugInInfoPv${i}Amp`]);
  const vol = num(q, [i === 1 ? 'plugInInfoPvVol' : `plugInInfoPv${i}Vol`]);
  if (amp !== undefined && vol !== undefined) return amp * vol;
  return legacy;
}

/** Sum of the unit's own per-PV strings (excludes the system-level sum). */
function perPvSum(q: Quota): number | undefined {
  let total = 0;
  let any = false;
  for (let i = 1; i <= 4; i += 1) {
    const v = perPv(q, i);
    if (v !== undefined) {
      total += v;
      any = true;
    }
  }
  return any ? total : undefined;
}

/** Sum of available PV watts, preferring the firmware's system total. */
function pvSum(q: Quota): number | undefined {
  const direct = num(q, ['powGetPvSum']);
  if (direct !== undefined) return direct;
  return perPvSum(q);
}

/** Total solar generation in Watts (for the dedicated solar device). */
export function solarPowerWatts(q: Quota): number | undefined {
  return pvSum(q);
}

/** Per-PV string power in Watts, for input i (1-4). */
export function perPvWatts(q: Quota, i: number): number | undefined {
  return perPv(q, i);
}

function operatingMode(q: Quota): string | undefined {
  const modes: Array<[string, string]> = [
    ['energyStrategyOperateMode.operateSelfPoweredOpen', 'self_powered'],
    ['energyStrategyOperateMode.operateIntelligentScheduleModeOpen', 'ai'],
    ['energyStrategyOperateMode.operateScheduledOpen', 'scheduled'],
    ['energyStrategyOperateMode.operateTouModeOpen', 'tou'],
  ];
  for (const [key, id] of modes) if (bool(q, key) === true) return id;
  return undefined;
}

/**
 * Map an EcoFlow STREAM quota object to Homey capability values.
 * Only keys that are present are returned, so partial payloads are safe.
 *
 * @param scope 'system' (default) reports the whole-home grid power
 *   (`powGetSysGrid`, only populated on the main SN); 'unit' reports the single
 *   inverter's own grid feed (`gridConnectionPower`).
 */
export function mapStreamQuota(q: Quota, scope: 'system' | 'unit' = 'system'): Record<string, number | boolean | string> {
  const out: Record<string, number | boolean | string> = {};
  const set = (cap: string, v: number | boolean | string | undefined) => {
    if (v !== undefined) out[cap] = v;
  };

  // Battery / energy
  set('measure_battery', scope === 'unit'
    ? num(q, ['f32ShowSoc', 'soc', 'actSoc']) // per-unit SoC (MQTT BMS); cmsBattSoc reads 0 on members
    : num(q, ['f32ShowSoc', 'soc', 'cmsBattSoc', 'bmsBattSoc']));
  set('battery_soh', num(q, ['soh', 'realSoh', 'cmsBattSoh', 'bmsBattSoh']));
  set('charge_limit', num(q, ['cmsMaxChgSoc']));
  set('discharge_limit', num(q, ['cmsMinDsgSoc']));

  // Power flows (Watts)
  const batteryPower = num(q, ['powGetBpCms']); // + charging / - discharging
  set('measure_power', batteryPower);
  if (batteryPower !== undefined) {
    // eslint-disable-next-line no-nested-ternary
    set('battery_charging_state', batteryPower > 5 ? 'charging' : (batteryPower < -5 ? 'discharging' : 'idle'));
  }
  // Solar: a unit shows its OWN strings; the system shows the firmware total.
  set('measure_power.pv', scope === 'unit' ? perPvSum(q) : pvSum(q));
  set('measure_power.grid', scope === 'unit'
    ? num(q, ['gridConnectionPower', 'powGetSysGrid', 'sysGridConnectionPower'])
    : num(q, ['powGetSysGrid', 'sysGridConnectionPower', 'gridConnectionPower']));
  set('measure_power.load', num(q, ['powGetSysLoad']));

  // Cumulative energy (Wh -> kWh)
  const chg = num(q, ['accuChgEnergy']);
  const dsg = num(q, ['accuDsgEnergy']);
  if (chg !== undefined) set('meter_power.charged', chg / 1000);
  if (dsg !== undefined) set('meter_power.discharged', dsg / 1000);

  // Environment
  set('measure_temperature', num(q, ['temp', 'maxCellTemp']));
  const vol = num(q, ['vol']); // mV
  if (vol !== undefined) set('measure_voltage', vol / 1000);

  // Controls (reported state)
  set('onoff.ac1', bool(q, 'relay2Onoff'));
  set('onoff.ac2', bool(q, 'relay3Onoff'));
  set('backup_reserve_soc', num(q, ['backupReverseSoc']));
  const feed = num(q, ['feedGridMode']);
  if (feed !== undefined) set('feed_in_control', feed === 2);
  set('operating_mode', operatingMode(q));

  // Extended telemetry (Sprint 9)
  for (let i = 1; i <= 4; i += 1) set(`measure_power.pv${i}`, perPv(q, i));
  set('measure_power.schuko1', num(q, ['powGetSchuko1']));
  set('measure_power.schuko2', num(q, ['powGetSchuko2']));
  set('measure_power.from_pv', num(q, ['powGetSysLoadFromPv']));
  set('measure_power.from_battery', num(q, ['powGetSysLoadFromBp']));
  set('measure_power.from_grid', num(q, ['powGetSysLoadFromGrid']));
  set('charge_remaining', num(q, ['bmsChgRemTime', 'cmsChgRemTime', 'chgRemainTime']));
  set('discharge_remaining', num(q, ['bmsDsgRemTime', 'cmsDsgRemTime', 'dsgRemainTime']));
  set('battery_cycles', num(q, ['cycles']));

  // Battery self-heating status (cold-weather). Field name is unconfirmed across
  // firmwares, so several candidates are tried and the capability is only added
  // (by the device) when one is actually present — no blank tile otherwise.
  set('self_heating', bool(q, 'bmsHeatingStatus')
    ?? bool(q, 'heatingStatus')
    ?? bool(q, 'selfHeating')
    ?? bool(q, 'heatStatus')
    ?? bool(q, 'sysHeatStatus'));

  return out;
}
