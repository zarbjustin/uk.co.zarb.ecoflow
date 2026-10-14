import { decodeDualCtCandidates, DualCtDecodeContext } from './dualCtDecoder';
import { DUAL_CT_EXTRA_SCALARS, dualCtPreviewDiagnostics } from './dualCtDiagnostics';
import { DualCtBankCheck } from './dualCtBanks';

type Reading = NonNullable<ReturnType<typeof decodeDualCtCandidates>>['readings'][number];
type RetainedReading = Reading & { packetIndex: number };
type PacketCheck = { check: DualCtBankCheck; packetIndex: number; receivedAt: number; encodingBasis: string };
const DIAGNOSTIC_RETENTION_MS = 15 * 60 * 1000;

/** Private, bounded candidate cache. Never include this object in support exports. */
export class DualCtPreview {
  private rows = new Map<number, Map<number, { reading: RetainedReading; receivedAt: number }>>();
  private diagnosticRows = new Map<number, Map<number, { reading: RetainedReading; receivedAt: number }>>();
  private bankChecks = new Map<number, Map<string, { latest: PacketCheck; lastComplete?: PacketCheck }>>();
  private diagnosticStartedAt: number | null = null;
  private diagnosticLatestAt = 0;
  private diagnosticExpired = false;
  private diagnosticTimer: ReturnType<typeof setTimeout> | null = null;
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
    this.clearDiagnostic();
    this.diagnosticStartedAt = null;
    this.diagnosticLatestAt = 0;
    this.diagnosticExpired = false;
    this.captured = false;
    this.unavailableReason = 'no_samples';
    if (resetDiagnostics) {
      this.attemptedPayloads = 0; this.acceptedPayloads = 0;
      this.omittedMarkerAttempts = 0; this.omittedMarkerAccepted = 0;
      this.encodingCounts = {}; this.extraFields.clear();
    }
  }

  private clearDiagnostic(): void {
    this.diagnosticRows.clear();
    this.bankChecks.clear();
    if (this.diagnosticTimer !== null) clearTimeout(this.diagnosticTimer);
    this.diagnosticTimer = null;
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
    if (this.diagnosticStartedAt !== null && context.now - this.diagnosticStartedAt >= DIAGNOSTIC_RETENTION_MS) {
      this.diagnosticExpired = true;
      this.clearDiagnostic();
      this.rows.clear();
    }
    if (this.diagnosticExpired || this.acceptedPayloads >= 2048) return;
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
        fields.set(reading.field, { reading: { ...reading, packetIndex: this.acceptedPayloads }, receivedAt: context.receivedAt });
      }
    }
    this.rows.set(deviceIndex, fields);
    if (this.diagnosticStartedAt === null) {
      this.diagnosticStartedAt = context.now;
      // Fixed deadline: observing/refreshing/exporting never renews retention.
      // eslint-disable-next-line homey-app/global-timers -- clear() cancels on research Stop/account change/app uninit; standalone testable cache.
      this.diagnosticTimer = setTimeout(() => {
        this.diagnosticExpired = true;
        this.clearDiagnostic();
        // The two-minute capture has ended long before this fixed retention deadline.
        this.rows.clear();
      }, DIAGNOSTIC_RETENTION_MS);
      this.diagnosticTimer.unref?.();
    }
    if (!this.diagnosticExpired && context.now - this.diagnosticStartedAt < DIAGNOSTIC_RETENTION_MS) {
      const retained = this.diagnosticRows.get(deviceIndex) || new Map();
      for (const reading of decoded.readings) {
        const previous = retained.get(reading.field);
        if (!previous || context.receivedAt >= previous.receivedAt) {
          retained.set(reading.field, { reading: { ...reading, packetIndex: this.acceptedPayloads }, receivedAt: context.receivedAt });
        }
      }
      this.diagnosticRows.set(deviceIndex, retained);
      this.diagnosticLatestAt = Math.max(this.diagnosticLatestAt, context.receivedAt);
      const checks = this.bankChecks.get(deviceIndex) || new Map();
      for (const check of decoded.bankChecks) {
        const previous = checks.get(check.bank);
        if (previous && context.receivedAt < previous.latest.receivedAt) continue;
        const packet = {
          check,
          packetIndex: this.acceptedPayloads,
          receivedAt: context.receivedAt,
          encodingBasis: context.encodingBasis || 'explicit_zero',
        };
        checks.set(check.bank, {
          latest: packet,
          lastComplete: ['consistent', 'mismatch'].includes(check.status) ? packet : previous?.lastComplete,
        });
      }
      this.bankChecks.set(deviceIndex, checks);
    }
  }

  snapshot(now: number) {
    this.clock(now);
    const devices = [];
    for (const [deviceIndex, fields] of this.rows) {
      const readings = [];
      for (const [field, row] of fields) {
        if (now < row.receivedAt || now - row.receivedAt >= 90000) fields.delete(field);
        else readings.push({ ...row.reading, receivedAgeSec: (now - row.receivedAt) / 1000 });
      }
      if (readings.length) devices.push({ deviceIndex, readings });
    }
    if (this.diagnosticStartedAt !== null && now - this.diagnosticStartedAt >= DIAGNOSTIC_RETENTION_MS) {
      this.diagnosticExpired = true;
      this.clearDiagnostic();
    }
    const retainedDevices = [...this.diagnosticRows].map(([deviceIndex, fields]) => ({
      deviceIndex,
      readings: [...fields.values()].map(({ reading, receivedAt }) => ({ ...reading, receivedAgeSec: (now - receivedAt) / 1000 })),
    }));
    const diagnosticSnapshot = retainedDevices.length && this.diagnosticStartedAt !== null ? {
      kind: 'historical_capture',
      retentionRemainingSec: (DIAGNOSTIC_RETENTION_MS - (now - this.diagnosticStartedAt)) / 1000,
      retainedForSec: (now - this.diagnosticStartedAt) / 1000,
      lastPacketAgeSec: (now - this.diagnosticLatestAt) / 1000,
      simultaneous: false,
      devices: retainedDevices,
      bankChecks: [...this.bankChecks].flatMap(([deviceIndex, checks]) => [...checks.values()].map(({ latest, lastComplete }) => {
        const project = (packet: PacketCheck) => ({
          ...packet.check,
          presentPowerFields: [...packet.check.presentPowerFields],
          ...('phaseValues' in packet.check ? { phaseValues: [...packet.check.phaseValues] } : {}),
          packetIndex: packet.packetIndex,
          receivedAgeSec: (now - packet.receivedAt) / 1000,
          encodingBasis: packet.encodingBasis,
        });
        return {
          deviceIndex, bank: latest.check.bank, latest: project(latest), lastComplete: lastComplete ? project(lastComplete) : null,
        };
      })),
    } : null;
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
      diagnosticSnapshot,
    };
  }
}
