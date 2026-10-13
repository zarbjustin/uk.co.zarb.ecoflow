import { decodeDualCtCandidates, DualCtDecodeContext } from './dualCtDecoder';

type Reading = NonNullable<ReturnType<typeof decodeDualCtCandidates>>['readings'][number];

/** Private, bounded candidate cache. Never include this object in support exports. */
export class DualCtPreview {
  private rows = new Map<number, Map<number, { reading: Reading; receivedAt: number }>>();
  private lastNow = 0;
  private captured = false;
  private unavailableReason = 'no_samples';

  private readonly enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled === true;
  }

  clear(): void {
    this.rows.clear();
    this.captured = false;
    this.unavailableReason = 'no_samples';
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
    const decoded = decodeDualCtCandidates(payload, context);
    if (!decoded) {
      this.unavailableReason = 'no_supported_candidates';
      return;
    }
    this.captured = true;
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
      contributesToEnergy: false,
      controlsEnabled: false,
      pairingEnabled: false,
      devices,
    };
  }
}
