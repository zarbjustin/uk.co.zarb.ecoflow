/** One shared research profile; importing this never authorises a device or Energy mapping. */
import profile = require('../settings/dual-ct-contract');

export interface DualCtBankDefinition {
  readonly bank: 'A' | 'B';
  readonly total: number;
  readonly power: readonly number[];
  readonly voltage: readonly number[];
  readonly current: readonly number[];
}
export interface DualCtFieldDefinition {
  readonly field: number;
  readonly bank: 'A' | 'B';
  readonly phase: number | null;
  readonly quantity: 'total_power' | 'power' | 'voltage' | 'current';
  readonly suggestedUnit: string;
  readonly candidate: string;
  readonly candidateUnit: string | null;
}
export const DUAL_CT_BANK_DEFINITIONS = profile.banks as readonly DualCtBankDefinition[];
export const DUAL_CT_FIELD_DEFINITIONS = profile.fields as readonly DualCtFieldDefinition[];
export const DUAL_CT_STALE_MS = profile.staleMs;
export const dualCtFreshAge: (ageMs: number) => boolean = profile.isFreshAge;

/** Unknown measurement time stays unknown; cached snapshots require a real timestamp. */
export function dualCtReadingTime(receivedAt: number, measuredAt: number | null, now: number) {
  const receiptAgeMs = now - receivedAt;
  const validReceipt = Number.isFinite(now) && now >= 0 && Number.isFinite(receivedAt)
    && receivedAt >= 0 && dualCtFreshAge(receiptAgeMs);
  const known = measuredAt !== null;
  const measurementAgeMs = known && Number.isFinite(measuredAt) && measuredAt >= 0 && measuredAt <= receivedAt
    ? now - measuredAt : null;
  return {
    valid: validReceipt && (!known || (measurementAgeMs !== null && dualCtFreshAge(measurementAgeMs))),
    timeBasis: known ? 'measured' as const : 'receipt_only' as const,
    measurementAgeSec: measurementAgeMs === null ? null : measurementAgeMs / 1000,
    receiptAgeSec: Number.isFinite(receiptAgeMs) && receiptAgeMs >= 0 ? receiptAgeMs / 1000 : null,
  };
}
