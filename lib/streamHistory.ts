'use strict';

import { EcoFlowClient } from './EcoFlowClient';

/**
 * STREAM "home" history metric codes. The model prefix (e.g. "BK621") varies by
 * product, so it is templated as PFX and substituted at call time.
 */
const CODES: Record<string, string> = {
  solar: 'PFX-App-HOME-SOLAR-ENERGY-FLOW-solor-line-NOTDISTINGUISH-MASTER_DATA',
  consumption: 'PFX-App-HOME-LOAD-ENERGY-FLOW-consumption-prop_arc-NOTDISTINGUISH-MASTER_DATA',
  grid: 'PFX-App-HOME-GRID-ENERGY-FLOW-grid_prop_bar-NOTDISTINGUISH-MASTER_DATA',
  battery: 'PFX-App-HOME-SOC-ENERGY-FLOW-battery-prop_bar-NOTDISTINGUISH-MASTER_DATA',
  savings: 'PFX-App-HOME-SAVING-CURRENCY-FLOW-earnings-progress_arc-NOTDISTINGUISH-MASTER_DATA',
  co2: 'PFX-App-HOME-CO2-WEIGHT-FLOW-impact-progress_arc-NOTDISTINGUISH-MASTER_DATA',
  independence: 'PFX-App-HOME-INDEPENDENCE-PERCENT-FLOW-indep-progress_bar-NOTDISTINGUISH-MASTER_DATA',
};

export interface DailyEnergy {
  solarWh?: number;
  consumptionWh?: number;
  gridImportWh?: number;
  gridExportWh?: number;
  batteryChargeWh?: number;
  batteryDischargeWh?: number;
  savings?: number;
  co2g?: number;
  independencePct?: number;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Today's Homey-local range in the API's 'yyyy-MM-dd HH:mm:ss' format. */
export function todayRange(now = new Date(), timeZone = 'UTC'): { beginTime: string; endTime: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
  const d = `${value('year')}-${pad(Number(value('month')))}-${pad(Number(value('day')))}`;
  return { beginTime: `${d} 00:00:00`, endTime: `${d} 23:59:59` };
}

/** Fetch today's aggregate energy metrics. Each metric is best-effort. */
export async function fetchDailyEnergy(
  client: EcoFlowClient,
  sn: string,
  prefix = 'BK621',
  timeZone = 'UTC',
): Promise<DailyEnergy> {
  const { beginTime, endTime } = todayRange(new Date(), timeZone);
  const code = (k: string) => CODES[k].replace('PFX', prefix);
  const get = async (k: string) => {
    try {
      return await client.getHistory(sn, code(k), beginTime, endTime);
    } catch {
      return [];
    }
  };
  const [solar, cons, grid, batt, sav, co2, indep] = await Promise.all([
    get('solar'),
    get('consumption'),
    get('grid'),
    get('battery'),
    get('savings'),
    get('co2'),
    get('independence'),
  ]);

  const pick = (arr: any[], extra?: string): number | undefined => {
    if (!Array.isArray(arr) || arr.length === 0) return undefined;
    const row = extra !== undefined ? arr.find((r) => String(r.extra) === extra) : arr[0];
    if (!row || row.indexValue === undefined) return undefined;
    const n = Number(row.indexValue);
    return Number.isFinite(n) ? n : undefined;
  };

  return {
    solarWh: pick(solar),
    consumptionWh: pick(cons),
    gridImportWh: pick(grid, '1'),
    gridExportWh: pick(grid, '2'),
    batteryChargeWh: pick(batt, '1'),
    batteryDischargeWh: pick(batt, '2'),
    savings: pick(sav),
    co2g: pick(co2),
    independencePct: pick(indep),
  };
}
