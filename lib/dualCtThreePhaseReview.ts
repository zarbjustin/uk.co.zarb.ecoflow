/** Offline packet review only. No driver imports, profile registration or Energy writes. */
import { decodeDualCtCandidates, DualCtDecodeContext } from './dualCtDecoder';
import { DUAL_CT_BANK_DEFINITIONS } from './dualCtContract';

/** Same-packet candidates, not verified wiring, sign, timing or utility netting rules.
 * Never pass latest-per-field caches here. Missing fields are not zero.
 */
export function reviewDualCtThreePhasePacket(payload: Buffer, context: DualCtDecodeContext) {
  const blocked = {
    energyEligible: false as const,
    hardwareValidated: false as const,
    phaseOrderVerified: false as const,
    measurementTimestampKnown: false as const,
    accountingPolicy: 'unverified' as const,
    channel: 'ct1' as const,
  };
  const reject = (status: string) => ({ ...blocked, status, candidate: null });
  const decoded = decodeDualCtCandidates(payload, context);
  if (!decoded) return reject('packet_rejected');
  const bank = DUAL_CT_BANK_DEFINITIONS.find((row) => row.bank === 'A')!;
  const values = bank.power.map((field) => decoded.readings.find((row) => row.field === field)?.value);
  if (values.some((value) => value === undefined)) return reject('incomplete_ct1_phases');
  const check = decoded.bankChecks.find((row) => row.bank === 'A');
  if (check?.status !== 'consistent') return reject(check?.status === 'mismatch' ? 'ct1_total_mismatch' : 'ct1_total_required');
  const phaseW = values as [number, number, number];
  // Corruption bounds only; this is not a supported electrical rating.
  if (phaseW.some((value) => Math.abs(value) > 100000) || Math.abs(check.phaseSum) > 100000) return reject('power_out_of_review_range');
  const positive = (value: number) => Math.max(0, value);
  const clean = (value: number) => (Object.is(value, -0) ? 0 : value);
  const signedSumW = clean(check.phaseSum);
  return {
    ...blocked,
    status: 'candidate_for_hardware_review',
    candidate: {
      phaseW: phaseW.map(clean) as [number, number, number],
      reportedTotalW: clean(check.reportedTotal),
      signedSumW,
      netted: { importW: positive(signedSumW), exportW: positive(-signedSumW) },
      perPhase: {
        importW: phaseW.reduce((sum, value) => sum + positive(value), 0),
        exportW: phaseW.reduce((sum, value) => sum + positive(-value), 0),
      },
      // CT2, voltage/current and vendor counters never enter either candidate.
      scope: 'one_decoded_ct1_payload' as const,
      signConvention: 'positive_import_hypothesis' as const,
    },
  };
}
