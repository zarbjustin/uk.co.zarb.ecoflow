/** Fixed metadata only: never include payload values, identity or encryption keys. */
export const DUAL_CT_EXTRA_SCALARS = [985, 986, 987, 988, 989, 990, 991, 992, 993, 998];
export const DUAL_CT_PREVIEW_REASONS = ['disabled', 'ready', 'no_samples', 'no_eligible_meter', 'missing_encoding',
  'unsupported_encoding', 'invalid_header', 'model_unverified', 'no_supported_candidates', 'expired', 'stopped',
  'account_changed', 'capture_unavailable', 'not_reported'];

export function dualCtReceiptSnapshot(input: any) {
  const count = Number.isInteger(input?.receivedPackets) && input.receivedPackets > 0 && input.receivedPackets <= 128
    ? input.receivedPackets : 0;
  const age = Number.isFinite(input?.lastReceiptAgeSec) && input.lastReceiptAgeSec >= 0 && input.lastReceiptAgeSec <= 86400
    ? input.lastReceiptAgeSec : null;
  const confirmed = input?.receiptConfirmed === true && count > 0 && age !== null;
  return { receiptConfirmed: confirmed, receivedPackets: confirmed ? count : 0, lastReceiptAgeSec: confirmed ? age : null };
}

export function dualCtPreviewDiagnostics(input: any) {
  const count = (value: any) => (Number.isInteger(value) && value >= 0 && value <= 2048 ? value : 0);
  let enabled: boolean | null = null;
  if (input?.enabled === true) enabled = true;
  else if (input?.enabled === false) enabled = false;
  return {
    enabled,
    reason: DUAL_CT_PREVIEW_REASONS.includes(input?.reason) ? input.reason : 'not_reported',
    attemptedPayloads: count(input?.attemptedPayloads),
    acceptedPayloads: count(input?.acceptedPayloads),
    encodingCounts: Object.fromEntries(['explicit_plain', 'missing', 'masked', 'unsupported', 'invalid_header']
      .map((key) => [key, count(input?.encodingCounts?.[key])])),
    additionalScalarFieldsSeen: Array.isArray(input?.additionalScalarFieldsSeen)
      ? [...new Set(input.additionalScalarFieldsSeen.slice(0, 128).filter((field: any) => DUAL_CT_EXTRA_SCALARS.includes(field)))].sort((a: any, b: any) => a - b) : [],
    additionalBankMappingVerified: false,
    valuesIncluded: false,
  };
}
