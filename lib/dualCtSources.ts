import { AppDevice } from './appDevices';
import { EcoFlowDevice } from './types';
import { knownDeveloperApiRole } from './deviceIdentity';
import { isSupportedStream5000Sn } from './stream5000Models';
import { dualCtModelCodes } from './dualCtMetadata';

export function dualCtResearchDevices<T extends AppDevice>(devices: T[]): T[] {
  const seen = new Set<string>();
  return devices.slice(0, 256).filter((device) => {
    const name = typeof device?.productName === 'string'
      ? device.productName.trim().replace(/[-_\s]+/g, ' ').toUpperCase() : '';
    if (!/^(?:ECOFLOW )?SMART METER DUAL CT$/.test(name) || device.shared
      || !/^[A-Z0-9]{8,64}$/.test(device.sn) || seen.has(device.sn)) return false;
    seen.add(device.sn);
    return true;
  }).slice(0, 2);
}

export interface DualCtResearchDevice extends AppDevice {
  appListed: boolean;
  developerListed: boolean;
}

/** Anonymous inventory evidence, never an alternative authorisation rule. */
export function dualCtInventorySummary(app: AppDevice[], developer: EcoFlowDevice[], available: boolean[]) {
  return [app, developer].map((rows, index) => {
    const bounded = rows.slice(0, 256);
    return {
      source: index === 0 ? 'app' : 'developer',
      available: available[index] === true,
      inspected: bounded.length,
      truncated: rows.length > 256,
      missingProductMetadata: bounded.filter((row) => !row?.productName?.trim()).length,
      explicitMatches: dualCtResearchDevices(bounded.map((row) => ({
        ...row, productName: row.productName || '', name: '', shared: 'shared' in row && row.shared === true,
      }))).length,
      displayNameHints: index === 0 ? (bounded as AppDevice[]).filter((row) => /dual[\s_-]*ct/i.test(row?.name || '')).length : 0,
      // Anonymous meter-like candidates only; a hint is never subscription authority.
      candidates: bounded.filter((row) => /meter|dual[\s_-]*ct/i.test(row?.productName || '')
        || (index === 0 && /meter|dual[\s_-]*ct/i.test((row as AppDevice).name || ''))).slice(0, 8)
        .map((row) => ({
          shared: 'shared' in row && row.shared === true,
          metadataPresent: typeof row.productName === 'string' && row.productName.trim().length > 0,
          codes: dualCtModelCodes('modelCodes' in row ? row.modelCodes : row),
        })),
    };
  });
}

export function dualCtInventorySnapshot(input: any): Array<Record<string, unknown>> {
  const count = (n: any) => (Number.isInteger(n) && n >= 0 && n <= 256 ? n : 0);
  return Array.isArray(input) ? input.slice(0, 2).filter((row) => ['app', 'developer'].includes(row?.source))
    .map((row) => ({
      source: row.source,
      available: row.available === true,
      inspected: count(row.inspected),
      truncated: row.truncated === true,
      missingProductMetadata: count(row.missingProductMetadata),
      explicitMatches: Math.min(2, count(row.explicitMatches)),
      displayNameHints: count(row.displayNameHints),
      candidates: Array.isArray(row.candidates) ? row.candidates.slice(0, 8).map((candidate: any) => ({
        shared: candidate?.shared === true,
        metadataPresent: candidate?.metadataPresent === true,
        codes: dualCtModelCodes(candidate?.codes),
      })) : [],
    })) : [];
}

/** Explicit model metadata plus independently authorised transport inventory. */
export function mergeDualCtInventory(app: AppDevice[], developer: EcoFlowDevice[]): DualCtResearchDevice[] {
  const developerRows = developer.slice(0, 256).filter((row) => typeof row?.sn === 'string'
    && /^[A-Z0-9]{8,64}$/.test(row.sn));
  const ownedApp = app.slice(0, 256).filter((row) => row && !row.shared);
  const developerCandidates = developerRows.map((row) => ({
    sn: row.sn, productName: row.productName || '', name: '', online: row.online, shared: false,
  }));
  return dualCtResearchDevices([...dualCtResearchDevices(ownedApp), ...dualCtResearchDevices(developerCandidates)]).map((row) => ({
    ...row,
    appListed: ownedApp.some((candidate) => candidate.sn === row.sn),
    developerListed: developerRows.some((candidate) => candidate.sn === row.sn),
  }));
}

/** A resolved host is not a membership contract; admit only known hosts in the same inventory. */
export function dualCtOwnedHost(sn: unknown, meterSn: string, devices: EcoFlowDevice[]): sn is string {
  return typeof sn === 'string' && /^[A-Z0-9]{8,64}$/.test(sn) && sn !== meterSn
    && devices.slice(0, 256).some((row) => row?.sn === sn)
    && (knownDeveloperApiRole(sn) === 'stream_unit' || isSupportedStream5000Sn(sn));
}

interface DeveloperProbeClient {
  getQuotaAll: (sn: string, options: { fresh: boolean }) => Promise<Record<string, any>>;
  getMainSn: (sn: string, options: { fresh: boolean }) => Promise<string>;
}

export async function probeDualCtDeveloper(client: DeveloperProbeClient, sn: string,
  inventory: EcoFlowDevice[], active: () => boolean): Promise<Array<{ source: string; status: string; data?: unknown }>> {
  const result: Array<{ source: string; status: string; data?: unknown }> = [];
  if (!active() || !inventory.slice(0, 256).some((row) => row.sn === sn)) return result;
  try {
    const data = await client.getQuotaAll(sn, { fresh: true });
    if (!active()) return result;
    result.push({ source: 'developer_rest', status: Object.keys(data).length ? 'observed' : 'empty', data });
  } catch {
    if (active()) result.push({ source: 'developer_rest', status: 'unavailable' });
  }
  if (!active()) return result;
  try {
    const host = await client.getMainSn(sn, { fresh: true });
    if (!active()) return result;
    if (!dualCtOwnedHost(host, sn, inventory)) {
      result.push({ source: 'linked_host_rest', status: 'host_not_verified' }); return result;
    }
    const data = await client.getQuotaAll(host, { fresh: true });
    if (!active()) return result;
    result.push({ source: 'linked_host_rest', status: Object.keys(data).length ? 'observed' : 'empty', data });
  } catch {
    if (active()) result.push({ source: 'linked_host_rest', status: 'unavailable' });
  }
  return result;
}

const JSON_KEYS = new Set(['params', 'data', 'result', 'quota', 'ct1', 'ct2', 'CT1', 'CT2', 'channels',
  'channel1', 'channel2', 'power', 'totalPower', 'voltage', 'current', 'energy', 'powerFactor', 'frequency',
  'importEnergy', 'exportEnergy', 'phaseA', 'phaseB', 'phaseC', 'localMeter', 'powGetSysLoad', 'powGetSysGrid',
  'gridPower', 'activePower', 'meterPower', 'meterVoltage', 'meterCurrent', 'gridConnectionPower']);
function safePath(path: string): boolean {
  return path.split('.').every((key) => JSON_KEYS.has(key) || /^\[[0-3]\]$/.test(key));
}

/** Allowlisted structural paths only; values and arbitrary keys are never retained. */
export function dualCtJsonShape(input: unknown): { fields: Array<{ path: string; type: string }>; empty: boolean } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid object');
  const out: Array<{ path: string; type: string }> = [];
  let visited = 0;
  const walk = (value: any, path: string, depth: number) => {
    if (depth > 4 || out.length >= 32 || visited++ >= 128) return;
    let type = typeof value as string;
    if (value === null) type = 'null';
    else if (Array.isArray(value)) type = 'array';
    if (path && safePath(path) && ['null', 'array', 'object', 'number', 'string', 'boolean'].includes(type)) {
      out.push({ path, type });
    }
    if (Array.isArray(value)) value.slice(0, 4).forEach((entry, index) => walk(entry, `${path}.[${index}]`, depth + 1));
    else if (value && typeof value === 'object') {
      for (const key of Object.keys(value).slice(0, 64)) {
        const next = path ? `${path}.${key}` : key;
        if (safePath(next)) walk(value[key], next, depth + 1);
      }
    }
  };
  walk(input, '', 0);
  return { fields: out, empty: Object.keys(input).length === 0 };
}

/** Re-project internal report results without trusting returned keys or values. */
export function dualCtJsonShapesSnapshot(input: any): Array<Record<string, unknown>> {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 16).filter((shape) => [0, 1].includes(shape?.deviceIndex)
    && ['app_json', 'developer_mqtt', 'developer_rest', 'linked_host_rest'].includes(shape?.source))
    .map((shape) => ({
      deviceIndex: shape.deviceIndex,
      source: shape.source,
      empty: shape.empty === true,
      fields: Array.isArray(shape.fields) ? shape.fields.slice(0, 32).filter((field: any) => typeof field?.path === 'string'
        && field.path.length <= 150 && safePath(field.path)
        && ['null', 'array', 'object', 'number', 'string', 'boolean'].includes(field.type))
        .map((field: any) => ({ path: field.path, type: field.type })) : [],
    }));
}
