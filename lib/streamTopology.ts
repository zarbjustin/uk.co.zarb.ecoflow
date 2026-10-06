'use strict';

import { Es22Telemetry } from './streamAc5000Protocol';
import { knownDeveloperApiRole } from './deviceIdentity';

/** Private, session-only evidence. Never serialize this object into a support report. */
export interface StreamTopologyEvidence {
  source: 'bk_main_address' | 'es22_peer_records' | 'es21_peer_records';
  addressSn: string;
  peers: Array<{ sn: string; seenAt: number; socObserved?: boolean; rawBatteryPowerObserved?: boolean; pvObserved?: boolean }>;
  maxReportedRecordCount: number;
  lastPeerRecordAt: number | null;
  systemSocObserved: boolean;
  truncated: boolean;
}

export const TOPOLOGY_STALE_AFTER_MS = 20 * 60 * 1000;
export const MAX_OBSERVED_PEERS = 64;

function serial(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.toUpperCase();
  return /^[A-Z0-9]{4,64}$/.test(normalized) ? normalized : null;
}

function timestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function streamTopologyFamily(value: string): string {
  if (knownDeveloperApiRole(value) === 'stream_unit') return 'original_stream';
  if (value.startsWith('ES22')) return 'ac_5000';
  if (value.startsWith('ES21')) return 'stream_5000';
  return 'unknown';
}

/** No inference from account lists, product names, equal SOC or power readings. */
export class Es22TopologyTracker {
  private readonly addressSn: string;
  private readonly peers = new Map<string, number>();
  private readonly visibility = new Map<string, { socObserved: boolean; rawBatteryPowerObserved: boolean; pvObserved: boolean }>();
  private maxReportedRecordCount = 0;
  private lastPeerRecordAt: number | null = null;
  private systemSocObserved = false;
  private truncated = false;

  constructor(addressSn: string) {
    this.addressSn = addressSn;
  }

  observe(telemetry: Es22Telemetry, receivedAt: number): void {
    const address = serial(this.addressSn);
    const at = timestamp(receivedAt);
    if (!address || at === null) return;
    if (telemetry.sourceSn && serial(telemetry.sourceSn) !== address) return;
    if (typeof telemetry.socPct === 'number' && Number.isFinite(telemetry.socPct)
      && telemetry.socPct >= 0 && telemetry.socPct <= 100) this.systemSocObserved = true;
    const count = telemetry.unitRecordCount;
    if (typeof count === 'number' && Number.isSafeInteger(count) && count > 0) {
      this.maxReportedRecordCount = Math.max(this.maxReportedRecordCount, count);
      this.lastPeerRecordAt = Math.max(this.lastPeerRecordAt ?? 0, at);
    }
    for (const candidate of Object.keys(telemetry.unitsBySn || {})) {
      const sn = serial(candidate);
      if (!sn || sn === address) continue;
      if (!this.peers.has(sn) && this.peers.size >= MAX_OBSERVED_PEERS) {
        this.truncated = true;
        continue;
      }
      this.peers.set(sn, Math.max(this.peers.get(sn) ?? 0, at));
      const unit = telemetry.unitsBySn?.[candidate];
      const validSoc = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
      const fields = this.visibility.get(sn) || { socObserved: false, rawBatteryPowerObserved: false, pvObserved: false };
      fields.socObserved ||= validSoc(unit?.socPct) || validSoc(unit?.socPrecisePct);
      fields.rawBatteryPowerObserved ||= typeof unit?.batteryPowerRawW === 'number' && Number.isFinite(unit.batteryPowerRawW);
      fields.pvObserved ||= ['totalW', 'string1W', 'string2W', 'string3W', 'string4W'].some((key) => {
        const value = unit?.pv?.[key as keyof NonNullable<typeof unit.pv>];
        return typeof value === 'number' && Number.isFinite(value) && value >= 0;
      });
      this.visibility.set(sn, fields);
      this.lastPeerRecordAt = Math.max(this.lastPeerRecordAt ?? 0, at);
    }
  }

  evidence(): StreamTopologyEvidence {
    return {
      source: /^ES21/i.test(this.addressSn) ? 'es21_peer_records' : 'es22_peer_records',
      addressSn: this.addressSn,
      peers: [...this.peers].map(([sn, seenAt]) => ({ sn, seenAt, ...this.visibility.get(sn) })),
      maxReportedRecordCount: this.maxReportedRecordCount,
      lastPeerRecordAt: this.lastPeerRecordAt,
      systemSocObserved: this.systemSocObserved,
      truncated: this.truncated,
    };
  }
}

/** Validate even internal getters. Invalid/unsupported sources provide no evidence. */
export function readStreamTopologyEvidence(device: any): StreamTopologyEvidence | null {
  try {
    const input = device.getTopologyEvidence?.();
    if (!input || !['bk_main_address', 'es22_peer_records', 'es21_peer_records'].includes(input.source)) return null;
    const addressSn = serial(input.addressSn);
    if (!addressSn) return null;
    const peers = new Map<string, StreamTopologyEvidence['peers'][number]>();
    const appPeerSource = input.source === 'es22_peer_records' || input.source === 'es21_peer_records';
    if (appPeerSource && Array.isArray(input.peers)) {
      for (const peer of input.peers.slice(0, MAX_OBSERVED_PEERS)) {
        const sn = serial(peer?.sn);
        const at = timestamp(peer?.seenAt);
        if (sn && sn !== addressSn && at !== null) {
          const prior = peers.get(sn);
          peers.set(sn, {
            sn,
            seenAt: Math.max(prior?.seenAt ?? 0, at),
            socObserved: prior?.socObserved === true || peer.socObserved === true,
            rawBatteryPowerObserved: prior?.rawBatteryPowerObserved === true || peer.rawBatteryPowerObserved === true,
            pvObserved: prior?.pvObserved === true || peer.pvObserved === true,
          });
        }
      }
    }
    return {
      source: input.source,
      addressSn,
      peers: [...peers.values()],
      maxReportedRecordCount: Number.isSafeInteger(input.maxReportedRecordCount)
        && input.maxReportedRecordCount >= 0 ? input.maxReportedRecordCount : 0,
      lastPeerRecordAt: appPeerSource ? timestamp(input.lastPeerRecordAt) : null,
      systemSocObserved: appPeerSource && input.systemSocObserved === true,
      truncated: input.truncated === true || (Array.isArray(input.peers) && input.peers.length > MAX_OBSERVED_PEERS),
    };
  } catch {
    return null;
  }
}

/** Anonymous projection: observations are not certified membership or migration authority. */
export function streamTopologySnapshot(evidence: StreamTopologyEvidence | null, now: number): Record<string, unknown> {
  if (!evidence) return { source: 'unavailable', membership: 'unverified' };
  const peerFamilies: Record<string, number> = {
    original_stream: 0, ac_5000: 0, stream_5000: 0, unknown: 0,
  };
  for (const peer of evidence.peers) peerFamilies[streamTopologyFamily(peer.sn)] += 1;
  const age = evidence.lastPeerRecordAt === null ? null : Math.max(0, now - evidence.lastPeerRecordAt);
  return {
    source: evidence.source,
    membership: 'unverified',
    pairedAddressFamily: streamTopologyFamily(evidence.addressSn),
    observedPeerCount: evidence.peers.length,
    freshPeerCount: evidence.peers.filter((peer) => peer.seenAt <= now && now - peer.seenAt <= TOPOLOGY_STALE_AFTER_MS).length,
    peerFamilies,
    // Snapshot-local indices, not device identity or proof that a record is an expansion pack.
    peerVisibility: evidence.peers.map((peer, observationIndex) => ({
      observationIndex,
      prefix: peer.sn.slice(0, 4),
      family: streamTopologyFamily(peer.sn),
      entityRole: 'unverified',
      fresh: peer.seenAt <= now && now - peer.seenAt <= TOPOLOGY_STALE_AFTER_MS,
      fieldsSeenThisSession: {
        soc: peer.socObserved === true,
        rawBatteryPower: peer.rawBatteryPowerObserved === true,
        pv: peer.pvObserved === true,
      },
    })),
    expansionPackCount: null,
    installedCapacityKWh: null,
    maxReportedRecordCount: evidence.maxReportedRecordCount,
    lastPeerRecordAgeSec: age === null ? null : Math.round(age / 1000),
    peerEvidenceStale: age === null || evidence.lastPeerRecordAt! > now || age > TOPOLOGY_STALE_AFTER_MS,
    systemSocObserved: evidence.systemSocObserved,
    truncated: evidence.truncated,
  };
}

export interface StreamAggregateEvidence {
  driverId: string;
  deviceIndex: number;
  evidence: StreamTopologyEvidence | null;
}

/** Review candidates only. No overlap is not proof of independence or completeness. */
export function streamAggregateOverlapSnapshot(aggregates: StreamAggregateEvidence[], now: number): Record<string, unknown> {
  const potentialOverlapPairs: Array<Record<string, unknown>> = [];
  for (let left = 0; left < aggregates.length; left += 1) {
    const a = aggregates[left];
    if (!a.evidence) continue;
    for (let right = left + 1; right < aggregates.length; right += 1) {
      const b = aggregates[right];
      if (!b.evidence) continue;
      const aEvidence = a.evidence;
      const bEvidence = b.evidence;
      const sameAddress = aEvidence.addressSn === bEvidence.addressSn;
      const observed = new Set([aEvidence.addressSn, ...aEvidence.peers.map((peer) => peer.sn)]);
      const intersects = observed.has(bEvidence.addressSn) || bEvidence.peers.some((peer) => observed.has(peer.sn));
      if (!intersects) continue;
      const fresh = (evidence: StreamTopologyEvidence) => new Set([
        evidence.addressSn,
        ...evidence.peers.filter((peer) => peer.seenAt <= now && now - peer.seenAt <= TOPOLOGY_STALE_AFTER_MS).map((peer) => peer.sn),
      ]);
      const freshA = fresh(aEvidence);
      const freshEvidence = [...fresh(bEvidence)].some((sn) => freshA.has(sn));
      potentialOverlapPairs.push({
        left: { driverId: a.driverId, deviceIndex: a.deviceIndex },
        right: { driverId: b.driverId, deviceIndex: b.deviceIndex },
        basis: sameAddress ? 'same_paired_address' : 'shared_observed_serial',
        // A paired-address match is configuration evidence, not fresh telemetry.
        freshEvidence: sameAddress ? null : freshEvidence,
        action: 'review_only',
      });
    }
  }
  return {
    autoGroupingEnabled: false,
    stableMembershipVerified: false,
    aggregateCount: aggregates.length,
    evidenceAvailableCount: aggregates.filter((item) => item.evidence !== null).length,
    potentialOverlapPairs,
  };
}
