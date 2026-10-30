/** Future grid-path plumbing. No registered contract, driver writes or customer-controlled verification. */
import { createHash } from 'crypto';
import { decodeFrameHeaders } from './streamAc5000Protocol';
import { dualCtEncodingPolicy, DualCtEncodingBasis } from './dualCtEncoding';
import { decodeDualCtCandidates } from './dualCtDecoder';
import { DUAL_CT_BANK_DEFINITIONS, dualCtFreshAge } from './dualCtContract';
import { dualCtContainsFields } from './dualCtLiveDelivery';
import registry = require('../settings/dual-ct-grid-profiles.json');
import { isQualifiedDualCtThreePhaseContract, qualifiedDualCtThreePhaseBinding } from './dualCtSourceQualification';

export type DualCtEnergyTiming = 'device_measurement' | 'verified_live_receipt_estimate';
export interface DualCtGridIdentity { productType: number; firmware: string }
export interface DualCtGridScope { account: string; device: string; session: string; grid: string }
/** Supplied by developer-owned code, NEVER a setting, JSON report or packet assertion. */
export interface DualCtGridEnergyContract {
  id: string;
  productType: 421;
  firmware: string;
  channel: 'ct1';
  bank: 'A';
  unit: 'W';
  importSign: 'positive' | 'negative';
  timing: DualCtEnergyTiming;
  encoding: DualCtEncodingBasis;
  liveFreshnessValidated: true;
  singlePhaseOnly?: true;
  wiring?: 'three_phase';
  nettingPolicy?: 'signed_phase_sum';
  freshnessMs?: number;
}

export type DualCtGridContractResolver = (identity: DualCtGridIdentity) => DualCtGridEnergyContract | null;
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const firmwareValid = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(value);
export function dualCtGridScopeValid(scope: DualCtGridScope): boolean {
  return !!scope && [scope.account, scope.device, scope.session, scope.grid].every(identifier);
}

export function dualCtGridContractValid(contract: DualCtGridEnergyContract | null, identity: DualCtGridIdentity): contract is DualCtGridEnergyContract {
  return !!contract && !!identity && identity.productType === 421 && contract.productType === 421
    && identifier(contract.id) && firmwareValid(identity.firmware) && contract.firmware === identity.firmware
    && contract.channel === 'ct1' && contract.bank === 'A' && contract.unit === 'W'
    && ['positive', 'negative'].includes(contract.importSign)
    && ['device_measurement', 'verified_live_receipt_estimate'].includes(contract.timing)
    && ['explicit_zero', 'omitted_zero_candidate'].includes(contract.encoding)
    && contract.liveFreshnessValidated === true
    && (contract.wiring === undefined && contract.nettingPolicy === undefined
      ? (contract.singlePhaseOnly === undefined || contract.singlePhaseOnly === true)
      : isQualifiedDualCtThreePhaseContract(contract, identity))
    && (contract.freshnessMs === undefined || (Number.isSafeInteger(contract.freshnessMs) && contract.freshnessMs > 0 && contract.freshnessMs <= 90000));
}

/** Candidate admission only. Full installed acceptance remains in the separate release ledger. */
export const resolveDualCtGridEnergyContract: DualCtGridContractResolver = (identity) => {
  const row = registry.profiles.find((entry) => entry.productType === identity?.productType && entry.firmware === identity?.firmware);
  const contract = row ? { ...row } as DualCtGridEnergyContract : null;
  return dualCtGridContractValid(contract, identity) ? contract : null;
};
// Pairing is available, never automatic adoption or writes to an existing monitor.
export const DUAL_CT_ENERGY_RUNTIME_ENABLED = true;

/** Stable across sessions, not across account/meter/grid/contract/direction/timing changes. No raw identity in stores. */
export function dualCtGridBinding(scope: DualCtGridScope, contract: DualCtGridEnergyContract): string | null {
  if (!dualCtGridScopeValid(scope) || !dualCtGridContractValid(contract, { productType: 421, firmware: contract?.firmware })) return null;
  if (contract.wiring === 'three_phase') return qualifiedDualCtThreePhaseBinding(scope, contract);
  return createHash('sha256').update(JSON.stringify([scope.account, scope.device, scope.grid, contract.id,
    contract.firmware, contract.channel, contract.bank, contract.unit, contract.importSign, contract.timing, contract.encoding,
    contract.singlePhaseOnly ?? false, contract.freshnessMs ?? 90000])).digest('hex');
}

export interface DualCtGridEnergyObservation {
  binding: string;
  session: string;
  signedImportW: number;
  receivedAt: number;
  measuredAt: number | null;
  timing: DualCtEnergyTiming;
}

/** Accept one owned live frame, never preview-cache fields, raw counters, CT2 or screenshot annotations. */
export function adaptDualCtGridEnergyPacket(scope: DualCtGridScope, identity: DualCtGridIdentity,
  contract: DualCtGridEnergyContract | null, payload: Buffer, topic: string,
  receivedAt: number, measuredAt: number | null, now: number): { status: string; observation: DualCtGridEnergyObservation | null } {
  const reject = (status: string) => ({ status, observation: null });
  if (!dualCtGridScopeValid(scope) || !dualCtGridContractValid(contract, identity)) return reject('contract_blocked');
  const sourceBinding = contract.wiring === 'three_phase' ? dualCtGridBinding(scope, contract) : null;
  if (contract.wiring === 'three_phase' && !sourceBinding) return reject('source_qualification_mismatch');
  if (topic !== `/app/device/property/${scope.device}` || !Buffer.isBuffer(payload) || !payload.length || payload.length > 65536
    || !Number.isFinite(receivedAt) || receivedAt <= 0 || !Number.isFinite(now) || !dualCtFreshAge(now - receivedAt)) return reject('transport_rejected');
  if (now - receivedAt >= (contract.freshnessMs ?? 90000)) return reject('receipt_expired');
  if (contract.timing === 'device_measurement' && (!Number.isFinite(measuredAt) || measuredAt === null
    || measuredAt <= 0 || measuredAt > receivedAt || !dualCtFreshAge(now - measuredAt))) return reject('measurement_time_required');
  if (contract.timing === 'verified_live_receipt_estimate' && measuredAt !== null) return reject('timing_basis_conflict');
  try {
    const headers = decodeFrameHeaders(payload);
    if (!headers.length || headers.length > 16 || headers.some((row) => row.candidateHeaderValid === false
      || (row.deviceSn && row.deviceSn !== scope.device))) return reject('header_rejected');
    const candidates = headers.map((header) => ({ header, policy: dualCtEncodingPolicy(header, 421, 'app_mqtt') }))
      .filter((row) => row.policy.basis !== null);
    // Do not silently choose one of multiple same-delivery candidate measurements.
    if (candidates.length !== 1) return reject('ambiguous_packet');
    const { header, policy } = candidates[0];
    if (policy.basis !== contract.encoding) return reject('encoding_contract_conflict');
    const bank = DUAL_CT_BANK_DEFINITIONS.find((row) => row.bank === contract.bank)!;
    const hasGridPower = dualCtContainsFields(header.pdata!, [bank.total, ...bank.power]);
    if (hasGridPower === false) return reject('unrelated_grid_packet');
    if (hasGridPower === null) return reject('decode_rejected');
    const decoded = decodeDualCtCandidates(header.pdata!, {
      productType: 421,
      cmdFunc: header.cmdFunc,
      cmdId: header.cmdId,
      source: 'app_mqtt',
      encoding: 'plain',
      encodingBasis: policy.basis!,
      receivedAt,
      now,
    });
    if (!decoded) return reject('decode_rejected');
    const phases = bank.power.map((field) => decoded.readings.find((row) => row.field === field));
    if (phases.some((row) => !row)) return reject('incomplete_grid_phases');
    if (contract.singlePhaseOnly && (phases[1]!.value !== 0 || phases[2]!.value !== 0)) return reject('wiring_outside_qualification');
    if (contract.wiring === 'three_phase' && decoded.bankChecks.find((row) => row.bank === contract.bank)?.status !== 'consistent') return reject('complete_grid_total_required');
    if (decoded.bankChecks.find((row) => row.bank === contract.bank)?.status === 'mismatch') return reject('grid_total_mismatch');
    const watts = phases.reduce((sum, row) => sum + row!.value, 0) * (contract.importSign === 'positive' ? 1 : -1);
    if (!Number.isFinite(watts) || Math.abs(watts) > 100000) return reject('power_rejected');
    return {
      status: 'accepted_for_preparation',
      observation: {
        binding: sourceBinding || dualCtGridBinding(scope, contract)!,
        session: scope.session,
        signedImportW: Object.is(watts, -0) ? 0 : watts,
        receivedAt,
        measuredAt,
        timing: contract.timing,
      },
    };
  } catch {
    return reject('decode_rejected');
  }
}
