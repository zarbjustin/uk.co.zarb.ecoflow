/** Candidate-only policy. Does not change the shared header parser's absent/default semantics. */
export type DualCtEncodingBasis = 'explicit_zero' | 'omitted_zero_candidate';

export function dualCtEncodingPolicy(header: {
  cmdFunc: number; cmdId: number; encType?: number; candidateHeaderValid?: boolean; pdata?: Buffer;
}, productType: number, source: string): { basis: DualCtEncodingBasis | null; reason: string | null } {
  if (!header || typeof header !== 'object') return { basis: null, reason: 'invalid_header' };
  if (productType !== 421 || source !== 'app_mqtt' || header.cmdFunc !== 254 || header.cmdId !== 21) {
    return { basis: null, reason: 'model_unverified' };
  }
  if (header.candidateHeaderValid === false || !Buffer.isBuffer(header.pdata) || !header.pdata.length
    || header.pdata.length > 65536) return { basis: null, reason: 'invalid_header' };
  if (header.encType === 0) return { basis: 'explicit_zero', reason: null };
  // Evidence supports an opt-in unchanged-byte trial, not a verified encoding contract.
  // Require a stronger inner-payload signature in the decoder. Never XOR/retry alternate bytes.
  if (header.encType === undefined) return { basis: 'omitted_zero_candidate', reason: null };
  return { basis: null, reason: 'unsupported_encoding' };
}
