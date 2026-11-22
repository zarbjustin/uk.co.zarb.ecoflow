'use strict';

export const POWER_HISTORY_FIELDS = ['bmsBatteryW', 'bmsChargeW', 'bmsDischargeW', 'gridPortW', 'peerRawW'] as const;
const WINDOW_MS = 300000;
const MAX_PER_FIELD = 16;
type Sample = { value: number; receivedAt: number; appliedAt: number };

/** Re-project hostile getters and fixed fields; stale history is never a live source. */
export function powerHistorySnapshot(input: any, now: number): Record<string, unknown> {
  try {
    const fields = Object.fromEntries(POWER_HISTORY_FIELDS.flatMap((key) => {
      const list = input?.fields?.[key];
      if (!Array.isArray(list)) return [];
      const samples = list.slice(-MAX_PER_FIELD).flatMap((s) => {
        const value = s?.value; const at = s?.receivedAt; const applied = s?.appliedAt;
        if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 100000
          || !Number.isFinite(now) || typeof at !== 'number' || !Number.isFinite(at) || at <= 0 || at > now
          || now - at > WINDOW_MS || typeof applied !== 'number' || !Number.isFinite(applied)
          || applied < at || applied > now || applied - at > 180000) return [];
        return [{
          valueW: value,
          receivedAgeSec: (now - at) / 1000,
          appliedAgeSec: (now - applied) / 1000,
          queueDelaySec: (applied - at) / 1000,
          stale: now - at > 180000,
        }];
      });
      return samples.length ? [[key, samples]] : [];
    }));
    return {
      windowSec: 300,
      maxSamplesPerField: MAX_PER_FIELD,
      fields,
      ordering: 'local_receipt_not_device_time',
      accountingUsed: false,
    };
  } catch {
    return {
      windowSec: 300,
      maxSamplesPerField: MAX_PER_FIELD,
      fields: {},
      ordering: 'local_receipt_not_device_time',
      accountingUsed: false,
    };
  }
}

/** Private fixed-shape copy for passing evidence between internal collectors. */
export function copyPowerHistory(input: any): { fields: Record<string, Sample[]> } {
  try {
    return {
      fields: Object.fromEntries(POWER_HISTORY_FIELDS.flatMap((key) => {
        const list = input?.fields?.[key];
        return Array.isArray(list) ? [[key, list.slice(-MAX_PER_FIELD).map((s) => ({
          value: s.value, receivedAt: s.receivedAt, appliedAt: s.appliedAt,
        }))]] : [];
      })),
    };
  } catch {
    return { fields: {} };
  }
}

/** Bounded session-only diagnostic history. No IDs, persistence or accounting. */
export class StreamPowerHistory {
  private fields: Record<string, Sample[]> = {};

  observe(key: string, value: number, receivedAt: number, appliedAt = Date.now()): void {
    if (!POWER_HISTORY_FIELDS.includes(key as any) || !Number.isFinite(value) || Math.abs(value) > 100000
      || !Number.isFinite(receivedAt) || receivedAt <= 0 || !Number.isFinite(appliedAt)
      || receivedAt > appliedAt || appliedAt - receivedAt > 180000) return;
    if (Object.values(this.fields).some((list) => list.some((s) => s.appliedAt > appliedAt))) this.fields = {};
    const list = (this.fields[key] || []).filter((s) => appliedAt - s.receivedAt <= WINDOW_MS);
    if (receivedAt < (list.at(-1)?.receivedAt || 0)) return;
    const sample = { value, receivedAt, appliedAt };
    // Avoid duplicates at the same receipt, while recording unchanged fresh receipts.
    if (list.at(-1)?.receivedAt === receivedAt) list[list.length - 1] = sample;
    else list.push(sample);
    this.fields[key] = list.slice(-MAX_PER_FIELD);
  }

  snapshot(now = Date.now()): Record<string, unknown> {
    return powerHistorySnapshot({ fields: this.fields }, now);
  }

  evidence(): { fields: Record<string, Sample[]> } {
    return copyPowerHistory({ fields: this.fields });
  }
}
