'use strict';

import { freshReserveSnapshot } from './houseReserveControl';
import { isEcoflowManagedPower } from './coordinatedPowerMode';

/** Private, explicitly enrolled installation view. Never summed unit power or Energy. */
export function houseInstallationSnapshot(gate: any, units: any[], now = Date.now()): any {
  const managed = isEcoflowManagedPower(gate?.powerBudget);
  const ids = gate?.houseMemberDeviceIds;
  if (!['house-only', 'coordinated-installations'].includes(gate?.controlScope) || !Array.isArray(ids) || ids.length < 2 || ids.length > 16
    || (gate.controlScope === 'coordinated-installations' && ids.length !== 2)
    || ids.some((id: any) => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length
    || !ids.includes(gate.deviceId)) throw new Error('Explicit house installation membership required');
  if (!gate.houseMemberSerials || Object.keys(gate.houseMemberSerials).length !== ids.length) throw new Error('House physical identity binding required');
  const members = ids.map((id: string) => {
    const matches = units.filter((d) => d.getId() === id);
    if (matches.length !== 1
      || matches[0].getData()?.sn !== gate.houseMemberSerials[id]
      || !matches[0].getAvailable()
      || !/^ES21[A-Z0-9]{4,60}$/.test(matches[0].getData()?.sn)) throw new Error('House installation member unavailable/changed');
    return matches[0];
  });
  const main = members.find((d: any) => d.getId() === gate.deviceId);
  if (main.getData().sn !== gate.serial) throw new Error('House installation reporter changed');
  const serials = members.map((d: any) => d.getData().sn);
  if (new Set(serials).size !== serials.length) throw new Error('Duplicate house physical identity');
  const topology = main.getTopologyEvidence();
  if (!topology || topology.addressSn !== gate.serial || topology.truncated || topology.maxReportedRecordCount !== members.length) throw new Error('House installation topology unverified');
  const seen = new Set([topology.addressSn, ...topology.peers.filter((p: any) => Number.isFinite(p.seenAt) && p.seenAt <= now && now - p.seenAt <= 90000).map((p: any) => p.sn)]);
  if (seen.size !== serials.length || !serials.every((sn: string) => seen.has(sn))) throw new Error('House installation membership changed/stale');
  if (!managed && gate.houseSpaceGridLimitW !== undefined) {
    if (!Number.isFinite(gate.houseSpaceGridLimitW) || gate.houseSpaceGridLimitW <= 0
      || !Number.isFinite(gate.houseSiteChargeKw) || gate.houseSiteChargeKw <= 0 || gate.houseSiteChargeKw * 1000 > gate.houseSpaceGridLimitW) throw new Error('House Space grid allowance invalid');
    for (const d of members) {
      const f = d.getConfigurationDiagnostics()?.values?.maxGridInputW;
      if (f?.stale !== false || !Number.isFinite(f.ageSec) || f.ageSec < 0 || f.ageSec > 1200 || f.value !== gate.houseSpaceGridLimitW) throw new Error('House Space native grid limit changed/stale');
    }
  }
  const reserve = freshReserveSnapshot(main.getConfigurationDiagnostics());
  if (!reserve.enabled || members.some((d: any) => {
    const r = freshReserveSnapshot(d.getConfigurationDiagnostics());
    return r.enabled !== reserve.enabled || r.percent !== reserve.percent;
  })) throw new Error('House member reserve disagreement');
  const memberSoc = members.map((d: any) => {
    const f = d.getReadingDiagnostics()?.measure_battery;
    const soc = d.getCapabilityValue('measure_battery');
    if (f?.stale !== false || f.applicationStatus !== 'applied' || !Number.isFinite(f.ageSec) || f.ageSec < 0 || f.ageSec > 300
      || !Number.isFinite(soc) || soc < 0 || soc > 100) throw new Error('House member SOC unavailable');
    return soc;
  });
  const reporter = main.getSystemReporterDiagnostics(); const
    flow = main.getSystemFlowDiagnostics()?.fields;
  const valid = (f: any, min: number, max: number): boolean => f?.stale === false && Number.isFinite(f.ageSec) && f.ageSec >= 0 && f.ageSec <= 30
    && Number.isFinite(f.value) && f.value >= min && f.value <= max;
  // Aggregate SOC is delta-reported and can age while every enrolled physical
  // member continues to answer reads. Their minimum SOC is an explicit lower
  // bound for private planning, never an averaged aggregate or Energy reading.
  const freshMembers = members.every((d: any) => d.getReadingDiagnostics().measure_battery.ageSec <= 10);
  const systemSocValid = valid(reporter.socPct, 0, 100);
  const memberLowerBound = !systemSocValid && freshMembers;
  if ((!systemSocValid && !memberLowerBound) || !valid(reporter.batteryW, -100000, 100000)

      || !valid(flow?.gridToBatteryW, 0, 100000)
      || !valid(flow?.batteryDerivedW, -100000, 100000)
      || Math.abs(flow.batteryDerivedW.value - reporter.batteryW.value) > 0.1) throw new Error('House installation SOC/power receipt unavailable');
  if (!managed && gate.houseSpaceGridLimitW !== undefined && !valid(flow?.gridFlowNetW, -100000, 100000)) throw new Error('House Space grid-import receipt unavailable');
  return {
    telemetryScope: 'house-installation-v1',
    ...(managed ? { powerManagementMode: 'ecoflow-managed' } : {}),
    deviceId: gate.deviceId,
    memberDeviceIds: ids.slice(),
    capturedAt: new Date(now).toISOString(),
    socPercent: memberLowerBound ? Math.min(...memberSoc) : reporter.socPct.value,
    socSource: memberLowerBound ? 'minimum-enrolled-member-soc-lower-bound' : 'app_protocol_system_soc',
    systemSocAgeSec: Number.isFinite(reporter.socPct?.ageSec) ? reporter.socPct.ageSec : null,
    noChargeReserveCeilingPercent: Math.floor(Math.min(...memberSoc)),
    noDischargeReserveFloorPercent: Math.ceil(Math.max(...memberSoc)),
    memberSocAgeSec: Math.max(...members.map((d: any) => d.getReadingDiagnostics().measure_battery.ageSec)),
    gridChargingEnabled: gate.houseGridChargingEnabled !== false,
    batteryW: reporter.batteryW.value,
    socAgeSec: memberLowerBound ? Math.max(...members.map((d: any) => d.getReadingDiagnostics().measure_battery.ageSec)) : reporter.socPct.ageSec,
    powerAgeSec: reporter.batteryW.ageSec,
    gridImportW: !managed && valid(flow?.gridFlowNetW, -100000, 100000) ? Math.max(0, flow.gridFlowNetW.value) : null,
    gridImportAgeSec: !managed && valid(flow?.gridFlowNetW, -100000, 100000) ? flow.gridFlowNetW.ageSec : null,
    gridChargeW: flow.gridToBatteryW.value,
    gridChargeAgeSec: flow.gridToBatteryW.ageSec,
    available: true,
    fault: false,
    reserveEnabled: reserve.enabled,
    reservePercent: reserve.percent,
    mode: 'self_powered',
    nativeTasksEmpty: true,
  };
}
