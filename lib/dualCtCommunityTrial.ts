/** Explicit community trial admission, NOT the hardware-qualified source registry. */
import { createHash } from 'crypto';
import type { DualCtGridEnergyContract, DualCtGridIdentity, DualCtGridScope } from './dualCtGridEnergySource';
import registry = require('../settings/dual-ct-community-profiles.json');

interface Source { account: string; device: string; grid: string; owned: boolean; identity: DualCtGridIdentity; identityObservedAt: number }
interface Proof { source: Source; contract: DualCtGridEnergyContract; at: number; lastNow: number; now: () => number; active: boolean }
const authority = Symbol('dual_ct_community_trial');
const proofs = new WeakMap<object, Proof>();
const key = (c: DualCtGridEnergyContract) => JSON.stringify([c.id, c.productType, c.firmware, c.channel, c.bank, c.unit,
  c.importSign, c.timing, c.encoding, c.liveFreshnessValidated, c.freshnessMs, c.wiring, c.nettingPolicy, c.communityTrial]);
function proof(c: DualCtGridEnergyContract, identity: DualCtGridIdentity): Proof | null {
  const p = c && proofs.get((c as any)[authority]);
  if (!p?.active || c.communityTrial !== true || c.singlePhaseOnly !== undefined || key(c) !== key(p.contract)
    || identity?.productType !== p.source.identity.productType || identity?.firmware !== p.source.identity.firmware) return null;
  let now;
  try {
    now = p.now();
  } catch {
    p.active = false; return null;
  }
  if (!Number.isFinite(now) || now < p.lastNow || now < p.at || now - p.at >= 90000
    || now < p.source.identityObservedAt || now - p.source.identityObservedAt >= 90000) {
    p.active = false; return null;
  }
  p.lastNow = now; return p;
}
export function isDualCtCommunityContract(c: DualCtGridEnergyContract, identity: DualCtGridIdentity): boolean {
  return !!proof(c, identity);
}
export function dualCtCommunityBinding(scope: DualCtGridScope, c: DualCtGridEnergyContract): string | null {
  const p = proof(c, { productType: c.productType, firmware: c.firmware });
  if (!p || scope.account !== p.source.account || scope.device !== p.source.device || scope.grid !== p.source.grid) return null;
  return createHash('sha256').update(JSON.stringify(['dual_ct_grid_community_trial_v1', scope.account, scope.device, scope.grid, key(c)])).digest('hex');
}
export class DualCtCommunityTrial {
  private token: object | null = null;
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /** Source comes exclusively from current owned discovery + current-package readback.
   * The declaration selects an experimental mode; it NEVER asserts hardware verification.
   */
  refresh(source: Source): void {
    this.cancel();
    const now = this.now();
    if (source?.owned !== true || ![source.account, source.device, source.grid].every((v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v))
      || !Number.isFinite(now) || !Number.isFinite(source.identityObservedAt) || source.identityObservedAt <= 0
      || now < source.identityObservedAt || now - source.identityObservedAt >= 90000) return;
    const row = registry.profiles.find((r) => r.productType === source.identity?.productType && r.firmware === source.identity?.firmware);
    if (!row) return;
    const contract = Object.freeze({ ...row }) as DualCtGridEnergyContract;
    const token = Object.freeze({}); this.token = token;
    proofs.set(token, {
      source: { ...source, identity: { ...source.identity } }, contract, at: now, lastNow: now, now: this.now, active: true,
    });
  }

  resolve(identity: DualCtGridIdentity): DualCtGridEnergyContract | null {
    const p = this.token && proofs.get(this.token);
    if (!p) return null;
    const c = { ...p.contract }; Object.defineProperty(c, authority, { value: this.token, enumerable: true });
    return proof(c, identity) ? c : null;
  }

  cancel(): void {
    if (this.token) {
      const p = proofs.get(this.token); if (p) p.active = false;
    } this.token = null;
  }
}
