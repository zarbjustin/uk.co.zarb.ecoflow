/** Read-only selected-capability contracts; no vendor inferred from names and no device writes. */
import { createHash } from 'crypto';
import { streamCoordinationPreview } from './streamCoordinationPreview';

export const COORDINATION_SLOTS = ['grid', 'externalSoc', 'externalPower', 'streamPower', 'secondary'] as const;
export type CoordinationSlot = typeof COORDINATION_SLOTS[number];
export interface CoordinationBinding {
  deviceId: string; driverId: string; capabilityId: string; unit: 'W' | 'kW' | '%';
  positiveMeans: string;
}
export interface CoordinationBindings {
  schemaVersion: 1; siteKey: string; reviewed: true;
  secondaryRole: 'none' | 'solar_inverter' | 'hybrid_inverter' | 'load';
  sources: Partial<Record<CoordinationSlot, CoordinationBinding>>;
}
const object = (value: any) => !!value && typeof value === 'object' && !Array.isArray(value);
const identifier = (value: any) => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(value);
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const unit = (value: any) => (typeof value === 'string' ? value : value?.en);
const driver = (device: any) => (typeof device?.driverId === 'string' ? device.driverId : '');
/** A display exception is not an automation contract; vendor names never grant admission. */
export function coordinationSourceKind(row: { driverId: string; capabilityId: string }): 'candidate_preview' | 'metadata_only' {
  return row.driverId.split(':').pop() === 'smartmeter_dual_ct_preview' || row.capabilityId.startsWith('dual_ct_preview_')
    ? 'candidate_preview' : 'metadata_only';
}
export function normalizeCoordinationBindings(value: any): CoordinationBindings | null {
  if (!object(value) || value.schemaVersion !== 1 || value.reviewed !== true || !identifier(value.siteKey)
    || !['none', 'solar_inverter', 'hybrid_inverter', 'load'].includes(value.secondaryRole) || !object(value.sources)) return null;
  const sources: Partial<Record<CoordinationSlot, CoordinationBinding>> = {};
  for (const slot of COORDINATION_SLOTS) {
    const row = value.sources[slot];
    if (slot === 'secondary' && value.secondaryRole === 'none') {
      if (row !== undefined && row !== null) return null;
      continue;
    }
    if (!object(row) || ![row.deviceId, row.driverId, row.capabilityId].every(identifier)
      || !(slot === 'externalSoc' ? row.unit === '%' : ['W', 'kW'].includes(row.unit))) return null;
    let signs = ['charging', 'discharging'];
    if (slot === 'grid') signs = ['import', 'export'];
    if (slot === 'secondary') signs = ['to_house', 'from_house'];
    if (slot === 'externalSoc') signs = ['soc'];
    if (!signs.includes(row.positiveMeans)) return null;
    sources[slot] = {
      deviceId: row.deviceId,
      driverId: row.driverId,
      capabilityId: row.capabilityId,
      unit: row.unit,
      positiveMeans: row.positiveMeans,
    };
  }
  const rows = Object.values(sources) as CoordinationBinding[];
  if (new Set(rows.map((row) => `${row.deviceId}/${row.capabilityId}`)).size !== rows.length) return null;
  if (sources.externalSoc!.deviceId !== sources.externalPower!.deviceId
    || sources.externalSoc!.driverId !== sources.externalPower!.driverId
    || sources.streamPower!.deviceId === sources.externalPower!.deviceId) return null;
  return {
    schemaVersion: 1, siteKey: value.siteKey, reviewed: true, secondaryRole: value.secondaryRole, sources,
  };
}

/** Local picker metadata only. Do not return settings, values, timestamps, device data or tokens. */
export function coordinationCatalog(devices: any): { sources: any[]; truncated: boolean } {
  if (!object(devices)) return { sources: [], truncated: false };
  const entries = Object.entries(devices);
  const sources: any[] = [];
  for (const [id, device] of entries.slice(0, 256) as [string, any][]) {
    if (!identifier(id) || device?.id !== id || !identifier(driver(device)) || device.available !== true || !object(device.capabilitiesObj)) continue;
    for (const [capabilityId, cap] of Object.entries(device.capabilitiesObj).slice(0, 128) as [string, any][]) {
      if (!identifier(capabilityId) || cap?.type !== 'number' || cap.getable !== true || !['W', 'kW', '%'].includes(unit(cap.units))) continue;
      sources.push({
        deviceId: id,
        driverId: driver(device),
        capabilityId,
        unit: unit(cap.units),
        sourceKind: coordinationSourceKind({ driverId: driver(device), capabilityId }),
        name: typeof device.name === 'string' ? device.name.slice(0, 80) : '',
        title: typeof cap.title === 'string' ? cap.title.slice(0, 80) : capabilityId,
      });
      if (sources.length >= 512) return { sources, truncated: true };
    }
  }
  return { sources, truncated: entries.length > 256 };
}

export function boundCoordinationView(rawBindings: any, devices: Map<string, any>, now: number, session: string,
  acknowledgements: any, previous?: any, mode: 'homey' | 'manual' = 'homey', manual?: any, policy?: any): Record<string, any> {
  const denied = (reason: string) => ({
    reason,
    state: 'blocked',
    advisoryOnly: true,
    controlsEnabled: false,
    contributesToEnergy: false,
    commandWrites: 0,
    readings: [],
    decision: null,
    expiresAt: now,
  });
  const bindings = normalizeCoordinationBindings(rawBindings);
  if (!bindings || !Number.isFinite(now) || now <= 0 || !identifier(session)) return denied('bindings_invalid');
  const projected: Record<string, { value: number; at: number }> = {};
  const rows: any[] = [];
  let failure: string | null = null;
  for (const slot of COORDINATION_SLOTS) {
    const binding = bindings.sources[slot]; if (!binding) continue;
    const device = devices.get(binding.deviceId);
    const cap = device?.capabilitiesObj?.[binding.capabilityId];
    let reason = 'recent';
    let value: number | null = null; let at: number | null = null;
    if (!device || device.id !== binding.deviceId || device.available !== true) reason = 'device_unavailable';
    else if (driver(device) !== binding.driverId || !cap || cap.type !== 'number' || cap.getable !== true
      || unit(cap.units) !== binding.unit) reason = 'capability_contract_changed';
    else {
      const raw = mode === 'manual' ? manual?.[slot]?.value : cap.value;
      const timestamp = mode === 'manual' ? manual?.[slot]?.at : cap.lastUpdated;
      at = timestamp;
      if (timestamp instanceof Date) at = timestamp.getTime();
      else if (typeof timestamp === 'string') at = Date.parse(timestamp);
      if (typeof raw !== 'number' || !Number.isFinite(raw)) reason = 'reading_unknown';
      else if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0 || at > now) reason = 'timestamp_unknown';
      else if (now - at >= 60000) reason = 'reading_stale';
      else {
        value = raw * (binding.unit === 'kW' ? 1000 : 1);
        if (slot === 'externalSoc' ? value < 0 || value > 100 : Math.abs(value) > 100000) {
          reason = 'reading_invalid'; value = null;
        } else {
          if (['externalPower', 'streamPower'].includes(slot) && binding.positiveMeans === 'discharging') value *= -1;
          if (slot === 'grid' && binding.positiveMeans === 'export') value *= -1;
          if (slot === 'secondary' && binding.positiveMeans === 'from_house') value *= -1;
          projected[slot] = { value, at };
        }
      }
    }
    if (reason !== 'recent') {
      failure ||= reason; value = null;
    }
    rows.push({
      slot,
      value,
      unit: slot === 'externalSoc' ? '%' : 'W',
      status: reason,
      sourceKind: coordinationSourceKind(binding),
      expectedUnit: binding.unit,
      observedUnit: ['W', 'kW', '%'].includes(unit(cap?.units)) ? unit(cap.units) : null,
      ageSec: typeof at === 'number' && Number.isFinite(at) && at <= now && at > 0 ? (now - at) / 1000 : null,
      at: reason === 'recent' ? at : null,
    });
  }
  // Last-updated metadata is not a sensor heartbeat. Never substitute request time.
  const common = {
    readings: rows,
    capturedAt: now,
    mode,
    measurementFreshnessVerified: false,
    timingBasis: mode === 'manual' ? 'manual_observation' : 'capability_last_updated',
    expiresAt: Math.min(...rows.filter((row) => row.status === 'recent').map((row) => row.at + 60000), now + 60000),
    bindingFingerprint: hash(bindings),
  };
  if (failure) return { ...denied(failure), ...common };
  const identity = (slot: CoordinationSlot) => ({
    siteKey: hash(bindings.siteKey),
    sessionKey: hash([session, mode]),
    sourceKey: hash([bindings, slot]),
  });
  const grid = {
    ...identity('grid'),
    role: 'grid',
    scope: 'whole_installation',
    positiveMeans: 'import',
    powerW: projected.grid,
  };
  const circuits: any = { grid };
  if (bindings.secondaryRole !== 'none') {
    circuits.secondary = {
      ...identity('secondary'),
      role: bindings.secondaryRole,
      scope: 'branch',
      positiveMeans: 'to_house',
      powerW: projected.secondary,
    };
  }
  const decision = streamCoordinationPreview({
    schemaVersion: 2,
    now,
    manualOverride: acknowledgements?.noManualOverride === true ? false : undefined,
    controllerConflict: acknowledgements?.noCompetingController === true ? false : undefined,
    otherSourcesReviewed: acknowledgements?.otherSourcesReviewed === true,
    circuits,
    externalBattery: { ...identity('externalPower'), soc: projected.externalSoc, powerW: projected.externalPower },
    streamBattery: { ...identity('streamPower'), powerW: projected.streamPower },
  }, previous ?? undefined, policy);
  return { ...decision, ...common, decision };
}
