/** Owned-source and Homey inventory readback for the separate, gated CT1 Energy driver. */
import { createHash } from 'crypto';
import { DualCtCommunityTrial } from './dualCtCommunityTrial';
import { DualCtGridIdentity, resolveDualCtGridEnergyContract } from './dualCtGridEnergySource';
import { appAuthCredentialsRevision } from './appAuthPairing';
import { AppDevice } from './appDevices';
import { EcoFlowAppAuthClient } from './EcoFlowAppAuthClient';
import type { CoordinationReader } from './coordinationWorkspace';
import { dualCtAccountBinding, dualCtPreviewDevices } from './dualCtPreviewPairing';
import { safeOwnedDriver, dualCtContextFailureSnapshot } from './dualCtRecoveryDiagnostics';
import { DualCtEnergyContributor } from './dualCtEnergyAdoption';

export const DUAL_CT_PROPERTY_GRID = 'homey_property_grid';
const validId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);
const flag = (value: unknown) => value === undefined || typeof value === 'boolean';

/** Gas/water are separate fuels; downstream and excluded electricity meters do not own the property boundary. */
export function dualCtHomeyContributors(input: unknown, ownDevice?: { sn: string; driverId: string }) {
  const contributors: DualCtEnergyContributor[] = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { complete: false, contributors };
  const rows = Object.entries(input);
  if (rows.length > 2048) return { complete: false, contributors };
  const seen = new Set<string>();
  let ownMatches = 0;
  for (const [key, value] of rows) {
    const d = value as any;
    if (!d || !validId(d.id) || key !== d.id || seen.has(d.id) || !Array.isArray(d.capabilities)
      || d.capabilities.some((id: unknown) => typeof id !== 'string')) return { complete: false, contributors: [] };
    seen.add(d.id);
    if (ownDevice && d.driverId === ownDevice.driverId && d.data?.sn === ownDevice.sn) {
      if (++ownMatches > 1) return { complete: false, contributors: [] };
      continue;
    }
    const electric = d.capabilities.some((id: unknown) => typeof id === 'string' && /^(?:measure_power|meter_power)(?:\.|$)/.test(id));
    if (!electric) continue;
    if (!d.energyObj || typeof d.energyObj !== 'object' || Array.isArray(d.energyObj)
      || ![true, false, null].includes(d.energyObj.cumulative)) return { complete: false, contributors: [] };
    if (d.energyObj.cumulative !== true) continue;
    const { settings } = d;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings) || !flag(settings.energy_exclude)
      || !flag(settings.energy_cumulative_include)) return { complete: false, contributors: [] };
    let contributes = settings.energy_exclude !== true && settings.energy_cumulative_include !== false;
    if (d.energyRoleVisibility === 'sdk_owned' && contributes
      && !(settings.energy_exclude === false && settings.energy_cumulative_include === true)) {
      // The app SDK omits Homey-managed Energy flags. Absence is neither an
      // included nor an excluded meter; require an explicit owner role review.
      if (!['included', 'not_included'].includes(settings.property_meter_role)) {
        return { complete: false, contributors: [], roleReviewRequired: true };
      }
      contributes = settings.property_meter_role === 'included';
    }
    contributors.push({
      id: d.id,
      grid: DUAL_CT_PROPERTY_GRID,
      contributes,
      ...(typeof d.name === 'string' ? { name: d.name } : {}),
    });
    if (contributors.length > 256) return { complete: false, contributors: [] };
  }
  return { complete: true, contributors };
}

/** SDK-owned devices only. External meters require the separate pairing acknowledgement. */
type OwnedInventoryStage = 'manifest' | 'driver' | 'devices' | 'identity' | 'energy' | 'capabilities' | 'settings';
class OwnedInventoryReadError extends Error {
  constructor(readonly stage: OwnedInventoryStage, readonly driver: string | null) {
    super('owned_inventory_unknown');
  }
}
function readOwnAppEnergyDevicesNow(homey: any): Record<string, any> {
  let stage: OwnedInventoryStage = 'manifest'; let driver: string | null = null;
  try {
    const manifest = homey?.manifest || homey?.app?.manifest;
    if (manifest?.id !== 'uk.co.zarb.ecoflow' || !Array.isArray(manifest.drivers)
    || manifest.drivers.length === 0 || manifest.drivers.length > 64) throw new Error('owned_inventory_unknown');
    const rows: Record<string, any> = {};
    const drivers = new Set<string>();
    for (const entry of manifest.drivers) {
      stage = 'manifest'; driver = null;
      if (!validId(entry?.id) || drivers.has(entry.id)) throw new Error('owned_inventory_unknown');
      drivers.add(entry.id);
      driver = entry.id; stage = 'driver';
      const instance = homey.drivers.getDriver(entry.id);
      stage = 'devices'; const devices = instance.getDevices();
      if (!Array.isArray(devices) || devices.length > 2048) throw new Error('owned_inventory_unknown');
      for (const device of devices) {
        stage = 'identity'; const data = device.getData();
        if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length > 64
        || Object.values(data).some((v) => v !== null && !['string', 'number', 'boolean'].includes(typeof v))
        || Object.values(data).some((v) => typeof v === 'number' && !Number.isFinite(v))) throw new Error('owned_inventory_unknown');
        const driverId = `homey:app:${manifest.id}:${entry.id}`;
        const id = createHash('sha256').update(driverId).update('\0')
          .update(JSON.stringify(Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b)))))
          .digest('hex');
        if (rows[id] || Object.keys(rows).length >= 2048) throw new Error('owned_inventory_unknown');
        stage = 'energy'; const declared = device.getEnergy();
        if (declared !== undefined && declared !== null && (typeof declared !== 'object' || Array.isArray(declared))) throw new Error('owned_inventory_unknown');
        const cumulative = declared?.cumulative === undefined ? entry.energy?.cumulative : declared.cumulative;
        let name: string | undefined;
        try {
          if (typeof device.getName?.() === 'string') name = device.getName();
        } catch { /* Labels cannot change admission. */ }
        stage = 'capabilities'; const capabilities = device.getCapabilities();
        stage = 'settings'; const settings = device.getSettings();
        rows[id] = {
          id,
          driverId,
          data,
          capabilities,
          energyObj: { cumulative: cumulative === undefined ? false : cumulative },
          energyRoleVisibility: 'sdk_owned',
          settings,
          ...(name ? { name } : {}),
        };
      }
    }
    return rows;
  } catch {
    throw new OwnedInventoryReadError(stage, driver);
  }
}

export async function readOwnAppEnergyDevices(homey: any): Promise<Record<string, any>> {
  return readOwnAppEnergyDevicesNow(homey);
}

/** Synchronous SDK metadata getters only; no vendor/API requests or writes. Never returns identities or exceptions. */
export function dualCtOwnedInventoryDiagnostics(homey: any) {
  const common = { scope: 'app_owned', externalInventoryVerified: false, readOnly: true };
  try {
    const rows = readOwnAppEnergyDevicesNow(homey);
    const result = dualCtHomeyContributors(rows);
    return {
      ...common,
      status: result.complete ? 'complete' : 'incomplete',
      complete: result.complete,
      roleReviewRequired: result.roleReviewRequired === true,
      stage: result.complete ? null : 'classification',
      driver: null,
      pairedDevices: Object.keys(rows).length,
      propertyMeters: result.complete ? result.contributors.length : null,
      includedMeters: result.complete ? result.contributors.filter((row) => row.contributes).length : null,
      meterSettings: Object.values(rows).filter((row) => row.energyObj?.cumulative === true).slice(0, 256).map((row) => {
        const state = (value: unknown) => {
          if (value === true) return 'true';
          if (value === false) return 'false';
          return value === undefined ? 'unset' : 'invalid';
        };
        return {
          driver: safeOwnedDriver(row.driverId.split(':').at(-1)),
          exclude: state(row.settings?.energy_exclude),
          include: state(row.settings?.energy_cumulative_include),
          reviewedRole: ['included', 'not_included', 'unreviewed'].includes(row.settings?.property_meter_role)
            ? row.settings.property_meter_role : 'unreviewed',
        };
      }),
    };
  } catch (error) {
    return {
      ...common,
      status: 'read_failed',
      complete: false,
      stage: error instanceof OwnedInventoryReadError ? error.stage : 'unknown',
      driver: error instanceof OwnedInventoryReadError ? safeOwnedDriver(error.driver) : null,
      pairedDevices: null,
      propertyMeters: null,
      includedMeters: null,
      meterSettings: [],
    };
  }
}

export async function createOwnAppEnergyReader(homey: any, signal?: AbortSignal): Promise<CoordinationReader> {
  let closed = false;
  const list = async () => {
    if (closed || signal?.aborted) throw new Error('owned_inventory_closed');
    return readOwnAppEnergyDevices(homey);
  };
  return {
    list,
    read: async (id: string) => (await list())[id] || null,
    close: () => {
      closed = true;
    },
  };
}

interface Options {
  homey: any;
  sn: string;
  client: () => EcoFlowAppAuthClient | null;
  ownDevice?: { sn: string; driverId: string };
  communityThreePhase?: boolean;
  /** Code-owned supported readback, NEVER a customer setting, native screenshot or cached report. */
  readFirmware?: (client: EcoFlowAppAuthClient, device: AppDevice) => Promise<string | null>;
  reader?: typeof createOwnAppEnergyReader;
  now?: () => number;
  readTimeoutMs?: number;
}

export class DualCtHomeyEnergyContext {
  private lastFailure: ReturnType<typeof dualCtContextFailureSnapshot> = null;

  diagnostics() {
    return dualCtContextFailureSnapshot(this.lastFailure);
  }

  private source: { account: string; device: string; grid: string; owned: boolean;
    identity: { productType: number; firmware: string }; identityObservedAt: number } | null = null;

  private inventory: { account: string; observedAt: number; complete: boolean; roleReviewRequired?: boolean;
    scope: 'app_owned'; externalInventoryVerified: false; contributors: DualCtEnergyContributor[] } | null = null;

  private readonly trial: DualCtCommunityTrial;
  private generation = 0;
  private closed = false;
  private lastSnapshotAt: number | null = null;
  private readonly controller = new AbortController();
  private readonly options: Options;

  constructor(options: Options) {
    this.options = { ...options };
    this.trial = new DualCtCommunityTrial(options.now || Date.now);
  }

  private now() {
    return (this.options.now || Date.now)();
  }

  async readSelection() {
    if (this.closed) throw new Error('source_closed');
    const { generation } = this;
    const client = this.options.client();
    if (!client) throw new Error('account_required');
    const account = dualCtAccountBinding(await client.getSession());
    const owned = dualCtPreviewDevices(await client.getDeviceList()).find((d) => d.sn === this.options.sn);
    if (!owned) throw new Error('owned_source_required');
    // Read current-package metadata, never a prospective OTA version. Its receipt
    // age qualifies this API lookup only; it is not a hardware measurement time.
    const firmware = this.options.readFirmware ? await this.options.readFirmware(client, owned)
      : (await client.getDualCtCurrentFirmware(owned.sn))?.version ?? null;
    if (typeof firmware !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(firmware)) {
      this.source = null; throw new Error('firmware_readback_unavailable');
    }
    const currentAccount = dualCtAccountBinding(await client.getSession());
    if (this.closed || generation !== this.generation || currentAccount !== account) throw new Error('source_changed');
    const source = {
      account,
      device: owned.sn,
      grid: DUAL_CT_PROPERTY_GRID,
      owned: true,
      identity: { productType: 421, firmware },
      identityObservedAt: this.now(),
    };
    this.source = source;
    if (this.options.communityThreePhase === true) this.trial.refresh(source);
    return { ...source, identity: { ...source.identity } };
  }

  isCommunityTrial() {
    return this.options.communityThreePhase === true;
  }

  resolveContract(identity: DualCtGridIdentity) {
    if (this.closed) return null;
    return this.options.communityThreePhase === true ? this.trial.resolve(identity) : resolveDualCtGridEnergyContract(identity);
  }

  async readInventory() {
    if (this.closed) throw new Error('source_closed');
    const { generation } = this;
    const account = this.source?.account;
    if (!account) throw new Error('source_required');
    const timeout = Math.min(15000, Math.max(1, this.options.readTimeoutMs || 15000));
    const schedule = this.options.homey.setTimeout?.bind(this.options.homey) || setTimeout;
    const cancelTimer = this.options.homey.clearTimeout?.bind(this.options.homey) || clearTimeout;
    const timer = schedule(() => this.controller.abort(), timeout);
    let rejectAbort: () => void = () => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAbort = () => reject(new Error('inventory_read_cancelled'));
      this.controller.signal.addEventListener('abort', rejectAbort, { once: true });
      if (this.controller.signal.aborted) rejectAbort();
    });
    let reader: Awaited<ReturnType<typeof createOwnAppEnergyReader>> | null = null;
    const opening = Promise.resolve().then(() => (this.options.reader || createOwnAppEnergyReader)(this.options.homey, this.controller.signal));
    // A reader that opens after cancellation must never retain a token or connection.
    opening.then((opened) => {
      if (this.controller.signal.aborted) opened.close();
    }).catch(() => {});
    try {
      reader = await Promise.race([opening, aborted]);
      const raw = await Promise.race([reader.list(), aborted]);
      const result = dualCtHomeyContributors(raw, this.options.ownDevice);
      if (generation !== this.generation || this.source?.account !== account) throw new Error('source_changed');
      this.inventory = {
        account, observedAt: this.now(), ...result, scope: 'app_owned', externalInventoryVerified: false,
      };
      return { ...this.inventory, contributors: result.contributors.map((row) => ({ ...row })) };
    } finally {
      cancelTimer(timer);
      this.controller.signal.removeEventListener('abort', rejectAbort);
      reader?.close();
    }
  }

  async refresh() {
    let stage = 'selection';
    try {
      await this.readSelection(); stage = 'inventory';
      const inventory = await this.readInventory();
      this.lastFailure = inventory.complete ? null : dualCtContextFailureSnapshot({
        stage,
        reason: inventory.roleReviewRequired ? 'energy_role_review_required' : 'inventory_incomplete',
        inventoryStage: 'classification',
      });
    } catch (error: any) {
      let reason = 'read_failed';
      try {
        const message = error?.message;
        if (['account_required', 'owned_source_required', 'firmware_readback_unavailable', 'source_changed', 'source_closed', 'inventory_read_cancelled'].includes(message)) reason = message;
      } catch { /* Even exception getters are untrusted. */ }
      this.lastFailure = dualCtContextFailureSnapshot({
        stage,
        reason: error instanceof OwnedInventoryReadError ? 'owned_inventory_read_failed' : reason,
        inventoryStage: error instanceof OwnedInventoryReadError ? error.stage : null,
        driver: error instanceof OwnedInventoryReadError ? error.driver : null,
      });
      this.trial.cancel(); this.source = null; this.inventory = null; throw new Error('energy_source_unavailable');
    }
  }

  snapshot() {
    const now = this.now();
    if (this.closed || !Number.isFinite(now) || (this.lastSnapshotAt !== null && now < this.lastSnapshotAt)) {
      this.close(); return null;
    }
    this.lastSnapshotAt = now;
    const fresh = (at: number) => Number.isFinite(at) && at > 0 && Number.isFinite(now) && now >= at && now - at < 90000;
    if (!this.source || !this.inventory || !fresh(this.source.identityObservedAt) || !fresh(this.inventory.observedAt)
      || this.source.account !== this.inventory.account) return null;
    return {
      source: { ...this.source, identity: { ...this.source.identity } },
      inventory: { ...this.inventory, contributors: this.inventory.contributors.map((row) => ({ ...row })) },
    };
  }

  close() {
    this.trial.cancel(); this.closed = true; this.generation++; this.controller.abort(); this.source = null; this.inventory = null;
  }
}

/** Detect sign-in edits without retaining or reporting credentials. */
export const dualCtCredentialsRevision = appAuthCredentialsRevision;
