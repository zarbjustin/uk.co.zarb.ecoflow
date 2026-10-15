/** Fixed metadata only: never include payload values, identity or encryption keys. */
export const DUAL_CT_EXTRA_SCALARS = [985, 986, 987, 988, 989, 990, 991, 992, 993, 998];
export const DUAL_CT_PREVIEW_REASONS = ['disabled', 'ready', 'no_samples', 'no_eligible_meter', 'missing_encoding',
  'unsupported_encoding', 'invalid_header', 'model_unverified', 'no_supported_candidates', 'expired', 'stopped',
  'account_changed', 'capture_unavailable', 'not_reported', 'omitted_encoding_rejected'];

export function dualCtReceiptSnapshot(input: any) {
  const count = Number.isInteger(input?.receivedPackets) && input.receivedPackets > 0 && input.receivedPackets <= 128
    ? input.receivedPackets : 0;
  const age = Number.isFinite(input?.lastReceiptAgeSec) && input.lastReceiptAgeSec >= 0 && input.lastReceiptAgeSec <= 86400
    ? input.lastReceiptAgeSec : null;
  const confirmed = input?.receiptConfirmed === true && count > 0 && age !== null;
  return { receiptConfirmed: confirmed, receivedPackets: confirmed ? count : 0, lastReceiptAgeSec: confirmed ? age : null };
}

/** Fixed outcome metadata only. Never project arithmetic operands or raw payloads. */
export function dualCtBankSummary(input: any, enabled: boolean) {
  const banks: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  const reported = enabled && input?.reported === true && input?.scope === 'retained_capture_history'
    && input?.arithmeticScope === 'single_decoded_payload';
  if (reported && Array.isArray(input.banks)) {
    for (const row of input.banks.slice(0, 4)) {
      const key = `${row?.deviceIndex}:${row?.bank}`;
      if (![0, 1].includes(row?.deviceIndex) || !['A', 'B'].includes(row?.bank) || seen.has(key)) continue;
      const project = (check: any, complete: boolean) => {
        if (!(complete ? ['consistent', 'mismatch'] : ['partial', 'consistent', 'mismatch', 'invalid']).includes(check?.status)
          || !Number.isFinite(check?.receivedAgeSec) || check.receivedAgeSec < 0 || check.receivedAgeSec >= 990) return null;
        return { status: check.status, receivedAgeSec: check.receivedAgeSec, stale: check.receivedAgeSec >= 90 };
      };
      const latest = project(row.latest, false); const lastComplete = project(row.lastComplete, true);
      if (!latest || (row.lastComplete != null && !lastComplete)
        || (lastComplete && lastComplete.receivedAgeSec < latest.receivedAgeSec)
        || (['consistent', 'mismatch'].includes(latest.status) && (!lastComplete
          || latest.status !== lastComplete.status || latest.receivedAgeSec !== lastComplete.receivedAgeSec))) continue;
      seen.add(key); banks.push({
        deviceIndex: row.deviceIndex, bank: row.bank, latest, lastComplete,
      });
    }
  }
  return {
    reported,
    scope: 'retained_capture_history',
    arithmeticScope: 'single_decoded_payload',
    banks,
    mappingVerified: false,
    unitsVerified: false,
    directionVerified: false,
    measurementSimultaneityVerified: false,
    valuesIncluded: false,
  };
}

export function dualCtCounterMetadata(input: any) {
  const records: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  if (Array.isArray(input?.records)) {
    for (const row of input.records.slice(0, 4)) {
      const key = `${row?.deviceIndex}:${row?.parent}`;
      if (![0, 1].includes(row?.deviceIndex) || ![773, 997].includes(row?.parent) || seen.has(key)
      || !['observed', 'invalid', 'oversized'].includes(row?.status)
      || !Number.isFinite(row.receivedAgeSec) || row.receivedAgeSec < 0 || row.receivedAgeSec >= 990) continue;
      seen.add(key);
      const fields = Array.isArray(row.fields) ? row.fields.slice(0, 32).filter((field: any) => Number.isInteger(field?.field)
      && field.field >= 1 && field.field <= 64 && [0, 1, 2, 5].includes(field?.wire)).map((field: any) => ({ field: field.field, wire: field.wire })) : [];
      const checks = input.enabled === true && row.parent === 773 && row.status === 'observed' && Array.isArray(row.checks)
        ? row.checks.slice(0, 2).filter((check: any) => ['4-6=7', '1+2+3=7'].includes(check?.expression)
        && ['partial', 'consistent', 'mismatch', 'invalid'].includes(check?.status) && check.scope === 'single_nested_record')
          .map((check: any) => ({
            expression: check.expression, status: check.status, scope: 'single_nested_record', verified: false,
          })) : [];
      records.push({
        deviceIndex: row.deviceIndex,
        parent: row.parent,
        status: row.status,
        fields,
        checks,
        receivedAgeSec: row.receivedAgeSec,
        stale: row.receivedAgeSec >= 90,
        fieldsAvailable: row.fieldsOmitted === true && Number.isInteger(row.fieldsAvailable)
        && row.fieldsAvailable >= fields.length && row.fieldsAvailable <= 32 ? row.fieldsAvailable : fields.length,
        fieldsIncluded: fields.length,
        fieldsOmitted: row.fieldsOmitted === true,
      });
    }
  }
  return {
    enabled: input?.enabled === true, records, unitsVerified: false, period: 'unknown', valuesIncluded: false,
  };
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
    omittedMarkerAttempts: count(input?.omittedMarkerAttempts),
    omittedMarkerAccepted: count(input?.omittedMarkerAccepted),
    encodingPolicy: 'dual_ct_live_candidate_v1',
    encodingVerified: false,
    encodingCounts: Object.fromEntries(['explicit_plain', 'missing', 'masked', 'unsupported', 'invalid_header']
      .map((key) => [key, count(input?.encodingCounts?.[key])])),
    additionalScalarFieldsSeen: Array.isArray(input?.additionalScalarFieldsSeen)
      ? [...new Set(input.additionalScalarFieldsSeen.slice(0, 128).filter((field: any) => DUAL_CT_EXTRA_SCALARS.includes(field)))].sort((a: any, b: any) => a - b) : [],
    additionalBankMappingVerified: false,
    bankCheckSummary: dualCtBankSummary(input?.bankCheckSummary, enabled === true),
    counterResearch: dualCtCounterMetadata(enabled === true ? input?.counterResearch : null),
    valuesIncluded: false,
  };
}
