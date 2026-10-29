'use strict';

import { isStream5000AggregatePairingEnabled } from './stream5000PairingAccess';
import { streamDiscoverySnapshot } from './streamDiscovery';
import { dualCtResearchSnapshot } from './dualCtResearch';
import { stream5000ConfigurationSnapshot } from './stream5000Configuration';
import { stream5000Assessment } from './stream5000Assessment';
import { STREAM_5000_LIVE_CAPABILITIES } from './stream5000Readings';
import { STREAM_5000_PRESENTATION_STATES } from './stream5000BatteryPresentation';
import { reportingSnapshot } from './streamReportingDiagnostics';
import { BK_PV_CAPS } from './streamBkPvDiagnostics';
import { REMAINING_TIME_CAPS } from './StreamRemainingTime';
import { correlateStreamPeers, PairedUnitReference, streamReadingExplanations } from './streamDiagnosticChecks';
import { STREAM_SYSTEM_LIVE_CAPS, STREAM_UNIT_LIVE_CAPS } from './StreamLiveReadings';
import { STREAM_LIMIT_FIELDS } from './streamLimitDiagnostics';
import {
  reporterRepairPreview, systemReporterSnapshot, reporterFlowSnapshot, ownUnitSnapshot,
} from './streamReporterEvidence';
import { reporterShadowSnapshot } from './streamReporterShadow';
import { monitoringTrialSnapshot } from './streamMonitoringTrial';
import { powerHistorySnapshot } from './streamPowerHistory';
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
      activeGrid: input.activeGrid ? {
        source: ['direct_meter', 'linked_installation'].includes(input.activeGrid.source) ? input.activeGrid.source : 'unknown',
        value: input.activeGrid.stale === false && safeNumber(input.activeGrid.ageSec) !== null && input.activeGrid.ageSec <= 90
          && typeof input.activeGrid.value === 'number' && Number.isFinite(input.activeGrid.value) ? input.activeGrid.value : null,
        ageSec: safeNumber(input.activeGrid.ageSec),
        stale: input.activeGrid.stale !== false || safeNumber(input.activeGrid.ageSec) === null || input.activeGrid.ageSec > 90,
      } : null,
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
  const shadowAggregates: Array<{ driverId: string; deviceIndex: number; addressSn?: string; resolution: any; reporting: any }> = [];
  const reporters: Array<{ driverId: string; deviceIndex: number; evidence: any; system: Record<string, any> }> = [];
  const pairedUnits: PairedUnitReference[] = [];
  const peerSources: Array<{ driverId: string; deviceIndex: number; evidence: any }> = [];
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
    if (role === 'physical_monitor' || role === 'legacy_physical_monitor') {
      devices.forEach((device, deviceIndex) => {
        try {
          const sn = device.getData?.()?.sn;
          if (typeof sn === 'string') {
            let history;
            try {
              history = device.getPowerHistoryDiagnostics?.();
            } catch { /* Optional history does not suppress matching. */ }
            pairedUnits.push({
              driverId: id,
              deviceIndex,
              sn,
              readings: device.getUnitCorrelationDiagnostics?.(),
              history,
            });
          }
        } catch { /* Private identity/getter errors never leave this process. */ }
      });
    }
    evidenceByDevice.forEach((evidence, deviceIndex) => {
      if (evidence?.source === 'es22_peer_records' || evidence?.source === 'es21_peer_records') {
        peerSources.push({ driverId: id, deviceIndex, evidence });
      }
    });
    const reporting = devices.map((device, deviceIndex) => ({ deviceIndex, ...reportingSnapshot(device, now) }));
    if (id === 'stream') {
      devices.forEach((device, deviceIndex) => {
        let resolution = null;
        try {
          resolution = device.getResolvedReporterEvidence?.();
        } catch { /* No private errors forwarded. */ }
        shadowAggregates.push({
          driverId: id,
          deviceIndex,
          addressSn: evidenceByDevice[deviceIndex]?.addressSn,
          resolution,
          reporting: reporting[deviceIndex],
        });
      });
    }
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
      reporting,
      readingExplanations: devices.map((device, deviceIndex) => {
        let freshness = {};
        try {
          freshness = device.getReadingDiagnostics?.() || {};
        } catch { /* Fixed reasons only. */ }
        return { deviceIndex, readings: streamReadingExplanations(id, device, freshness) };
      }),
      counterContinuity: id !== 'stream' ? [] : devices.map((device, deviceIndex) => {
        let input: any;
        try {
          input = device.getCounterContinuityDiagnostics?.();
          // Read the fixed scope inside the guard, including hostile getters.
          input = { fields: input?.fields, powerComparisonScope: input?.powerComparisonScope };
        } catch {
          input = undefined; /* No private errors. */
        }
        return {
          deviceIndex,
          sourceMigrationAllowed: false,
          installationScopeVerified: false,
          powerComparisonScope: input?.powerComparisonScope === 'monitoring_system_scope_unverified'
            ? 'monitoring_system_scope_unverified' : 'original_address',
          fields: Object.fromEntries(['accuChgEnergy', 'accuDsgEnergy'].map((key) => {
            try {
              const f = input?.fields?.[key];
              const ageSec = safeNumber(f?.ageSec);
              const unchangedSec = safeNumber(f?.unchangedSec);
              const status = ['missing', 'invalid', 'stale', 'baseline_only', 'advance_observed', 'unchanged'].includes(f?.status)
                ? f.status : 'missing';
              return [key, {
                status,
                ageSec,
                unchangedSec,
                advanceObserved: f?.advanceObserved === true,
                resetCount: safeNumber(f?.resetCount),
                possibleStall: f?.possibleStall === true && ageSec !== null && ageSec <= 180
                  && unchangedSec !== null && unchangedSec >= 300 && ['unchanged', 'advance_observed'].includes(status),
                stallVerified: false,
              }];
            } catch {
              return [key, {
                status: 'missing',
                ageSec: null,
                unchangedSec: null,
                advanceObserved: false,
                resetCount: null,
                possibleStall: false,
                stallVerified: false,
              }];
            }
          })),
        };
      }),
      physicalPower: !['stream_5000_unit', 'stream_ac5000'].includes(id) ? [] : devices.map((device, deviceIndex) => {
        let status = 'waiting_for_unit_evidence';
        try {
          const observed = device.getPhysicalPowerDiagnostics?.()?.status;
          if (['linked_power_unverified', 'unit_reading_available'].includes(observed)) status = observed;
        } catch { /* Fixed diagnostic labels only. */ }
        return {
          deviceIndex, status, physicalScopeVerified: false, linkedSystemPowerCopiedToUnit: false, energyContribution: false,
        };
      }),
      batteryReadingStatus: !['stream_5000_unit', 'stream_ac5000'].includes(id) ? [] : devices.map((device, deviceIndex) => {
        try {
          const input = device.getBatteryReadingStatusDiagnostics?.();
          let status = STREAM_5000_PRESENTATION_STATES.includes(input?.status) ? input.status : 'waiting';
          const age = safeNumber(input?.lastStandbyAgeSec);
          if (status === 'last_reported_standby' && (age === null || age > 1200)) status = 'expired';
          return {
            deviceIndex,
            status,
            live: status === 'live',
            energyUsed: false,
            lastStandbyAgeSec: ['live', 'last_reported_standby'].includes(status) && age !== null && age <= 1200 ? Math.floor(age) : null,
          };
        } catch {
          return {
            deviceIndex, status: 'waiting', live: false, energyUsed: false, lastStandbyAgeSec: null,
          };
        }
      }),
      monitoringTrial: id === 'stream' ? devices.map((device, deviceIndex) => {
        let input = null;
        try {
          input = device.getMonitoringTrialDiagnostics?.();
        } catch { /* Private failures omitted. */ }
        return { deviceIndex, ...monitoringTrialSnapshot(input) };
      }) : [],
      accounting: role === 'installation_energy' ? devices.map(accountingSnapshot).filter(Boolean) : [],
      topology,
      systemReporter,
      ownUnit: id === 'stream' || id === 'stream_unit' ? [] : devices.map((device, deviceIndex) => {
        let input = null;
        try {
          input = device.getOwnUnitDiagnostics?.();
        } catch { /* No raw objects or identifiers forwarded. */ }
        return { deviceIndex, ...ownUnitSnapshot(input) };
      }),
      systemFlow: id === 'stream' || id === 'stream_unit' ? [] : devices.map((device, deviceIndex) => {
        let input = null;
        try {
          input = device.getSystemFlowDiagnostics?.();
        } catch { /* Private failures omitted. */ }
        return { deviceIndex, ...reporterFlowSnapshot(input) };
      }),
      configuration,
      assessment: id === 'stream' || id === 'stream_unit' ? [] : devices.map((_device, deviceIndex) => ({
        deviceIndex,
        ...stream5000Assessment(evidenceByDevice[deviceIndex],
          configuration.find((item) => item?.deviceIndex === deviceIndex), now),
      })),
      remainingTime: id === 'stream' || id === 'stream_unit' ? devices.map((device, deviceIndex) => {
        let input: any;
        try {
          input = device.getRemainingTimeDiagnostics?.();
        } catch { /* Private failures omitted. */ }
        return {
          deviceIndex,
          readings: Object.fromEntries(REMAINING_TIME_CAPS.filter((cap) => input?.[cap]).map((cap) => {
            const field = input[cap];
            const sources = ['unit_bms_mqtt', 'unit_bms_rest', 'unit_bms_unknown',
              'system_cms_mqtt', 'system_cms_rest', 'system_cms_unknown', 'unobserved'];
            return [cap, {
              source: sources.includes(field.source) ? field.source : 'unobserved',
              ageSec: safeNumber(field.ageSec),
              receivedAgeSec: safeNumber(field.receivedAgeSec),
              stale: field.stale !== false || safeNumber(field.ageSec) === null || field.applicationStatus !== 'applied',
              applicationStatus: ['applied', 'write_failed', 'stale', 'unavailable'].includes(field.applicationStatus)
                ? field.applicationStatus : 'unavailable',
              displayReason: ['not_reported', 'invalid', 'expired', 'direction_unavailable', 'inactive_direction', 'fresh_estimate_required',
                'active_direction', 'write_failed'].includes(field.displayReason) ? field.displayReason : 'not_reported',
              reportedMinutes: safeNumber(field.reportedMinutes) !== null && field.reportedMinutes >= 0
                && field.reportedMinutes <= 10000000 && safeNumber(field.receivedAgeSec) !== null
                && field.receivedAgeSec >= 0 && field.receivedAgeSec <= 180 ? field.reportedMinutes : null,
            }];
          })),
        };
      }) : [],
      recentPower: id !== 'stream_unit' ? [] : devices.map((device, deviceIndex) => {
        let history;
        try {
          history = device.getPowerHistoryDiagnostics?.();
        } catch { /* Optional evidence. */ }
        return { deviceIndex, ...powerHistorySnapshot(history, now) };
      }),
      telemetryQueue: id !== 'stream_unit' ? [] : devices.map((device, deviceIndex) => {
        try {
          const input = device.getTelemetryQueueDiagnostics?.();
          return {
            deviceIndex,
            running: input?.running === true,
            pending: input?.pending === true,
            coalesced: Number.isSafeInteger(input?.coalesced) && input.coalesced >= 0 ? input.coalesced : 0,
            batches: Number.isSafeInteger(input?.batches) && input.batches >= 0 ? input.batches : 0,
            maxPendingBatches: 1,
          };
        } catch {
          return {
            deviceIndex, running: false, pending: false, coalesced: 0, batches: 0, maxPendingBatches: 1,
          };
        }
      }),
      originalUnitBattery: id !== 'stream_unit' ? [] : devices.map((device, deviceIndex) => {
        try {
          const reading = device.getReadingDiagnostics?.()?.stream_unit_power_battery_flow;
          const ageSec = safeNumber(reading?.ageSec);
          const fresh = reading?.stale === false && reading?.applicationStatus === 'applied'
            && ageSec !== null && ageSec >= 0 && ageSec <= 180;
          const value = device.getCapabilityValue?.('stream_unit_power_battery_flow');
          const usable = fresh && typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 100000;
          return {
            deviceIndex,
            source: 'unit_bms_32_50',
            measurementSide: 'dc_pack',
            valueW: usable ? value : null,
            ageSec,
            stale: !usable,
            energyContribution: false,
          };
        } catch {
          return {
            deviceIndex,
            source: 'unit_bms_32_50',
            measurementSide: 'dc_pack',
            valueW: null,
            ageSec: null,
            stale: true,
            energyContribution: false,
          };
        }
      }),
      originalLimits: id === 'stream' || id === 'stream_unit' ? devices.map((device, deviceIndex) => {
        try {
          const input = device.getLimitDiagnostics?.();
          return {
            deviceIndex,
            fields: Object.fromEntries(STREAM_LIMIT_FIELDS.map((key) => {
              const field = input?.[key];
              const ageSec = safeNumber(field?.ageSec);
              const value = safeNumber(field?.value);
              const stale = field?.stale !== false || ageSec === null || ageSec < 0 || ageSec > 180;
              return [key, {
                value: !stale && value !== null && value >= 0 && value <= 100000 ? value : null,
                ageSec,
                stale,
                scopeVerified: false,
                controlEnabled: false,
                source: ['developer_quota', 'app_property'].includes(field?.source) ? field.source : 'unobserved',
              }];
            })),
          };
        } catch {
          return { deviceIndex, fields: {} };
        }
      }) : [],
      readingFreshness: devices.map((device, deviceIndex) => {
        try {
          const input = device.getReadingDiagnostics?.();
          let allowed: readonly string[] = STREAM_5000_LIVE_CAPABILITIES;
          if (id === 'stream_unit') allowed = [...BK_PV_CAPS, ...STREAM_UNIT_LIVE_CAPS];
          else if (id === 'stream') allowed = STREAM_SYSTEM_LIVE_CAPS;
          const readings = Object.fromEntries(allowed.filter((key) => input?.[key])
            .map((key) => {
              const field = input[key];
              const ageSec = safeNumber(field.ageSec);
              if (id === 'stream_unit' && BK_PV_CAPS.includes(key)) return [key, { ageSec, stale: field.stale !== false }];
              const applicationStatus = ['applied', 'write_failed', 'stale', 'unavailable'].includes(field.applicationStatus)
                ? field.applicationStatus : 'unknown';
              return [key, {
                ageSec,
                receivedAgeSec: safeNumber(field.receivedAgeSec),
                stale: field.stale !== false || ageSec === null || applicationStatus === 'write_failed',
                applicationStatus,
              }];
            }));
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
  let dualCtResearch = null;
  try {
    dualCtResearch = homey?.app?.getDualCtResearchSnapshot?.();
  } catch { /* Optional local evidence. */ }
  try {
    discovery = homey?.app?.getStreamDiscoveryEvidence?.();
  } catch { /* No private exception text. */ }
  let smartMeters: any[] = [];
  try {
    const devices = homey.drivers.getDriver('smartmeter')?.getDevices?.();
    if (Array.isArray(devices)) smartMeters = devices.map((device, deviceIndex) => ({ deviceIndex, evidence: meterSnapshot(device) }));
  } catch { /* Meter driver may not be packaged or paired. */ }
  let dualCtPreviews: any[] = [];
  try {
    dualCtPreviews = homey.drivers.getDriver('smartmeter_dual_ct_preview').getDevices().slice(0, 16)
      .map((device: any, deviceIndex: number) => {
        const input = device.getDualCtPreviewDiagnostics?.();
        return {
          deviceIndex,
          enabled: input?.enabled === true,
          status: ['waiting', 'recent', 'waiting_stale', 'disabled', 'account_changed', 'model_unavailable', 'connection_failed', 'display_failed'].includes(input?.status)
            ? input.status : 'unknown',
          acceptedPackets: safeNumber(input?.acceptedPackets),
          receivedFrames: safeNumber(input?.receivedFrames),
          rejectedFrames: safeNumber(input?.rejectedFrames),
          lastFrameAgeSec: safeNumber(input?.lastFrameAgeSec),
          lastReceiptAgeSec: safeNumber(input?.lastReceiptAgeSec),
          valuesIncluded: false,
          contributesToEnergy: false,
          controlsEnabled: false,
        };
      });
  } catch { /* Optional numeric-free preview evidence. */ }
  return {
    schemaVersion: 19,
    capturedAt: new Date(now).toISOString(),
    appVersion: safeVersion(manifest.version),
    homeyVersion: safeVersion(homey?.version),
    platform,
    betaPairingEnabled: false, // Retired compatibility field; no longer gates unit pairing.
    stream5000Pairing: {
      unitMonitoringRequiresOptIn: false,
      aggregateEnergyOptInEnabled: isStream5000AggregatePairingEnabled(homey),
    },
    drivers,
    peerCorrelation: peerSources.map((source) => ({
      driverId: source.driverId,
      deviceIndex: source.deviceIndex,
      peers: correlateStreamPeers(source.evidence, pairedUnits, now),
    })),
    smartMeters,
    dualCtPreviews,
    installationTopology: streamAggregateOverlapSnapshot(aggregates, now),
    reporterShadow: reporterShadowSnapshot(shadowAggregates, reporters, now),
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
    dualCtResearch: dualCtResearchSnapshot(dualCtResearch),
  };
}
