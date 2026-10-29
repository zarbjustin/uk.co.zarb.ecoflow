/** Source-bound review/confirmation for a FUTURE new-device pairing flow; no runtime imports or device writes. */
import { createHash, randomUUID } from 'crypto';
import { DualCtEnergyContributor, planDualCtEnergyAdoption } from './dualCtEnergyAdoption';
import {
  DualCtGridIdentity, DualCtGridContractResolver, dualCtGridBinding, dualCtGridContractValid,
  resolveDualCtGridEnergyContract, DUAL_CT_ENERGY_RUNTIME_ENABLED,
} from './dualCtGridEnergySource';

interface Selection {
  account: string;
  device: string;
  grid: string;
  owned: boolean;
  identity: DualCtGridIdentity;
  identityObservedAt: number;
}
interface Inventory {
  account: string;
  observedAt: number;
  complete: boolean;
  contributors: DualCtEnergyContributor[];
}
interface Options {
  /** Internal owned discovery with actual firmware readback; no browser/request-supplied verification. */
  readSelection: () => Promise<Selection | null>;
  readInventory: () => Promise<Inventory>;
  resolveContract?: DualCtGridContractResolver;
  runtimeEnabled?: () => boolean;
  now?: () => number;
}
interface Review {
  token: string;
  at: number;
  binding: string;
  account: string;
  inventoryHash: string;
}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fresh = (at: number, now: number) => Number.isFinite(at) && at > 0 && Number.isFinite(now) && now >= at && now - at < 90000;

export class DualCtEnergyAdoptionWorkflow {
  private generation = 0;
  private review: Review | null = null;
  private readonly options: Options;

  constructor(options: Options) {
    this.options = { ...options };
  }

  private now(): number {
    return (this.options.now || Date.now)();
  }

  private async read() {
    // Sequential readbacks preserve account/source dependencies. Recheck ages after both return.
    let discovered;
    try {
      discovered = await this.options.readSelection();
    } catch {
      throw new Error('source_read_failed');
    }
    if (!discovered || discovered.owned !== true) throw new Error('owned_source_required');
    const selected = { ...discovered, identity: { ...discovered.identity } };
    let contract;
    try {
      contract = (this.options.resolveContract || resolveDualCtGridEnergyContract)(selected.identity);
    } catch {
      throw new Error('contract_blocked');
    }
    if (!dualCtGridContractValid(contract, selected.identity)) throw new Error('contract_blocked');
    const binding = dualCtGridBinding({ ...selected, session: 'adoption_review' }, contract);
    if (!binding) throw new Error('invalid_source');
    let inventory;
    try {
      inventory = await this.options.readInventory();
    } catch {
      throw new Error('inventory_read_failed');
    }
    const now = this.now();
    if (!fresh(selected.identityObservedAt, now)) throw new Error('identity_stale');
    if (!inventory || inventory.account !== selected.account || !fresh(inventory.observedAt, now)) throw new Error('inventory_stale');
    const plan = planDualCtEnergyAdoption({
      explicitConsent: true,
      target: 'new_energy_device',
      accounting: 'power',
      binding,
      grid: selected.grid,
      contractQualified: true,
      inventoryComplete: inventory.complete,
      contributors: inventory.contributors,
      // This internal prerequisite check does not constitute the owner's separate confirmation below.
      externalOverlapReviewed: true,
    });
    if (!plan.preparationAllowed) throw new Error(plan.status);
    const contributors = inventory.contributors.map((row) => ({ id: row.id, grid: row.grid, contributes: row.contributes }))
      .sort((a, b) => a.id.localeCompare(b.id) || a.grid.localeCompare(b.grid));
    if (new Set(contributors.map((row) => row.id)).size !== contributors.length) throw new Error('inventory_duplicate');
    return {
      selected, binding, inventoryHash: digest(contributors), timing: contract!.timing, now,
    };
  }

  /** Review carries no full IDs, household readings or credentials. It cannot register a contract or enable Energy. */
  async prepare() {
    const generation = ++this.generation;
    this.review = null;
    const source = await this.read();
    if (generation !== this.generation) throw new Error('review_cancelled');
    const review = {
      token: randomUUID(),
      at: source.now,
      binding: source.binding,
      account: source.selected.account,
      inventoryHash: source.inventoryHash,
    };
    this.review = review;
    return {
      token: review.token,
      expiresAt: review.at + 90000,
      sourceLabel: `Dual CT · ${source.selected.device.slice(-4)}`,
      timing: source.timing,
      totalsBasis: 'derived_from_observed_power',
      counterMigration: false,
      existingDevicesChanged: false,
      contributesToEnergy: false,
      requiresSourceSpecificConsent: true,
      requiresExternalOverlapReview: true,
    };
  }

  /** One-shot confirmation. Never edits another meter, converts a preview or accepts client device/store objects. */
  async confirm(input: { token: string; consent: boolean; externalOverlapReviewed: boolean }) {
    const { review } = this;
    if (!review || !input || input.token !== review.token) throw new Error('review_consent_required');
    this.review = null;
    const generation = ++this.generation; // Consume before any await: duplicate Add cannot share a review.
    if (input.consent !== true
      || input.externalOverlapReviewed !== true) throw new Error('review_consent_required');
    if (!fresh(review.at, this.now())) throw new Error('review_expired');
    if (!(this.options.runtimeEnabled || (() => DUAL_CT_ENERGY_RUNTIME_ENABLED))()) throw new Error('runtime_blocked');
    const source = await this.read();
    if (generation !== this.generation) throw new Error('review_cancelled');
    if (!fresh(review.at, source.now)) throw new Error('review_expired');
    if (source.binding !== review.binding || source.selected.account !== review.account
      || source.inventoryHash !== review.inventoryHash) throw new Error('review_changed');
    // Recheck after asynchronous discovery; withdrawing activation cannot admit a late device.
    if (!(this.options.runtimeEnabled || (() => DUAL_CT_ENERGY_RUNTIME_ENABLED))()) throw new Error('runtime_blocked');
    return {
      name: `Dual CT property Energy · ${source.selected.device.slice(-4)}`,
      data: { sn: source.selected.device },
      store: {
        dualCtEnergyConsent: 1,
        dualCtEnergySourceBinding: source.binding,
        dualCtEnergyAccountBinding: source.selected.account,
        dualCtEnergyGrid: source.selected.grid,
      },
    };
  }

  cancel(): void {
    ++this.generation; this.review = null;
  }
}
