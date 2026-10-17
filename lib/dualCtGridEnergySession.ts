/** Preparation session with real storage ordering, but NO runtime Homey capability/Energy writes. */
import {
  adaptDualCtGridEnergyPacket, dualCtGridBinding, dualCtGridContractValid, dualCtGridScopeValid,
  resolveDualCtGridEnergyContract, DualCtGridContractResolver, DualCtGridEnergyContract,
  DualCtGridEnergyObservation, DualCtGridIdentity, DualCtGridScope,
} from './dualCtGridEnergySource';
import {
  DualCtEnergyAdoptionRequest, DualCtEnergyAuthority, planDualCtEnergyAdoption, DUAL_CT_ENERGY_PROPOSAL,
} from './dualCtEnergyAdoption';
import {
  DualCtEnergyCheckpoint, DualCtEnergyStorage, makeDualCtEnergyCheckpoint, readDualCtEnergyCheckpoint,
} from './dualCtEnergyCheckpoint';
import { dualCtFreshAge } from './dualCtContract';
import { dualCtPowerIntervalWh } from './dualCtPowerInterval';

interface Options {
  scope: DualCtGridScope;
  identity: DualCtGridIdentity;
  readIdentity: () => DualCtGridIdentity;
  storage: DualCtEnergyStorage;
  authority: DualCtEnergyAuthority;
  /** Fresh app-inventory/consent readback, not historical report flags. Binding/contract are recomputed. */
  review: () => DualCtEnergyAdoptionRequest;
  /** Code-owned dependency injection for tests/future validated contracts, never a customer setting. */
  resolveContract?: DualCtGridContractResolver;
  now?: () => number;
}

export class DualCtGridEnergySession {
  private readonly options: Options;
  private readonly owner = Symbol('dual-ct-preparation');
  private chain: Promise<void> = Promise.resolve();
  private generation = 0;
  private enabled = false;
  private contract: DualCtGridEnergyContract | null = null;
  private binding: string | null = null;
  private checkpoint: DualCtEnergyCheckpoint | null = null;
  private baseline: DualCtGridEnergyObservation | null = null;
  private lastNow: number | null = null;
  private status = 'not_started';
  private pendingPackets = 0;

  constructor(options: Options) {
    this.options = { ...options, scope: { ...options.scope }, identity: { ...options.identity } };
  }

  private enqueue(work: () => Promise<void>): Promise<void> {
    const pending = this.chain.catch(() => {}).then(work);
    this.chain = pending;
    return pending;
  }

  private now(): number {
    return (this.options.now || Date.now)();
  }

  private qualify(): { contract: DualCtGridEnergyContract; binding: string } | null {
    try {
      if (!dualCtGridScopeValid(this.options.scope)) {
        this.status = 'invalid_scope'; return null;
      }
      const identity = this.options.readIdentity();
      if (identity?.productType !== this.options.identity.productType || identity?.firmware !== this.options.identity.firmware) {
        this.status = 'model_firmware_changed'; return null;
      }
      const contract = (this.options.resolveContract || resolveDualCtGridEnergyContract)(this.options.identity);
      if (!dualCtGridContractValid(contract, this.options.identity)) {
        this.status = 'contract_blocked'; return null;
      }
      const binding = dualCtGridBinding(this.options.scope, contract)!;
      const review = this.options.review();
      if (review?.binding !== binding || review?.grid !== this.options.scope.grid) {
        this.status = 'source_selection_mismatch'; return null;
      }
      const plan = planDualCtEnergyAdoption({
        ...review, binding, grid: this.options.scope.grid, contractQualified: true,
      });
      if (!plan.preparationAllowed) {
        this.status = plan.status; return null;
      }
      return { contract: { ...contract }, binding };
    } catch {
      this.status = 'review_unavailable'; return null;
    }
  }

  private deactivate(status: string): void {
    this.status = status; this.enabled = false; this.baseline = null; this.lastNow = null;
    // Revocation can happen from view() while a write is pending. Release ONLY after queued IO settles.
    this.enqueue(async () => {
      this.options.authority.release(this.options.scope.grid, this.owner);
    }).catch(() => {});
  }

  private current(generation: number): boolean {
    if (generation !== this.generation || !this.enabled || !this.contract || !this.binding) return false;
    const qualified = this.qualify();
    if (!qualified || qualified.binding !== this.binding) {
      this.deactivate(qualified ? 'contract_changed' : this.status); return false;
    }
    if (!this.options.authority.owns(this.options.scope.grid, this.binding, this.owner)) {
      this.deactivate('authority_lost'); return false;
    }
    return true;
  }

  /** No automatic startup. Must be called explicitly by a future adoption workflow. Restores totals, never a baseline. */
  start(): Promise<void> {
    const generation = ++this.generation;
    this.enabled = false; this.baseline = null; this.lastNow = null;
    return this.enqueue(async () => {
      if (generation !== this.generation) return;
      const qualified = this.qualify();
      if (!qualified) {
        this.deactivate(this.status); return;
      }
      if (this.binding && this.binding !== qualified.binding) {
        this.deactivate('source_change_requires_migration'); return;
      }
      if (!this.options.authority.claim(this.options.scope.grid, qualified.binding, this.owner)) {
        this.deactivate('authority_conflict'); return;
      }
      this.binding = qualified.binding; this.contract = qualified.contract;
      try {
        const stored = await this.options.storage.read();
        if (generation !== this.generation) return;
        const currentSelection = this.qualify();
        if (!currentSelection || currentSelection.binding !== qualified.binding) {
          this.deactivate(currentSelection ? 'contract_changed' : this.status); return;
        }
        let state = readDualCtEnergyCheckpoint(stored, qualified.binding, qualified.contract.timing);
        if (stored === undefined || stored === null) {
          if (this.checkpoint) {
            this.deactivate('checkpoint_missing'); return;
          }
          state = makeDualCtEnergyCheckpoint(qualified.binding, qualified.contract.timing)!;
          await this.options.storage.write({ ...state });
          if (generation !== this.generation) return;
          const readback = readDualCtEnergyCheckpoint(await this.options.storage.read(), qualified.binding, qualified.contract.timing);
          if (generation !== this.generation) return;
          if (!readback || readback.checksum !== state.checksum) {
            this.deactivate('checkpoint_readback_failed'); return;
          }
        }
        if (generation !== this.generation) return;
        if (!state) {
          this.deactivate('checkpoint_invalid'); return;
        }
        if (this.checkpoint && (state.revision < this.checkpoint.revision || state.importedWh < this.checkpoint.importedWh
          || state.exportedWh < this.checkpoint.exportedWh
          || (state.revision === this.checkpoint.revision && state.checksum !== this.checkpoint.checksum))) {
          this.deactivate('checkpoint_rollback'); return;
        }
        this.checkpoint = state; this.enabled = true;
        if (this.current(generation)) this.status = 'waiting_for_anchor';
      } catch {
        if (generation === this.generation) this.deactivate('storage_failed');
      }
    });
  }

  /** Recheck source authority for EVERY packet and after async storage before exposing a committed projection. */
  observe(payload: Buffer, topic: string, receivedAt: number, measuredAt: number | null = null): Promise<void> {
    if (!this.enabled) return Promise.resolve();
    if (this.pendingPackets >= 8) {
      ++this.generation; this.enabled = false; this.baseline = null; this.lastNow = null; this.status = 'backpressure';
      return this.enqueue(async () => {
        this.options.authority.release(this.options.scope.grid, this.owner);
      });
    }
    this.pendingPackets += 1;
    const { generation } = this;
    // Own bounded bytes while queued; caller mutation must not change a later decoded measurement.
    const owned = Buffer.isBuffer(payload) && payload.length <= 65536 ? Buffer.from(payload) : Buffer.alloc(0);
    return this.enqueue(async () => {
      if (!this.current(generation) || !this.checkpoint) return;
      const now = this.now();
      if (!Number.isFinite(now) || now <= 0 || (this.lastNow !== null && now < this.lastNow)) {
        this.baseline = null; this.lastNow = Number.isFinite(now) && now > 0 ? now : null; this.status = 'clock_reset'; return;
      }
      this.lastNow = now;
      const result = adaptDualCtGridEnergyPacket(this.options.scope, this.options.identity, this.contract,
        owned, topic, receivedAt, measuredAt, now);
      const sample = result.observation;
      if (!sample || sample.binding !== this.binding || sample.session !== this.options.scope.session) {
        this.baseline = null; this.status = result.status; return;
      }
      const previous = this.baseline;
      if (!previous) {
        this.baseline = sample; this.status = 'anchored'; return;
      }
      const at = sample.timing === 'device_measurement' ? sample.measuredAt! : sample.receivedAt;
      const before = previous.timing === 'device_measurement' ? previous.measuredAt! : previous.receivedAt;
      if (at <= before || sample.receivedAt <= previous.receivedAt) {
        this.status = 'out_of_order'; return;
      }
      const interval = dualCtPowerIntervalWh(previous.signedImportW, sample.signedImportW, at - before);
      if (!interval || !dualCtFreshAge(sample.receivedAt - previous.receivedAt)) {
        this.baseline = sample; this.status = 'gap_anchor'; return;
      }
      const next = makeDualCtEnergyCheckpoint(this.binding!, this.contract!.timing, this.checkpoint.revision + 1,
        this.checkpoint.importedWh + interval.importedWh, this.checkpoint.exportedWh + interval.exportedWh);
      if (!next) {
        this.baseline = null; this.status = 'accounting_overflow'; return;
      }
      if (next.importedWh === this.checkpoint.importedWh && next.exportedWh === this.checkpoint.exportedWh) {
        this.baseline = sample; this.status = 'unchanged'; return;
      }
      try {
        // The process-local authority enforces one writer. Readback also catches external/stale storage writes.
        const beforeWrite = readDualCtEnergyCheckpoint(await this.options.storage.read(), this.binding!, this.contract!.timing);
        if (generation !== this.generation) return;
        if (!beforeWrite || beforeWrite.checksum !== this.checkpoint.checksum) {
          this.deactivate('checkpoint_conflict'); return;
        }
        if (!this.current(generation)) return;
        await this.options.storage.write({ ...next });
        if (generation !== this.generation) return;
        const readback = readDualCtEnergyCheckpoint(await this.options.storage.read(), this.binding!, this.contract!.timing);
        if (generation !== this.generation) return;
        if (!readback || readback.checksum !== next.checksum) {
          this.deactivate('checkpoint_readback_failed'); return;
        }
        // Persist first. Late/failed/revoked operations never publish speculative totals or power.
        this.checkpoint = next;
        if (!this.current(generation)) return;
        this.baseline = sample; this.status = 'advanced';
      } catch {
        if (generation === this.generation) this.deactivate('storage_failed');
      }
    }).finally(() => {
      this.pendingPackets -= 1;
    });
  }

  close(): Promise<void> {
    ++this.generation; this.enabled = false; this.baseline = null; this.lastNow = null; this.status = 'closed';
    // Do not hand authority to a second writer until a pending checkpoint finishes.
    return this.enqueue(async () => {
      this.options.authority.release(this.options.scope.grid, this.owner);
    });
  }

  /** A proposed capability projection, NEVER applied to a Homey device by this module. */
  view(now = this.now()) {
    if (this.enabled) this.current(this.generation);
    if (this.enabled && (!Number.isFinite(now) || now <= 0 || (this.lastNow !== null && now < this.lastNow))) {
      this.deactivate('clock_reset');
    }
    const previous = this.baseline;
    let fresh = this.enabled && this.checkpoint !== null && previous !== null && Number.isFinite(now)
      && (this.lastNow === null || now >= this.lastNow) && dualCtFreshAge(now - previous.receivedAt);
    if (fresh && previous!.timing === 'device_measurement') fresh = dualCtFreshAge(now - previous!.measuredAt!);
    return {
      status: this.status,
      timingBasis: this.contract?.timing || null,
      measurementTimestampKnown: previous?.measuredAt != null,
      totalsBasis: 'derived_from_observed_power',
      approximation: this.contract?.timing === 'verified_live_receipt_estimate',
      totalsEstimated: true,
      proposedCapabilityOptions: { measure_power: { approximation: this.contract?.timing === 'verified_live_receipt_estimate' } },
      candidateCapabilities: {
        measure_power: fresh ? previous!.signedImportW : null,
        'meter_power.imported': this.enabled ? this.checkpoint!.importedWh / 1000 : null,
        'meter_power.exported': this.enabled ? this.checkpoint!.exportedWh / 1000 : null,
      },
      proposedEnergyConfiguration: DUAL_CT_ENERGY_PROPOSAL.energy,
      contributesToEnergy: false as const,
      runtimeEnabled: false as const,
      migrationAllowed: false as const,
    };
  }
}
