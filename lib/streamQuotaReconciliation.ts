'use strict';

// Fields which can produce the same capability or participate in a derived
// reading must be withheld together. Never combine old REST and new MQTT values.
const groups = [
  ['powGetBpCms', 'accuChgEnergy', 'accuDsgEnergy', 'cmsChgRemTime', 'cmsDsgRemTime'],
  ['cmsBattSoc'],
  ['f32ShowSoc', 'soc', 'actSoc'],
  ['soh', 'realSoh', 'cmsBattSoh', 'bmsBattSoh'],
  ['temp', 'maxCellTemp'],
  ['bmsHeatingStatus', 'heatingStatus', 'selfHeating', 'heatStatus', 'sysHeatStatus'],
  // A partial PV update can affect both a string and the fallback total.
  ['powGetPvSum', ...[1, 2, 3, 4].flatMap((i) => [
    i === 1 ? 'powGetPv' : `powGetPv${i}`,
    i === 1 ? 'plugInInfoPvAmp' : `plugInInfoPv${i}Amp`,
    i === 1 ? 'plugInInfoPvVol' : `plugInInfoPv${i}Vol`,
  ])],
];

function group(key: string): string {
  if (key.startsWith('energyStrategyOperateMode.')) return 'mode';
  const index = groups.findIndex((fields) => fields.includes(key));
  return index < 0 ? `field:${key}` : `group:${index}`;
}

/** Preserve non-conflicting REST fields, without replaying or re-ageing MQTT. */
export function reconcileStreamQuota(quota: Record<string, any>, newerFields: ReadonlySet<string>): Record<string, any> {
  const blocked = new Set([...newerFields].map(group));
  return Object.fromEntries(Object.entries(quota).filter(([key]) => !blocked.has(group(key))));
}
