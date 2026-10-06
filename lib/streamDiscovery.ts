'use strict';

import { AppDevice } from './appDevices';
import { knownDeveloperApiRole } from './deviceIdentity';
import { stream5000ModelFromSn } from './stream5000Models';

export const MAX_DISCOVERY_DEVICES = 256;
export const DISCOVERY_STALE_AFTER_MS = 20 * 60 * 1000;
const MODELS = ['stream_5000', 'stream_ac_5000', 'original_stream', 'smart_meter', 'microinverter', 'unverified'];
const HINTS = ['expansion_5000', 'expansion_3000', 'stream_3000', 'gateway', 'dual_ct_meter', 'none'];

interface DiscoveryGroup {
  prefix: string;
  verifiedModel: string;
  productHint: string;
  count: number;
  onlineCount: number;
  sharedCount: number;
}

/** Product metadata is a research hint only; never use a user-assigned device name. */
function productHint(value: unknown): string {
  if (typeof value !== 'string' || value.length > 100) return 'none';
  const name = value.trim().replace(/[-_\s]+/g, ' ').toUpperCase();
  if (/^(?:ECOFLOW )?STREAM EXPANSION BATTERY 5000$/.test(name)) return 'expansion_5000';
  if (/^(?:ECOFLOW )?STREAM EXPANSION BATTERY 3000$/.test(name)) return 'expansion_3000';
  if (/^(?:ECOFLOW )?STREAM (?:AC )?3000$/.test(name)) return 'stream_3000';
  if (/^(?:ECOFLOW )?STREAM GATEWAY$/.test(name)) return 'gateway';
  if (/^(?:ECOFLOW )?SMART METER DUAL CT$/.test(name)) return 'dual_ct_meter';
  return 'none';
}

function verifiedModel(sn: string): string {
  const model = stream5000ModelFromSn(sn);
  if (model) return model.id;
  const role = knownDeveloperApiRole(sn);
  return role === 'stream_unit' ? 'original_stream' : role || 'unverified';
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    && value <= MAX_DISCOVERY_DEVICES ? value : 0;
}

function requiredProductEvidence(hint: string): string[] {
  let scope = ['measurement_scope'];
  if (hint.startsWith('expansion_')) scope = ['host_inclusion', 'capacity_units'];
  if (hint === 'stream_3000') scope = ['model_specific_adapter', 'energy_direction'];
  return ['model_identity', 'masked_telemetry', ...scope, 'hardware_validation'];
}

/** Strict public projection, including when the app getter is missing or malformed. */
export function streamDiscoverySnapshot(input: any, now: number): Record<string, unknown> {
  const observedAt = typeof input?.observedAt === 'number' && Number.isFinite(input.observedAt)
    && input.observedAt >= 0 && input.observedAt <= now ? input.observedAt : null;
  const groups: DiscoveryGroup[] = [];
  let total = 0;
  if (observedAt !== null && Array.isArray(input?.groups)) {
    for (const item of input.groups.slice(0, MAX_DISCOVERY_DEVICES)) {
      if (typeof item?.prefix !== 'string' || !/^[A-Z0-9]{4}$/.test(item.prefix)) continue;
      if (!MODELS.includes(item.verifiedModel) || !HINTS.includes(item.productHint)) continue;
      const n = Math.min(count(item.count), MAX_DISCOVERY_DEVICES - total);
      if (!n) continue;
      total += n;
      groups.push({
        prefix: item.prefix,
        // Identity is still registry-derived even if an internal getter is malformed.
        verifiedModel: verifiedModel(item.prefix),
        productHint: item.productHint,
        count: n,
        onlineCount: Math.min(count(item.onlineCount), n),
        sharedCount: Math.min(count(item.sharedCount), n),
      });
    }
  }
  const age = observedAt === null ? null : now - observedAt;
  return {
    source: observedAt === null ? 'unavailable' : 'cached_app_account_list',
    scope: 'account_not_installation',
    membership: 'unverified',
    expansionCapacity: 'unverified',
    lastObservationAgeSec: age === null ? null : Math.round(age / 1000),
    stale: age === null || age > DISCOVERY_STALE_AFTER_MS,
    observedDeviceCount: total,
    invalidRecordCount: observedAt === null ? 0 : count(input?.invalidRecordCount),
    truncated: observedAt !== null && input?.truncated === true,
    groups,
    productResearch: [...new Set(groups.map((group) => group.productHint).filter((hint) => hint !== 'none'))].map((hint) => ({
      productHint: hint,
      status: 'identity_and_hardware_evidence_pending',
      pairingEnabled: false,
      contributesToEnergy: false,
      requiredEvidence: requiredProductEvidence(hint),
    })),
  };
}

/** Session-only anonymous inventory. No raw identity, product name or credential is retained. */
export class StreamDiscoveryInventory {
  private generation = 0;
  private request = 0;
  private evidence: Record<string, unknown> | null = null;

  clear(): void {
    this.generation += 1;
    this.evidence = null;
  }

  /** Capture a generation before the existing pairing request; reject late/old-account responses. */
  beginObservation(): (devices: AppDevice[], observedAt?: number) => void {
    const { generation } = this;
    const request = ++this.request;
    return (devices, observedAt = Date.now()) => {
      if (generation !== this.generation || request !== this.request || !Array.isArray(devices)) return;
      const groups = new Map<string, DiscoveryGroup>();
      const seen = new Set<string>();
      let invalidRecordCount = 0;
      for (const item of devices.slice(0, MAX_DISCOVERY_DEVICES)) {
        const sn = typeof item?.sn === 'string' ? item.sn.toUpperCase() : '';
        if (!/^[A-Z0-9]{8,64}$/.test(sn)) {
          invalidRecordCount += 1; continue;
        }
        if (seen.has(sn)) continue;
        seen.add(sn);
        const prefix = sn.slice(0, 4);
        const model = verifiedModel(sn);
        const hint = productHint(item.productName);
        const key = `${prefix}:${model}:${hint}`;
        const group = groups.get(key) || {
          prefix,
          verifiedModel: model,
          productHint: hint,
          count: 0,
          onlineCount: 0,
          sharedCount: 0,
        };
        group.count += 1;
        if (item.online === 1) group.onlineCount += 1;
        if (item.shared === true) group.sharedCount += 1;
        groups.set(key, group);
      }
      this.evidence = {
        observedAt,
        invalidRecordCount,
        truncated: devices.length > MAX_DISCOVERY_DEVICES,
        groups: [...groups.values()].sort((a, b) => `${a.prefix}:${a.productHint}`.localeCompare(`${b.prefix}:${b.productHint}`)),
      };
    };
  }

  evidenceSnapshot(): Record<string, unknown> | null {
    return this.evidence ? {
      ...this.evidence,
      groups: (this.evidence.groups as DiscoveryGroup[]).map((group) => ({ ...group })),
    } : null;
  }
}
