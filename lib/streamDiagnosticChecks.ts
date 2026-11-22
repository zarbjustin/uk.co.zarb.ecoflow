'use strict';

import type { StreamTopologyEvidence } from './streamTopology';
import { powerHistorySnapshot } from './streamPowerHistory';

const FRESH_MS = 180000;
const COUNTERS = ['accuChgEnergy', 'accuDsgEnergy'] as const;
const validAt = (at: number, now: number) => Number.isFinite(at) && at > 0 && at <= now;
const identity = (value: unknown) => (typeof value === 'string' && /^[A-Z0-9]{4,64}$/i.test(value)
  ? value.toUpperCase() : null);
const unitKeyFor = (cap: string) => {
  if (cap === 'measure_battery') return 'socPct';
  if (cap === 'stream_unit_power_grid') return 'gridPortW';
  if (cap === 'stream_unit_power_battery_flow') return 'bmsBatteryW';
  return null;
};

/** Diagnostic-only session evidence. No integration, persistence or source migration. */
export class StreamCounterContinuity {
  private fields: Record<string, { raw: number; at: number; unchangedSince: number;
    advanced: boolean; resets: number; samples: number; invalid: boolean }> = {};

  private invalidAt: Record<string, number> = {};

  observe(quota: Record<string, unknown>, at: number, now = Date.now()): void {
    if (!validAt(at, now) || now - at > FRESH_MS) return;
    if (Object.values(this.fields).some((field) => field.at > now)
      || Object.values(this.invalidAt).some((time) => time > now)) {
      this.fields = {};
      this.invalidAt = {};
    }
    for (const key of COUNTERS) {
      if (!Object.prototype.hasOwnProperty.call(quota, key)) continue;
      const old = this.fields[key];
      if (at < Math.max(old?.at || 0, this.invalidAt[key] || 0)) continue;
      const value = quota[key];
      const raw = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
      if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
        if (old) old.invalid = true;
        this.invalidAt[key] = at;
        continue;
      }
      delete this.invalidAt[key];
      const changed = !old || raw !== old.raw;
      this.fields[key] = {
        raw,
        at,
        unchangedSince: changed || old.invalid || now - old.at > FRESH_MS ? at : old.unchangedSince,
        advanced: Boolean(old?.advanced || (old && raw > old.raw)),
        resets: (old?.resets || 0) + (old && raw < old.raw ? 1 : 0),
        samples: (old?.samples || 0) + (old && at === old.at ? 0 : 1),
        invalid: false,
      };
    }
  }

  snapshot(now: number, powerW?: number, scope = 'original_address'): Record<string, unknown> {
    return {
      sourceMigrationAllowed: false,
      installationScopeVerified: false,
      powerComparisonScope: scope === 'monitoring_system_scope_unverified' ? scope : 'original_address',
      fields: Object.fromEntries(COUNTERS.map((key) => {
        const f = this.fields[key];
        const age = f && validAt(f.at, now) ? Math.floor((now - f.at) / 1000) : null;
        const fresh = age !== null && age <= FRESH_MS / 1000 && !f.invalid;
        const unchanged = f && validAt(f.unchangedSince, now) ? Math.floor((now - f.unchangedSince) / 1000) : null;
        const directionMatches = typeof powerW === 'number' && Number.isFinite(powerW)
          && (key === 'accuChgEnergy' ? powerW > 5 : powerW < -5);
        let status = 'missing';
        if (this.invalidAt[key]) status = 'invalid';
        else if (f) {
          if (!fresh) status = 'stale';
          else if (f.samples < 2) status = 'baseline_only';
          else status = f.advanced ? 'advance_observed' : 'unchanged';
        }
        return [key, {
          status,
          ageSec: age,
          unchangedSec: unchanged,
          advanceObserved: f?.advanced === true,
          resetCount: f?.resets || 0,
          possibleStall: fresh && (f?.samples || 0) >= 2 && (unchanged ?? 0) >= 300 && directionMatches,
          stallVerified: false,
        }];
      })),
    };
  }
}

export interface PairedUnitReference {
  driverId: string; deviceIndex: number; sn: string;
  readings?: Record<string, { value: number; ageSec: number; stale: boolean }>;
  history?: unknown;
}

/** Exact identity matching stays private. Prefix/SOC similarity is never a match. */
export function correlateStreamPeers(evidence: StreamTopologyEvidence | null,
  units: PairedUnitReference[], now: number): Record<string, unknown>[] {
  if (!evidence) return [];
  return evidence.peers.slice(0, 64).map((peer, observationIndex) => {
    const matches = units.filter((unit) => identity(unit.sn) && identity(unit.sn) === identity(peer.sn));
    const fresh = validAt(peer.seenAt, now) && now - peer.seenAt <= FRESH_MS;
    let status = 'exact_identity_match';
    if (!fresh) status = 'stale_peer';
    else if (matches.length === 0) status = 'not_paired';
    else if (matches.length > 1) status = 'ambiguous';
    const unit = matches.length === 1 ? matches[0] : null;
    const compare = (peerKey: string, unitKey: string) => {
      try {
        const direct = peer.readings?.[peerKey as keyof NonNullable<typeof peer.readings>];
        const p = direct ?? (peerKey === 'socPrecisePct' ? peer.readings?.socPct : undefined);
        const u = unit?.readings?.[unitKey];
        const age = p && validAt(p.receivedAt, now) ? (now - p.receivedAt) / 1000 : Infinity;
        const comparable = fresh && p && Number.isFinite(p.value) && Math.abs(p.value) <= 100000
        && u && u.stale === false && Number.isFinite(u.value)
        && (unitKey === 'socPct' ? u.value >= 0 && u.value <= 100 : Math.abs(u.value) <= 100000)
        && Number.isFinite(u.ageSec) && u.ageSec >= 0 && u.ageSec <= 180 && age <= 180
        && Math.abs(age - u.ageSec) <= 30;
        return {
          status: comparable ? 'comparable_receipts' : 'unavailable_or_skewed',
          peerMinusUnit: comparable ? p.value - u.value : null,
          receiptSkewSec: comparable ? Math.abs(age - u.ageSec) : null,
        };
      } catch {
        return { status: 'unavailable_or_skewed', peerMinusUnit: null, receiptSkewSec: null };
      }
    };
    const measurements: Record<string, unknown> = {};
    if (status === 'exact_identity_match') {
      for (const [key, scope] of [['bmsBatteryW', 'unit_dc_pack'], ['gridPortW', 'unit_grid_connection']]) {
        try {
          const field = unit?.readings?.[key];
          const usable = field?.stale === false && Number.isFinite(field.value) && Math.abs(field.value) <= 100000
            && Number.isFinite(field.ageSec) && field.ageSec >= 0 && field.ageSec <= 180;
          measurements[key] = { scope, valueW: usable ? field!.value : null, ageSec: usable ? field!.ageSec : null };
        } catch {
          measurements[key] = { scope, valueW: null, ageSec: null };
        }
      }
      const field = peer.readings?.batteryPowerRawW;
      const usable = field && Number.isFinite(field.value) && Math.abs(field.value) <= 100000
        && validAt(field.receivedAt, now) && now - field.receivedAt <= FRESH_MS;
      measurements.peerRawW = {
        scope: 'peer_record_sign_and_scale_unverified',
        valueW: usable ? field.value : null,
        ageSec: usable ? (now - field.receivedAt) / 1000 : null,
      };
    }
    const bmsComparison = compare('batteryPowerRawW', 'bmsBatteryW');
    const peerPower = measurements.peerRawW as any;
    const bmsPower = measurements.bmsBatteryW as any;
    return {
      observationIndex,
      status,
      pairedDevice: fresh && unit ? { driverId: unit.driverId, deviceIndex: unit.deviceIndex } : null,
      powerMeasurements: measurements,
      recentPower: status === 'exact_identity_match' ? {
        unit: powerHistorySnapshot(unit?.history, now), peer: powerHistorySnapshot(peer.history, now),
      } : {},
      comparisons: status === 'exact_identity_match' ? {
        soc: compare('socPrecisePct', 'socPct'),
        rawPowerVersusPort: {
          ...compare('batteryPowerRawW', 'gridPortW'),
          sameMeasurementVerified: false,
          signAndScaleVerified: false,
        },
        rawPowerVersusBms: {
          status: bmsComparison.status,
          receiptSkewSec: bmsComparison.receiptSkewSec,
          magnitudeDifferenceW: bmsComparison.status === 'comparable_receipts'
            ? Math.abs(peerPower.valueW) - Math.abs(bmsPower.valueW) : null,
          sameMeasurementVerified: false,
          signAndScaleVerified: false,
          conversionLossVerified: false,
        },
      } : {},
      installationMembershipVerified: false,
      accountingUsed: false,
      controlMigrationAllowed: false,
    };
  });
}

/** Applied unit receipts for comparison only; never creates a battery-flow source. */
export class StreamUnitComparison {
  private fields: Record<string, { value: number; at: number }> = {};
  observe(cap: string, value: unknown, at: number, now = Date.now()): void {
    const key = unitKeyFor(cap);
    if (!key || typeof value !== 'number' || !Number.isFinite(value) || !validAt(at, now)
      || now - at > FRESH_MS || (key === 'socPct' ? value < 0 || value > 100 : Math.abs(value) > 100000)) return;
    if (Object.values(this.fields).some((f) => f.at > now)) this.fields = {};
    if (at >= (this.fields[key]?.at || 0)) this.fields[key] = { value, at };
  }

  snapshot(now: number): Record<string, { value: number; ageSec: number; stale: boolean }> {
    return Object.fromEntries(Object.entries(this.fields).filter(([, f]) => validAt(f.at, now)).map(([key, f]) => [key,
      { value: f.value, ageSec: Math.floor((now - f.at) / 1000), stale: now - f.at > FRESH_MS }]));
  }

  failed(cap: string): void {
    const key = unitKeyFor(cap);
    if (key) delete this.fields[key];
  }
}

export function streamReadingExplanations(driverId: string, device: any, freshness: any): Record<string, string> {
  const result: Record<string, string> = {};
  for (const cap of ['stream_unit_power_battery_flow', 'battery_charging_state', 'measure_power.load', 'measure_power.grid']) {
    try {
      if (!device.hasCapability?.(cap)) continue;
      const field = freshness?.[cap];
      if (field?.applicationStatus === 'write_failed') result[cap] = 'write_failed';
      else if (driverId === 'stream_unit' && field?.applicationStatus === 'unavailable') result[cap] = 'not_reported';
      else if (field?.stale === true) result[cap] = 'expired';
      else if (device.getCapabilityValue?.(cap) !== null && device.getCapabilityValue?.(cap) !== undefined) result[cap] = 'available';
      else if (['stream_unit', 'stream_5000_unit', 'stream_ac5000'].includes(driverId)
        && ['stream_unit_power_battery_flow', 'battery_charging_state'].includes(cap)) result[cap] = 'individual_flow_unverified';
      else result[cap] = 'not_reported';
    } catch {
      result[cap] = 'not_reported';
    }
  }
  return result;
}
