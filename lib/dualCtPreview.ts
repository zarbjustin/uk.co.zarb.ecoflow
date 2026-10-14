import { decodeDualCtCandidates, DualCtDecodeContext } from './dualCtDecoder';
import { DUAL_CT_EXTRA_SCALARS, dualCtPreviewDiagnostics } from './dualCtDiagnostics';

type Reading = NonNullable<ReturnType<typeof decodeDualCtCandidates>>['readings'][number];

/** Private, bounded candidate cache. Never include this object in support exports. */
export class DualCtPreview {
  private rows = new Map<number, Map<number, { reading: Reading; receivedAt: number }>>();
  private lastNow = 0;
  private captured = false;
  private unavailableReason = 'no_samples';
  private attemptedPayloads = 0;
  private acceptedPayloads = 0;
  private omittedMarkerAttempts = 0;
  private omittedMarkerAccepted = 0;
  private encodingCounts: Record<string, number> = {};
  private extraFields = new Set<number>();

  private readonly enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled === true;
  }

  clear(resetDiagnostics = true): void {
    this.rows.clear();
    this.captured = false;
    this.unavailableReason = 'no_samples';
    if (resetDiagnostics) {
      this.attemptedPayloads = 0; this.acceptedPayloads = 0;
      this.omittedMarkerAttempts = 0; this.omittedMarkerAccepted = 0;
      this.encodingCounts = {}; this.extraFields.clear();
    }
  }

  recordHeader(encoding: number | undefined, valid: boolean, fields: Array<{ field: number; wire: number }>): void {
    let key = 'unsupported';
    if (!valid) key = 'invalid_header';
    else if (encoding === undefined) key = 'missing';
    else if (encoding === 0) key = 'explicit_plain';
    else if (encoding === 1) key = 'masked';
    this.encodingCounts[key] = Math.min(2048, (this.encodingCounts[key] || 0) + 1);
    if (valid) this.recordAdditionalFields(fields);
  }

  recordAdditionalFields(fields: Array<{ field: number; wire: number }>): void {
    fields.forEach((field) => {
      if (field.wire === 5 && DUAL_CT_EXTRA_SCALARS.includes(field.field)) this.extraFields.add(field.field);
    });
  }

  diagnostics(reason: string) {
    return dualCtPreviewDiagnostics({
      enabled: this.enabled,
      reason,
      attemptedPayloads: this.attemptedPayloads,
      acceptedPayloads: this.acceptedPayloads,
      omittedMarkerAttempts: this.omittedMarkerAttempts,
      omittedMarkerAccepted: this.omittedMarkerAccepted,
      encodingCounts: this.encodingCounts,
      additionalScalarFieldsSeen: [...this.extraFields],
    });
  }

  noteUnavailable(reason: string): void {
    if (['missing_encoding', 'unsupported_encoding', 'invalid_header', 'model_unverified'].includes(reason)) {
      this.unavailableReason = reason;
    }
  }

  hasCaptured(): boolean {
    return this.captured;
  }

  private clock(now: number): boolean {
    if (!Number.isFinite(now) || now <= 0 || now < this.lastNow) {
      this.clear();
      if (Number.isFinite(now)) this.lastNow = now;
      return false;
    }
    this.lastNow = now;
    return true;
  }

  observe(deviceIndex: number, payload: Buffer, context: DualCtDecodeContext): void {
    if (!this.enabled || ![0, 1].includes(deviceIndex) || !this.clock(context.now)) return;
    this.attemptedPayloads = Math.min(2048, this.attemptedPayloads + 1);
    if (context.encodingBasis === 'omitted_zero_candidate') this.omittedMarkerAttempts = Math.min(2048, this.omittedMarkerAttempts + 1);
    const decoded = decodeDualCtCandidates(payload, context);
    if (!decoded) {
      this.unavailableReason = context.encodingBasis === 'omitted_zero_candidate' ? 'omitted_encoding_rejected' : 'no_supported_candidates';
      return;
    }
    this.captured = true;
    this.acceptedPayloads = Math.min(2048, this.acceptedPayloads + 1);
    if (context.encodingBasis === 'omitted_zero_candidate') this.omittedMarkerAccepted = Math.min(2048, this.omittedMarkerAccepted + 1);
    const fields = this.rows.get(deviceIndex) || new Map();
    for (const reading of decoded.readings) {
      const previous = fields.get(reading.field);
      if (!previous || context.receivedAt >= previous.receivedAt) {
        fields.set(reading.field, { reading: { ...reading }, receivedAt: context.receivedAt });
      }
    }
    this.rows.set(deviceIndex, fields);
  }

  snapshot(now: number) {
    this.clock(now);
    const devices = [];
    for (const [deviceIndex, fields] of this.rows) {
      const readings = [];
      for (const [field, row] of fields) {
        if (now < row.receivedAt || now - row.receivedAt > 90000) fields.delete(field);
        else readings.push({ ...row.reading, receivedAgeSec: (now - row.receivedAt) / 1000 });
      }
      if (readings.length) devices.push({ deviceIndex, readings });
    }
    let reason = this.unavailableReason;
    if (this.captured) reason = 'expired';
    if (devices.length) reason = 'ready';
    if (!this.enabled) reason = 'disabled';
    return {
      enabled: this.enabled,
      reason,
      interpretation: 'legacy_meter_overlap_unverified',
      unitsVerified: false,
      directionVerified: false,
      channelMapping: 'unverified',
      measurementTimestampKnown: false,
      hardwareValidated: false,
      encodingVerified: false,
      additionalBankMappingVerified: false,
      contributesToEnergy: false,
      controlsEnabled: false,
      pairingEnabled: false,
      devices,
    };
  }
}
