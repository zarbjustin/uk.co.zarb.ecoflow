'use strict';

import { isStream5000BetaEnabled } from './stream5000Beta';

const DRIVER_ROLES = {
  stream: 'installation_energy',
  stream_unit: 'physical_monitor',
  stream_5000_system: 'installation_energy',
  stream_5000_unit: 'physical_monitor',
  stream_ac5000: 'legacy_physical_monitor',
} as const;

function safeVersion(value: unknown): string | null {
  return typeof value === 'string' && /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(value) ? value : null;
}

function safeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Re-project even internal diagnostic results: never forward arbitrary objects. */
function accountingSnapshot(device: any): Record<string, unknown> | null {
  try {
    const input = device.getEnergyDiagnostics?.();
    if (!input) return null;
    const source = ['waiting', 'device_counters', 'integrated_power'].includes(input.source) ? input.source : 'waiting';
    return {
      source,
      samples: safeNumber(input.samples),
      skippedSamples: safeNumber(input.skippedSamples),
      ignoredGaps: safeNumber(input.ignoredGaps),
      counterResets: safeNumber(input.counterResets),
      chargedCounterSeen: input.chargedCounterSeen === true,
      dischargedCounterSeen: input.dischargedCounterSeen === true,
      lastSampleAgeSec: safeNumber(input.lastSampleAgeSec),
      chargedKWh: safeNumber(input.chargedKWh),
      dischargedKWh: safeNumber(input.dischargedKWh),
      checkpoint: {
        pending: input.checkpoint?.pending === true,
        writing: input.checkpoint?.writing === true,
        failures: safeNumber(input.checkpoint?.failures),
      },
    };
  } catch {
    return null;
  }
}

/** Read-only, local support evidence. No cloud requests, secrets, names or serials. */
export function createSupportSnapshot(homey: any): Record<string, unknown> {
  const manifest = homey?.manifest || homey?.app?.manifest || {};
  const drivers = Object.entries(DRIVER_ROLES).map(([id, role]) => {
    const entry = Array.isArray(manifest.drivers) ? manifest.drivers.find((candidate: any) => candidate.id === id) : undefined;
    let registered = false;
    let devices: any[] = [];
    try {
      const driver = homey.drivers.getDriver(id);
      registered = Boolean(driver);
      const found = driver?.getDevices?.();
      if (Array.isArray(found)) devices = found;
    } catch {
      // Report absence without returning exception text or private identifiers.
    }
    return {
      id,
      role,
      packaged: Boolean(entry),
      deprecated: entry?.deprecated === true,
      registered,
      pairedCount: devices.length,
      accounting: role === 'installation_energy' ? devices.map(accountingSnapshot).filter(Boolean) : [],
    };
  });
  let platform = 'unknown';
  if (homey?.platform === 'cloud' || homey?.platform === 'local') platform = homey.platform;
  return {
    schemaVersion: 1,
    appVersion: safeVersion(manifest.version),
    homeyVersion: safeVersion(homey?.version),
    platform,
    betaPairingEnabled: isStream5000BetaEnabled(homey),
    drivers,
  };
}
