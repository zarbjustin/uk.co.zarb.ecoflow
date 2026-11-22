/** Pure candidate adapter. No Homey object, network, persistence or activation switch.
 * The separate opt-in preview driver consumes it without unlocking verified meter gates.
 */
import { decodeDualCtCandidates, DualCtDecodeContext } from './dualCtDecoder';
import {
  DUAL_CT_BANK_DEFINITIONS, DUAL_CT_FIELD_DEFINITIONS, dualCtReadingTime, dualCtFreshAge,
} from './dualCtContract';
import { DualCtBankCheck } from './dualCtBanks';

type Scope = { account: string; device: string; session: string };
type Reading = { value: number; receivedAt: number };
type PhaseSum = { value: number | null; receivedAt: number; status: 'same_packet' | 'partial' | 'mismatch' };

/** Scope is runtime-only and never projected into diagnostics. Anonymous capture indexes are not device IDs. */
export class DualCtDevicePreview {
  private scope: Scope | null = null;
  private rows = new Map<number, Reading>();
  private phaseSums = new Map<string, PhaseSum>();
  private checks: DualCtBankCheck[] = [];
  private lastReceipt: number | null = null;
  private lastNow: number | null = null;
  private connected = false;

  constructor(scope: Scope) {
    this.replaceScope(scope);
  }

  replaceScope(scope: Scope): boolean {
    this.disconnect(); this.scope = null;
    if (!scope || [scope.account, scope.device, scope.session]
      .some((value) => typeof value !== 'string' || !value.trim() || value.length > 128)) return false;
    this.scope = { account: scope.account, device: scope.device, session: scope.session };
    return true;
  }

  private clock(now: number): boolean {
    if (!Number.isFinite(now) || now < 0) {
      this.disconnect(); return false;
    }
    if (this.lastNow !== null && now < this.lastNow) this.disconnect();
    this.lastNow = now;
    return true;
  }

  observe(scope: Scope, payload: Buffer, context: DualCtDecodeContext): boolean {
    if (!context || !this.scope || !scope
      || scope.account !== this.scope.account || scope.device !== this.scope.device || scope.session !== this.scope.session
      || !this.clock(context.now)
      || (this.lastReceipt !== null && context.receivedAt <= this.lastReceipt)) return false;
    const decoded = decodeDualCtCandidates(payload, context);
    if (!decoded) return false;
    for (const row of decoded.readings) this.rows.set(row.field, { value: row.value, receivedAt: context.receivedAt });
    // Only this decoded payload can establish a sum. Never union latest-per-field values.
    for (const bank of DUAL_CT_BANK_DEFINITIONS) {
      const present = decoded.readings.filter((row) => bank.power.includes(row.field) || row.field === bank.total);
      if (!present.length) continue; // Unrelated voltage/current traffic cannot renew this receipt.
      const power = bank.power.map((field) => present.find((row) => row.field === field));
      const check = decoded.bankChecks.find((row) => row.bank === bank.bank);
      let status: PhaseSum['status'] = 'same_packet';
      if (power.some((row) => !row)) status = 'partial';
      else if (check?.status === 'mismatch') status = 'mismatch';
      const value = status === 'same_packet' ? power.reduce((sum, row) => sum + row!.value, 0) : null;
      this.phaseSums.set(bank.bank, { value, receivedAt: context.receivedAt, status });
    }
    this.checks = decoded.bankChecks; // Coherence belongs to THIS packet, never the per-field cache.
    this.lastReceipt = context.receivedAt; this.connected = true;
    return true;
  }

  disconnect(): void {
    this.rows.clear(); this.phaseSums.clear(); this.checks = []; this.lastReceipt = null; this.lastNow = null; this.connected = false;
  }

  snapshot(now: number) {
    this.clock(now);
    const banks = DUAL_CT_BANK_DEFINITIONS.map((bank) => {
      const sum = this.phaseSums.get(bank.bank);
      const age = sum ? now - sum.receivedAt : null;
      const fresh = age !== null && dualCtFreshAge(age);
      let sumStatus = 'missing';
      if (sum) sumStatus = fresh ? sum.status : 'stale';
      return {
        bank: bank.bank,
        physicalCtPort: null,
        role: 'unverified',
        // Candidate total and phase metrics only. Never sum banks into installation power.
        readings: DUAL_CT_FIELD_DEFINITIONS.filter((field) => field.bank === bank.bank).map((field) => {
          const row = this.rows.get(field.field);
          const time = row ? dualCtReadingTime(row.receivedAt, null, now) : null;
          let status = 'missing';
          if (row) status = time?.valid ? 'recent_receipt' : 'stale';
          return {
            field: field.field,
            phase: field.phase,
            quantity: field.quantity,
            value: time?.valid ? row!.value : null,
            suggestedUnit: field.suggestedUnit,
            unitsVerified: false,
            status,
            timeBasis: row ? 'receipt_only' : null,
            measurementAgeSec: null,
            receiptAgeSec: time?.receiptAgeSec ?? null,
          };
        }),
        latestPacketCheck: this.checks.find((check) => check.bank === bank.bank)?.status || 'missing',
        checkReceiptAgeSec: this.lastReceipt === null ? null : (now - this.lastReceipt) / 1000,
        phaseSum: {
          value: fresh ? sum!.value : null,
          status: sumStatus,
          receiptAgeSec: age !== null && Number.isFinite(age) && age >= 0 ? age / 1000 : null,
          measurementSimultaneityVerified: false,
        },
      };
    });
    const available = banks.some((bank) => bank.readings.some((row) => row.status === 'recent_receipt'));
    let availability = 'disconnected';
    if (this.connected) availability = available ? 'recent_receipts_only' : 'stale';
    return {
      adapterStatus: 'disabled_read_only_rehearsal',
      availability,
      banks,
      measurementTimestampKnown: false,
      bankToPortMappingVerified: false,
      directionVerified: false,
      hardwareValidated: false,
      pairingEnabled: false,
      appliedCapabilities: [] as string[],
      proposedMetrics: DUAL_CT_FIELD_DEFINITIONS.map((row) => ({
        bank: row.bank, phase: row.phase, quantity: row.quantity, suggestedUnit: row.suggestedUnit,
      })),
      contributesToEnergy: false,
      controlsEnabled: false,
      combinedGridW: null,
    };
  }
}
