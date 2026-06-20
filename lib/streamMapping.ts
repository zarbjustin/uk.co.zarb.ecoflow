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

/** Sum of available per-PV watts, preferring the firmware-specific keys. */
function pvSum(q: Quota): number | undefined {
  const direct = num(q, ['powGetPvSum']);
  if (direct !== undefined) return direct;
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
 */
export function mapStreamQuota(q: Quota): Record<string, number | boolean | string> {
  const out: Record<string, number | boolean | string> = {};
  const set = (cap: string, v: number | boolean | string | undefined) => {
    if (v !== undefined) out[cap] = v;
  };

  // Battery / energy
  set('measure_battery', num(q, ['f32ShowSoc', 'soc', 'cmsBattSoc', 'bmsBattSoc']));
  set('battery_soh', num(q, ['soh', 'realSoh', 'cmsBattSoh', 'bmsBattSoh']));
  set('charge_limit', num(q, ['cmsMaxChgSoc']));
  set('discharge_limit', num(q, ['cmsMinDsgSoc']));

  // Power flows (Watts)
  set('measure_power', num(q, ['powGetBpCms'])); // battery power: + charging / - discharging
  set('measure_power.pv', pvSum(q));
  set('measure_power.grid', num(q, ['gridConnectionPower', 'powGetSysGrid', 'sysGridConnectionPower']));
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

  return out;
}
