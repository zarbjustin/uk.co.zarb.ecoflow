'use strict';

interface ShadowAggregate {
  driverId: string;
  deviceIndex: number;
  addressSn?: string;
  resolution: any;
  reporting: any;
}

interface ShadowReporter {
  driverId: string;
  deviceIndex: number;
  evidence: any;
  system: Record<string, any>;
}

function serial(input: unknown): string | null {
  return typeof input === 'string' && /^[a-z0-9]{4,64}$/i.test(input) ? input.toUpperCase() : null;
}

function validReceipt(at: unknown, now: number, maxAge: number): boolean {
  return typeof at === 'number' && Number.isFinite(at) && at > 0 && at <= now && now - at <= maxAge;
}

function reading(input: any, min: number, max: number) {
  const valid = typeof input?.value === 'number' && Number.isFinite(input.value) && input.value >= min && input.value <= max
    && typeof input.ageSec === 'number' && Number.isFinite(input.ageSec) && input.ageSec >= 0;
  const fresh = valid && input.ageSec <= 180 && input.stale !== true;
  return { value: fresh ? input.value as number : null, ageSec: valid ? input.ageSec as number : null, fresh };
}

/** Private identities in, fixed anonymous projection out. This never repairs or writes anything. */
export function reporterShadowSnapshot(aggregates: ShadowAggregate[], reporters: ShadowReporter[], now: number): Record<string, unknown>[] {
  return aggregates.map((aggregate) => {
    const resolved = serial(aggregate.resolution?.sn);
    const read = serial(aggregate.resolution?.readSn);
    const matches = resolved ? reporters.filter((reporter) => serial(reporter.evidence?.addressSn) === resolved) : [];
    // Duplicate Homey representations are deliberately not picked by array order.
    const aggregateMatches = resolved ? aggregates.filter((other) => serial(other.resolution?.sn) === resolved) : [];
    let status = 'resolution_unavailable';
    if (resolved && read) {
      if (!validReceipt(aggregate.resolution.receivedAt, now, 300000)) status = 'resolution_stale';
      else if (read !== serial(aggregate.resolution.currentReadSn) || read !== serial(aggregate.addressSn)) status = 'legacy_address_mismatch';
      else if (resolved === read) status = 'reporter_unchanged';
      else if (matches.length === 0) status = 'resolved_reporter_not_paired';
      else if (matches.length !== 1 || aggregateMatches.length !== 1) status = 'ambiguous_representations';
      else if (!matches[0].evidence?.peers?.some((peer: any) => serial(peer.sn) === read
        && validReceipt(peer.seenAt, now, 180000))) status = 'fresh_peer_correlation_missing';
      else status = 'comparison_ready';
    }
    const candidate = status === 'comparison_ready' ? matches[0] : null;
    const comparisons = Object.fromEntries([
      ['socPct', 'measure_battery', 0, 100], ['batteryW', 'measure_power', -100000, 100000],
    ].map(([key, capability, min, max]) => {
      const legacy = reading(aggregate.reporting?.observations?.[capability], min as number, max as number);
      const proposed = reading(candidate?.system?.[key], min as number, max as number);
      const skew = legacy.ageSec !== null && proposed.ageSec !== null ? Math.abs(legacy.ageSec - proposed.ageSec) : null;
      const comparable = legacy.fresh && proposed.fresh && skew !== null && skew <= 30;
      let comparisonStatus = 'candidate_unavailable';
      if (candidate) {
        comparisonStatus = 'missing_or_stale';
        if (legacy.fresh && proposed.fresh) comparisonStatus = comparable ? 'comparable_receipts' : 'receipt_skew_exceeded';
      }
      return [key, {
        status: comparisonStatus,
        legacy,
        candidate: proposed,
        candidateSource: key === 'socPct' ? 'app_protocol_system_soc' : 'derived_app_protocol_flow_matrix',
        receiptSkewSec: skew,
        candidateMinusLegacy: comparable ? proposed.value! - legacy.value! : null,
      }];
    }));
    return {
      driverId: aggregate.driverId,
      deviceIndex: aggregate.deviceIndex,
      status,
      exactResolvedReporterCount: matches.length,
      candidateDevice: candidate ? { driverId: candidate.driverId, deviceIndex: candidate.deviceIndex } : null,
      comparisons,
      maxComparisonReceiptSkewSec: 30,
      deviceTimestampsVerified: false,
      installationScopeVerified: false,
      telemetryOnly: true,
      energyAccountingUnchanged: true,
      repairAllowed: false,
      controlMigrationAllowed: false,
    };
  });
}
