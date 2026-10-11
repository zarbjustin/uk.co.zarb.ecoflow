'use strict';

const reporterSource = (key: string) => (key === 'socPct'
  ? 'app_protocol_system_soc' : 'derived_app_protocol_flow_matrix');

export const REPORTER_FLOW_FIELDS = ['mpptToBatteryW', 'solarToBatteryW', 'gridToBatteryW',
  'batteryToHomeW', 'batteryToGridW', 'batteryToSocketW', 'gridToHomeW', 'gridToSocketW',
  'solarToGridW', 'homeW', 'gridMeterW', 'gridFlowNetW', 'batteryDerivedW'] as const;

/** Re-project a fixed diagnostic list; never propagate identifiers or raw frames. */
export function reporterFlowSnapshot(input: any): Record<string, unknown> {
  const fields = Object.fromEntries(REPORTER_FLOW_FIELDS.flatMap((key) => {
    const v = input?.fields?.[key];
    const signed = ['gridMeterW', 'gridFlowNetW', 'batteryDerivedW'].includes(key);
    if (typeof v?.value !== 'number' || !Number.isFinite(v.value) || Math.abs(v.value) > 100000
      || (!signed && v.value < 0) || typeof v.ageSec !== 'number' || !Number.isFinite(v.ageSec)
      || v.ageSec < 0) return [];
    return [[key, { value: v.value, ageSec: v.ageSec, stale: v.stale !== false || v.ageSec > 180 }]];
  })) as Record<string, any>;
  const meter = fields.gridMeterW;
  const flow = fields.gridFlowNetW;
  const skew = meter && flow ? Math.abs(meter.ageSec - flow.ageSec) : null;
  return {
    fields,
    gridReceiptSkewSec: skew,
    meterMinusFlowW: meter?.stale === false && flow?.stale === false && skew !== null && skew <= 30
      ? meter.value - flow.value : null,
    deviceTimestampsVerified: false,
    accountingUsed: false,
  };
}

/** Session-only system observations, independent of physical monitor capabilities. */
export class StreamReporterObservations {
  private values: Record<string, { value: number; receivedAt: number }> = {};
  private flowValues: Record<string, { value: number; receivedAt: number }> = {};

  observe(input: { socPct?: number; battW?: number; sourceSn?: string; batteryFlowEdges?: Record<string, number>;
    homeW?: number; gridW?: number; gridImportPowerW?: number; gridExportPowerW?: number }, address: string, at: number): void {
    if (!Number.isFinite(at) || at <= 0 || at > Date.now()) return;
    if (input.sourceSn && input.sourceSn.toUpperCase() !== address.toUpperCase()) return;
    const flowInput: Record<string, number | undefined> = {
      ...input.batteryFlowEdges,
      homeW: input.homeW,
      gridMeterW: input.gridW,
      batteryDerivedW: input.battW,
      gridFlowNetW: typeof input.gridImportPowerW === 'number' && typeof input.gridExportPowerW === 'number'
        ? input.gridImportPowerW - input.gridExportPowerW : undefined,
    };
    for (const key of REPORTER_FLOW_FIELDS) {
      const value = flowInput[key];
      if (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 100000
        && (['gridMeterW', 'gridFlowNetW', 'batteryDerivedW'].includes(key) || value >= 0)
        && at >= (this.flowValues[key]?.receivedAt ?? 0)) this.flowValues[key] = { value, receivedAt: at };
    }
    for (const [key, value, min, max] of [
      ['socPct', input.socPct, 0, 100], ['batteryW', input.battW, -100000, 100000],
    ] as const) {
      if (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
        && at >= (this.values[key]?.receivedAt ?? 0)) {
        this.values[key] = { value, receivedAt: at };
      }
    }
  }

  snapshot(now: number): Record<string, unknown> {
    return Object.fromEntries(Object.entries(this.values).filter(([, v]) => v.receivedAt <= now)
      .map(([key, v]) => [key, {
        value: v.value,
        ageSec: Math.floor((now - v.receivedAt) / 1000),
        stale: now - v.receivedAt > 180000,
        source: reporterSource(key),
      }]));
  }

  flowSnapshot(now: number): Record<string, unknown> {
    return reporterFlowSnapshot({
      fields: Object.fromEntries(Object.entries(this.flowValues)
        .filter(([, v]) => v.receivedAt <= now).map(([key, v]) => [key, {
          value: v.value, ageSec: Math.floor((now - v.receivedAt) / 1000), stale: now - v.receivedAt > 180000,
        }])),
    });
  }
}

/** Fixed projection only: no API-returned identity or error text leaves the device. */
export function mainResolutionSnapshot(input: any, now: number): Record<string, unknown> {
  const at = input?.receivedAt;
  const valid = typeof at === 'number' && Number.isFinite(at) && at > 0 && at <= now;
  return {
    status: valid && ['matched', 'changed', 'failed'].includes(input?.status) ? input.status : 'not_checked',
    ageSec: valid ? Math.floor((now - at) / 1000) : null,
    stale: !valid || now - at > 300000,
    resolvedFamily: valid && ['original_stream', 'ac_5000', 'stream_5000', 'unknown'].includes(input?.family)
      ? input.family : 'unknown',
    installationScopeVerified: false,
    automaticRepairAllowed: false,
  };
}

export function systemReporterSnapshot(input: any): Record<string, any> {
  return Object.fromEntries(['socPct', 'batteryW'].flatMap((key) => {
    const v = input?.[key];
    const min = key === 'socPct' ? 0 : -100000;
    const max = key === 'socPct' ? 100 : 100000;
    if (typeof v?.value !== 'number' || !Number.isFinite(v.value) || v.value < min || v.value > max
      || typeof v.ageSec !== 'number' || !Number.isFinite(v.ageSec) || v.ageSec < 0) return [];
    return [[key, {
      value: v.value,
      ageSec: v.ageSec,
      stale: v.stale !== false || v.ageSec > 180,
      source: reporterSource(key),
    }]];
  }));
}

/** A preview of repair prerequisites, not authority to switch sources. */
export function reporterRepairPreview(system: Record<string, any>, matchedAggregateCount: number): Record<string, unknown> {
  const fresh = (key: string) => system[key] && system[key].stale === false;
  return {
    status: matchedAggregateCount > 0 ? 'candidate_requires_validation' : 'no_correlated_aggregate',
    freshSystemSoc: Boolean(fresh('socPct')),
    freshSystemBatteryPower: Boolean(fresh('batteryW')),
    matchedAggregateCount,
    repairAllowed: false,
    blockers: ['installation_scope_unverified', 'counter_source_transition_unverified', 'hardware_acceptance_pending'],
    preservesExistingDevices: true,
    requiresRePairing: false,
    controlMigrationAllowed: false,
  };
}
