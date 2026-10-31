import { DualCtDevicePreview } from './dualCtDevicePreview';
import { decodeFrameHeaders } from './streamAc5000Protocol';
import { dualCtEncodingPolicy } from './dualCtEncoding';
import { inspectDualCtCounterRecords } from './dualCtCounters';
import { dualCtFreshAge } from './dualCtContract';
import { dualCtDisplayValue } from './dualCtDisplay';
import { DUAL_CT_PHASE_DISPLAYS, dualCtCircuitRole, DualCtDisplayRoles } from './dualCtPresentation';

type Scope = { account: string; device: string; session: string };
type Counter = { field: number; value: number; receivedAt: number; trend: string };

/** Continuous opt-in monitor, separate from the bounded diagnostic capture.
 * Only a latest-value cache: no history, persistence, energy integration or commands.
 */
export class DualCtMonitor {
  private readonly adapter: DualCtDevicePreview;
  private readonly counters = new Map<number, Counter>();
  private readonly rejections: Record<string, number> = {};
  private lastAt: number | null = null;
  private lastNow: number | null = null;

  constructor(private readonly scope: Scope) {
    this.adapter = new DualCtDevicePreview(scope);
  }

  clear(): void {
    this.adapter.disconnect(); this.counters.clear(); this.lastAt = null; this.lastNow = null;
  }

  getRejectionCounts(): Record<string, number> {
    return { ...this.rejections };
  }

  observe(payload: Buffer, topic: string, receivedAt: number, now = receivedAt): boolean {
    const reject = (reason: string) => {
      this.rejections[reason] = Math.min(65535, (this.rejections[reason] || 0) + 1);
      return false;
    };
    let reason = 'decode_rejected';
    if (topic !== `/app/device/property/${this.scope.device}` || !Buffer.isBuffer(payload)
      || !payload.length || payload.length > 65536 || !Number.isFinite(now) || now <= 0 || !Number.isFinite(receivedAt)
      || receivedAt <= 0 || !dualCtFreshAge(now - receivedAt)) return reject('scope_or_receipt_rejected');
    if (this.lastNow !== null && now < this.lastNow) this.clear();
    this.lastNow = now;
    if (this.lastAt !== null && receivedAt <= this.lastAt) return reject('receipt_order_rejected');
    try {
      const headers = decodeFrameHeaders(payload);
      if (!headers.length || headers.length > 16 || headers.some((header) => header.candidateHeaderValid === false
        || (header.deviceSn && header.deviceSn !== this.scope.device))) return reject('header_rejected');
      for (const header of headers) {
        const policy = dualCtEncodingPolicy(header, 421, 'app_mqtt');
        if (!policy.basis) {
          reason = policy.reason === 'unsupported_encoding' ? 'unsupported_encoding' : 'unrelated_message';
          continue;
        }
        const context = {
          productType: 421,
          cmdFunc: header.cmdFunc,
          cmdId: header.cmdId,
          source: 'app_mqtt',
          encoding: 'plain',
          encodingBasis: policy.basis,
          receivedAt,
          now,
        };
        if (!this.adapter.observe(this.scope, header.pdata!, context)) continue;
        for (const record of inspectDualCtCounterRecords(header.pdata!, context, true)) {
          if (record.parent !== 773) continue; // 997 never inherits the 773 mapping.
          if (record.status !== 'observed') {
            this.counters.clear(); continue;
          }
          for (const row of record.candidates) {
            const old = this.counters.get(row.field);
            const comparable = old && dualCtFreshAge(now - old.receivedAt);
            let trend = 'baseline';
            if (comparable) {
              if (row.value === old.value) trend = 'unchanged';
              else trend = row.value > old.value ? 'increased' : 'decreased';
            }
            this.counters.set(row.field, {
              field: row.field,
              value: row.value,
              receivedAt,
              trend,
            });
          }
        }
        this.lastAt = receivedAt;
        return true;
      }
    } catch {
      return reject('malformed_frame');
    }
    return reject(reason);
  }

  snapshot(now: number, translate: (key: string) => string, roles: DualCtDisplayRoles = {}) {
    if (!Number.isFinite(now) || now < 0 || (this.lastNow !== null && now < this.lastNow)) this.clear();
    if (Number.isFinite(now)) this.lastNow = now;
    const view = this.adapter.snapshot(now);
    const rows = view.banks.flatMap((bank) => bank.readings);
    const ages = rows.filter((row) => row.status === 'recent_receipt').map((row) => 90000 - row.receiptAgeSec! * 1000);
    for (const bank of view.banks) {
      if (bank.phaseSum.receiptAgeSec !== null && dualCtFreshAge(bank.phaseSum.receiptAgeSec * 1000)) {
        ages.push(90000 - bank.phaseSum.receiptAgeSec * 1000);
      }
    }
    const counters = [...this.counters.values()].filter((row) => dualCtFreshAge(now - row.receivedAt));
    ages.push(...counters.map((row) => 90000 - (now - row.receivedAt)));
    let status = this.lastAt === null ? 'waiting' : 'stale';
    if (view.availability === 'recent_receipts_only') status = 'recent';
    const values: Record<string, string | number | null> = {
      dual_ct_preview_status: translate(status),
      dual_ct_preview_age: this.lastAt === null ? null : Math.max(0, (now - this.lastAt) / 1000),
      dual_ct_preview_counters: counters.length
        ? `${translate('counter_warning')} — ${counters.map((row) => `773.${row.field}: ${row.value} (${Math.floor((now - row.receivedAt) / 1000)}s)`).join(' / ')}`
        : translate('missing_stale'),
      dual_ct_preview_trends: counters.length
        ? counters.map((row) => `${row.field}: ${translate(row.trend)} (${Math.floor((now - row.receivedAt) / 1000)}s)`).join(' / ')
        : translate('missing_stale'),
    };
    for (const bank of view.banks) {
      const suffix = bank.bank.toLowerCase();
      values[`dual_ct_preview_total.${suffix}`] = bank.readings.find((row) => row.phase === null)?.value ?? null;
      values[`dual_ct_preview_net.${suffix}`] = bank.phaseSum.value;
      const role = dualCtCircuitRole(suffix === 'a' ? roles.aRole : roles.bRole);
      const age = bank.phaseSum.receiptAgeSec === null ? '' : ` (${Math.floor(bank.phaseSum.receiptAgeSec)}s)`;
      values[`dual_ct_preview_net_status.${suffix}`] = `${translate('role_description')}: ${translate(`role_${role}`)} — ${translate(`sum_${bank.phaseSum.status}`)}${age}`;
      for (const row of bank.readings) {
        const display = DUAL_CT_PHASE_DISPLAYS.find((item) => item.field === row.field);
        if (display) values[display.capability] = row.value;
      }
      for (const quantity of ['power', 'voltage', 'current']) {
        values[`dual_ct_preview_fields.${suffix}_${quantity}`] = bank.readings.filter((row) => row.phase !== null && row.quantity === quantity)
          .map((row) => {
            const value = row.value === null ? translate(row.status === 'stale' ? 'stale_field' : 'missing')
              : dualCtDisplayValue(row.field, row.value, translate('number_locale')) ?? translate('missing');
            const age = row.receiptAgeSec === null ? '' : ` (${Math.floor(row.receiptAgeSec)}s)`;
            return `${translate('phase')} ${row.phase} · ${row.field}: ${value}${age}`;
          }).join('\n');
      }
    }
    return {
      values,
      recent: view.availability === 'recent_receipts_only',
      nextExpiryMs: ages.length ? Math.max(1, Math.ceil(Math.min(...ages))) : null,
    };
  }
}
