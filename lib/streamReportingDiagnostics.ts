'use strict';

/** Fixed projection: never include quota objects, names, serials or exception text. */
export const REPORTING_CAPABILITIES = [
  'measure_battery', 'measure_power', 'measure_power.pv', 'measure_power.grid',
  'measure_power.load', 'measure_power.grid_import', 'measure_power.grid_export',
  'stream_unit_power_battery_flow', 'stream_5000_direct_pv',
] as const;

export interface ReportingObservation {
  value: number;
  receivedAt: number;
  source: 'mqtt' | 'rest' | 'unknown';
}

export function reportingSnapshot(device: any, now: number): Record<string, unknown> {
  const currentReadings: Record<string, number | null> = {};
  for (const key of REPORTING_CAPABILITIES) {
    try {
      const value = device.getCapabilityValue?.(key);
      currentReadings[key] = typeof value === 'number' && Number.isFinite(value) ? value : null;
    } catch {
      currentReadings[key] = null;
    }
  }
  let observations: Record<string, unknown> = {};
  let readAddressMatchesSavedMain: boolean | null = null;
  try {
    const input = device.getReportingDiagnostics?.();
    if (typeof input?.readAddressMatchesSavedMain === 'boolean') {
      readAddressMatchesSavedMain = input.readAddressMatchesSavedMain;
    }
    observations = Object.fromEntries(REPORTING_CAPABILITIES.flatMap((key) => {
      const entry = input?.observations?.[key];
      if (!entry || typeof entry.value !== 'number' || !Number.isFinite(entry.value)
        || typeof entry.receivedAt !== 'number' || !Number.isFinite(entry.receivedAt)
        || entry.receivedAt <= 0 || entry.receivedAt > now) return [];
      return [[key, {
        value: entry.value,
        ageSec: Math.floor((now - entry.receivedAt) / 1000),
        source: ['mqtt', 'rest'].includes(entry.source) ? entry.source : 'unknown',
      }]];
    }));
  } catch {
    observations = {};
    readAddressMatchesSavedMain = null;
  }
  return {
    currentReadings,
    observations,
    readAddressMatchesSavedMain,
    // Matching addresses do not establish that EcoFlow still uses that reporter.
    currentInstallationReporterVerified: false,
  };
}
