/** Owned-source and Homey inventory readback for the separate, gated CT1 Energy driver. */
import { DualCtCommunityTrial } from './dualCtCommunityTrial';
import { DualCtGridIdentity, resolveDualCtGridEnergyContract } from './dualCtGridEnergySource';
import { appAuthCredentialsRevision } from './appAuthPairing';
import { AppDevice } from './appDevices';
import { EcoFlowAppAuthClient } from './EcoFlowAppAuthClient';
import { createHomeyCoordinationReader } from './coordinationWorkspace';
import { dualCtAccountBinding, dualCtPreviewDevices } from './dualCtPreviewPairing';
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
    if (!settings || typeof settings !== 'object' || !flag(settings.energy_exclude)
      || !flag(settings.energy_cumulative_include)) return { complete: false, contributors: [] };
    contributors.push({
      id: d.id,
      grid: DUAL_CT_PROPERTY_GRID,
      contributes: settings.energy_exclude !== true && settings.energy_cumulative_include !== false,
    });
    if (contributors.length > 256) return { complete: false, contributors: [] };
  }
  return { complete: true, contributors };
}

interface Options {
  homey: any;
  sn: string;
  client: () => EcoFlowAppAuthClient | null;
  ownDevice?: { sn: string; driverId: string };
  communityThreePhase?: boolean;
  /** Code-owned supported readback, NEVER a customer setting, native screenshot or cached report. */
  readFirmware?: (client: EcoFlowAppAuthClient, device: AppDevice) => Promise<string | null>;
  reader?: typeof createHomeyCoordinationReader;
  now?: () => number;
  readTimeoutMs?: number;
}

export class DualCtHomeyEnergyContext {
  private source: { account: string; device: string; grid: string; owned: boolean;
    identity: { productType: number; firmware: string }; identityObservedAt: number } | null = null;

  private inventory: { account: string; observedAt: number; complete: boolean; contributors: DualCtEnergyContributor[] } | null = null;
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
    let reader: Awaited<ReturnType<typeof createHomeyCoordinationReader>> | null = null;
    const opening = Promise.resolve().then(() => (this.options.reader || createHomeyCoordinationReader)(this.options.homey, this.controller.signal));
    // A reader that opens after cancellation must never retain a token or connection.
    opening.then((opened) => {
      if (this.controller.signal.aborted) opened.close();
    }).catch(() => {});
    try {
      reader = await Promise.race([opening, aborted]);
      const raw = await Promise.race([reader.list(), aborted]);
      const result = dualCtHomeyContributors(raw, this.options.ownDevice);
      if (generation !== this.generation || this.source?.account !== account) throw new Error('source_changed');
      this.inventory = { account, observedAt: this.now(), ...result };
      return { ...this.inventory, contributors: result.contributors.map((row) => ({ ...row })) };
    } finally {
      cancelTimer(timer);
      this.controller.signal.removeEventListener('abort', rejectAbort);
      reader?.close();
    }
  }

  async refresh() {
    try {
      await this.readSelection(); await this.readInventory();
    } catch {
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
