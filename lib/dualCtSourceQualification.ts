/** Internal preparation seam. No driver/HTTP handler invokes it; no three-phase profile is registered. */
import { createHash } from 'crypto';
import type { DualCtGridEnergyContract, DualCtGridIdentity, DualCtGridScope } from './dualCtGridEnergySource';
import registry = require('../settings/dual-ct-three-phase-grid-profiles.json');

export interface DualCtOwnedSourceQualificationReadback {
  account: string;
  device: string;
  grid: string;
  owned: boolean;
  identity: DualCtGridIdentity;
  observedAt: number;
  wiring: 'three_phase';
  wiringBasis: 'owned_configuration' | 'reviewed_installation';
  nettingPolicy: 'signed_phase_sum';
}
export interface DualCtSourceQualification { readonly kind: 'dual_ct_source_qualification' }
interface Record {
  owner: symbol;
  source: DualCtOwnedSourceQualificationReadback;
  profile: DualCtGridEnergyContract;
  issuedAt: number;
  lastNow: number;
  active: boolean;
  now: () => number;
}
const proofs = new WeakMap<object, Record>();
// Enumerable symbols survive internal object-spread copies, never JSON/API serialization.
const authority = Symbol('qualified_dual_ct_source');
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const firmware = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(v);
const fresh = (at: number, now: number) => Number.isFinite(at) && at > 0 && Number.isFinite(now) && now >= at && now - at < 90000;
const profileKey = (c: DualCtGridEnergyContract) => JSON.stringify([c.id, c.productType, c.firmware, c.channel, c.bank,
  c.unit, c.importSign, c.timing, c.encoding, c.liveFreshnessValidated, c.singlePhaseOnly ?? null,
  c.freshnessMs, c.wiring, c.nettingPolicy]);
function profileValid(c: DualCtGridEnergyContract): boolean {
  return !!c && id(c.id) && c.productType === 421 && firmware(c.firmware) && c.channel === 'ct1'
    && c.bank === 'A' && c.unit === 'W' && ['positive', 'negative'].includes(c.importSign)
    && ['device_measurement', 'verified_live_receipt_estimate'].includes(c.timing)
    && ['explicit_zero', 'omitted_zero_candidate'].includes(c.encoding) && c.liveFreshnessValidated === true
    && c.singlePhaseOnly === undefined && c.wiring === 'three_phase' && c.nettingPolicy === 'signed_phase_sum'
    && Number.isSafeInteger(c.freshnessMs) && c.freshnessMs! > 0 && c.freshnessMs! <= 90000;
}
function current(token: unknown): Record | null {
  if (!token || typeof token !== 'object') return null;
  const record = proofs.get(token);
  if (!record?.active) return null;
  let now: number;
  try {
    now = record.now();
  } catch {
    record.active = false; return null;
  }
  if (now < record.lastNow || !fresh(record.issuedAt, now) || !fresh(record.source.observedAt, now)) {
    record.active = false; return null;
  }
  record.lastNow = now;
  return record;
}
function contractRecord(contract: DualCtGridEnergyContract, identity: DualCtGridIdentity): Record | null {
  if (!profileValid(contract) || !identity) return null;
  const record = current((contract as any)[authority]);
  return record && record.source.identity.productType === identity.productType
    && record.source.identity.firmware === identity.firmware && profileKey(contract) === profileKey(record.profile) ? record : null;
}
export function isQualifiedDualCtThreePhaseContract(contract: DualCtGridEnergyContract, identity: DualCtGridIdentity): boolean {
  return contractRecord(contract, identity) !== null;
}
/** V2 only. Legacy binding serialization remains in dualCtGridEnergySource, untouched. */
export function qualifiedDualCtThreePhaseBinding(scope: DualCtGridScope, contract: DualCtGridEnergyContract): string | null {
  const record = contractRecord(contract, { productType: contract.productType, firmware: contract.firmware });
  if (!record || record.source.account !== scope.account || record.source.device !== scope.device
    || record.source.grid !== scope.grid) return null;
  return createHash('sha256').update(JSON.stringify(['dual_ct_grid_binding_v2', scope.account, scope.device, scope.grid,
    profileKey(contract)])).digest('hex');
}

export class DualCtSourceQualifier {
  private generation = 0;
  private token: DualCtSourceQualification | null = null;
  private readonly owner = Symbol('source_qualifier');
  private readonly profiles: readonly DualCtGridEnergyContract[];
  private readonly now: () => number;
  private readonly readOwnedSource: () => Promise<DualCtOwnedSourceQualificationReadback>;

  /** Ports/profiles are trusted app-side dependencies, never pairing/settings/request data.
   * A future reader must join current owned identity with reviewed wiring/policy.
   * This does not infer wiring from powers or promote a customer's verification flag.
   */
  constructor(options: { readOwnedSource: () => Promise<DualCtOwnedSourceQualificationReadback>;
    profiles?: readonly DualCtGridEnergyContract[]; now?: () => number }) {
    this.readOwnedSource = options.readOwnedSource; this.now = options.now || Date.now;
    this.profiles = Object.freeze((options.profiles || registry.profiles).map((profile) => Object.freeze({ ...profile })));
  }

  async prepare(selection: unknown): Promise<{ status: string; qualification: DualCtSourceQualification | null }> {
    this.cancel(); const { generation } = this;
    const reject = (status: string) => ({ status, qualification: null });
    if (!selection || typeof selection !== 'object' || Array.isArray(selection)
      || Object.keys(selection).sort().join() !== 'nettingPolicy,wiring'
      || (selection as any).wiring !== 'three_phase' || (selection as any).nettingPolicy !== 'signed_phase_sum') return reject('selection_blocked');
    let source: DualCtOwnedSourceQualificationReadback;
    try {
      const row = await this.readOwnedSource();
      if (generation !== this.generation) return reject('qualification_cancelled');
      if (!row || row.owned !== true || !id(row.account) || !id(row.device) || !id(row.grid)
        || row.identity?.productType !== 421 || !firmware(row.identity.firmware)
        || row.wiring !== 'three_phase' || row.nettingPolicy !== 'signed_phase_sum'
        || !['owned_configuration', 'reviewed_installation'].includes(row.wiringBasis)) return reject('source_unqualified');
      source = {
        account: row.account,
        device: row.device,
        grid: row.grid,
        identity: { productType: row.identity.productType, firmware: row.identity.firmware },
        owned: true,
        observedAt: row.observedAt,
        wiring: row.wiring,
        wiringBasis: row.wiringBasis,
        nettingPolicy: row.nettingPolicy,
      };
    } catch {
      return reject('source_read_failed');
    }
    let now: number;
    try {
      now = this.now();
    } catch {
      return reject('clock_unavailable');
    }
    if (generation !== this.generation) return reject('qualification_cancelled');
    if (!fresh(source.observedAt, now)) return reject('source_stale');
    const matches = this.profiles.filter((profile) => profileValid(profile) && profile.firmware === source.identity.firmware);
    if (matches.length !== 1) return reject('profile_unqualified');
    const token = Object.freeze({ kind: 'dual_ct_source_qualification' as const });
    proofs.set(token, {
      owner: this.owner, source, profile: matches[0], issuedAt: now, lastNow: now, active: true, now: this.now,
    });
    this.token = token;
    return { status: 'qualified_for_preparation', qualification: token };
  }

  resolve(identity: DualCtGridIdentity, token: DualCtSourceQualification): DualCtGridEnergyContract | null {
    const record = current(token);
    if (!record || record.owner !== this.owner || record.source.identity.productType !== identity?.productType
      || record.source.identity.firmware !== identity?.firmware) return null;
    const contract = { ...record.profile };
    Object.defineProperty(contract, authority, { value: token, enumerable: true });
    return contract;
  }

  cancel(): void {
    ++this.generation;
    if (this.token) {
      const record = proofs.get(this.token); if (record) record.active = false;
    }
    this.token = null;
  }
}
