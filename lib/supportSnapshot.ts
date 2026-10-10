'use strict';

import { isStream5000BetaEnabled } from './stream5000Beta';
import { streamDiscoverySnapshot } from './streamDiscovery';
import { stream5000ConfigurationSnapshot } from './stream5000Configuration';
import { stream5000Assessment } from './stream5000Assessment';
import { STREAM_5000_LIVE_CAPABILITIES } from './stream5000Readings';
import { reportingSnapshot } from './streamReportingDiagnostics';
import { BK_PV_CAPS } from './streamBkPvDiagnostics';
import { reporterRepairPreview, systemReporterSnapshot } from './streamReporterEvidence';
import {
  readStreamTopologyEvidence, StreamAggregateEvidence, streamAggregateOverlapSnapshot, streamTopologySnapshot,
} from './streamTopology';

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

/** Fixed-list original-meter evidence, distinct from battery/topology roles. */
function meterSnapshot(device: any): Record<string, unknown> | null {
  try {
    const input = device.getMeterDiagnostics?.();
    if (!input) return null;
    const project = (keys: string[], values: any) => Object.fromEntries(keys.filter((key) => values?.[key])
      .map((key) => {
        const field = values[key];
        return [key, {
          value: typeof field.value === 'number' && Number.isFinite(field.value) ? field.value : null,
          ageSec: safeNumber(field.ageSec),
          stale: field.stale !== false || safeNumber(field.ageSec) === null,
        }];
      }));
    return {
      samples: safeNumber(input.samples),
      directGridFresh: input.directGridFresh === true,
      accountingSource: 'integrated_power',
      nativeCounterMigrationEnabled: false,
      counterEvidence: {
        status: ['waiting', 'incomplete', 'invalid', 'consistent', 'counter_decrease'].includes(input.counterEvidence?.status)
          ? input.counterEvidence.status : 'waiting',
        validRecords: safeNumber(input.counterEvidence?.validRecords),
        lastRecordAgeSec: safeNumber(input.counterEvidence?.lastRecordAgeSec),
        stale: input.counterEvidence?.stale !== false || safeNumber(input.counterEvidence?.lastRecordAgeSec) === null
          || input.counterEvidence.lastRecordAgeSec > 180,
        importAdvanceObserved: input.counterEvidence?.importAdvanceObserved === true,
        exportAdvanceObserved: input.counterEvidence?.exportAdvanceObserved === true,
        counterDecreaseObserved: input.counterEvidence?.counterDecreaseObserved === true,
        unitsVerified: false,
        midnightBehaviourVerified: false,
        migrationAllowed: false,
      },
      readings: project(['measure_power', 'power_factor', ...[1, 2, 3].flatMap((phase) => [
        `measure_power.l${phase}`, `measure_voltage.l${phase}`, `measure_current.l${phase}`, `gridConnectionFlagL${phase}`,
      ]), 'gridConnectionSta'], input.readings),
      counterCandidates: project(['todayActive', 'totalReactiveEnergy', 'totalActiveEnergy'], input.counterCandidates),
    };
  } catch {
    return null;
  }
}

/** Read-only local evidence: no cloud requests, secrets, names or full serials (prefixes only). */
export function createSupportSnapshot(homey: any): Record<string, unknown> {
  const manifest = homey?.manifest || homey?.app?.manifest || {};
  const now = Date.now();
  const aggregates: StreamAggregateEvidence[] = [];
  const reporters: Array<{ driverId: string; deviceIndex: number; evidence: any; system: Record<string, any> }> = [];
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
    const evidenceByDevice = devices.map(readStreamTopologyEvidence);
    const systemReporter = id === 'stream' || id === 'stream_unit' ? [] : devices.map((device, deviceIndex) => {
      let system = {};
      try {
        system = systemReporterSnapshot(device.getSystemReporterDiagnostics?.());
      } catch { /* Private getter errors omitted. */ }
      reporters.push({
        driverId: id, deviceIndex, evidence: evidenceByDevice[deviceIndex], system,
      });
      return { deviceIndex, fields: system, installationScopeVerified: false };
    });
    const topology = devices.map((device, deviceIndex) => {
      const evidence = evidenceByDevice[deviceIndex];
      if (role === 'installation_energy') aggregates.push({ driverId: id, deviceIndex, evidence });
      return { deviceIndex, ...streamTopologySnapshot(evidence, now) };
    });
    const configuration = id === 'stream' || id === 'stream_unit' ? [] : devices.map((device, deviceIndex) => {
      try {
        const snapshot = stream5000ConfigurationSnapshot(device.getConfigurationDiagnostics?.());
        return snapshot ? { deviceIndex, ...snapshot } : null;
      } catch {
        return null;
      }
    }).filter(Boolean);
    return {
      id,
      role,
      packaged: Boolean(entry),
      deprecated: entry?.deprecated === true,
      registered,
      pairedCount: devices.length,
      reporting: devices.map((device, deviceIndex) => ({ deviceIndex, ...reportingSnapshot(device, now) })),
      accounting: role === 'installation_energy' ? devices.map(accountingSnapshot).filter(Boolean) : [],
      topology,
      systemReporter,
      configuration,
      assessment: id === 'stream' || id === 'stream_unit' ? [] : devices.map((_device, deviceIndex) => ({
        deviceIndex,
        ...stream5000Assessment(evidenceByDevice[deviceIndex],
          configuration.find((item) => item?.deviceIndex === deviceIndex), now),
      })),
      readingFreshness: id === 'stream' ? [] : devices.map((device, deviceIndex) => {
        try {
          const input = device.getReadingDiagnostics?.();
          const allowed = id === 'stream_unit' ? BK_PV_CAPS : STREAM_5000_LIVE_CAPABILITIES;
          const readings = Object.fromEntries(allowed.filter((key) => input?.[key])
            .map((key) => [key, { ageSec: safeNumber(input[key].ageSec), stale: input[key].stale !== false }]));
          return { deviceIndex, readings };
        } catch {
          return { deviceIndex, readings: {} }; // No private getter or exception contents.
        }
      }),
      connection: id === 'stream' || id === 'stream_unit' ? [] : devices.map((device, deviceIndex) => {
        try {
          const input = device.getConnectionDiagnostics?.();
          if (!input) return null;
          return {
            deviceIndex,
            subscriptionState: ['starting', 'active', 'waiting', 'stopped'].includes(input.subscriptionState)
              ? input.subscriptionState : 'unknown',
            frameAgeSec: safeNumber(input.frameAgeSec),
            telemetryAgeSec: safeNumber(input.telemetryAgeSec),
            subscriptionAttempts: safeNumber(input.subscriptionAttempts),
            reconnectCount: safeNumber(input.reconnectCount),
          };
        } catch {
          return null;
        }
      }).filter(Boolean),
    };
  });
  let platform = 'unknown';
  if (homey?.platform === 'cloud' || homey?.platform === 'local') platform = homey.platform;
  let discovery = null;
  try {
    discovery = homey?.app?.getStreamDiscoveryEvidence?.();
  } catch { /* No private exception text. */ }
  let smartMeters: any[] = [];
  try {
    const devices = homey.drivers.getDriver('smartmeter')?.getDevices?.();
    if (Array.isArray(devices)) smartMeters = devices.map((device, deviceIndex) => ({ deviceIndex, evidence: meterSnapshot(device) }));
  } catch { /* Meter driver may not be packaged or paired. */ }
  return {
    schemaVersion: 7,
    appVersion: safeVersion(manifest.version),
    homeyVersion: safeVersion(homey?.version),
    platform,
    betaPairingEnabled: isStream5000BetaEnabled(homey),
    drivers,
    smartMeters,
    installationTopology: streamAggregateOverlapSnapshot(aggregates, now),
    reporterRepair: reporters.map((reporter) => {
      const matches = aggregates.filter((aggregate) => aggregate.evidence?.addressSn
        && reporter.evidence?.peers?.some((peer: any) => peer.sn === aggregate.evidence!.addressSn
          && peer.seenAt <= now && now - peer.seenAt <= 180000));
      return {
        driverId: reporter.driverId,
        deviceIndex: reporter.deviceIndex,
        correlatedAggregates: matches.map(({ driverId, deviceIndex }) => ({ driverId, deviceIndex })),
        ...reporterRepairPreview(reporter.system, matches.length),
      };
    }),
    streamDiscovery: streamDiscoverySnapshot(discovery, now),
  };
}
