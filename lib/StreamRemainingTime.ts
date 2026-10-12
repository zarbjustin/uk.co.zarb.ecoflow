'use strict';

export const REMAINING_TIME_CAPS = ['charge_remaining', 'discharge_remaining'] as const;
export const REMAINING_TIME_TTL_MS = 180000;
type Cap = typeof REMAINING_TIME_CAPS[number];
type Entry = { receivedAt: number; appliedAt: number | null; failed: boolean; source: string };

/** Original STREAM estimates: independent receipt ages, not connection freshness.
 * Source scope is explicit; 5939 is not a proven sentinel and remains a valid duration.
 */
export class StreamRemainingTime {
  private entries: Partial<Record<Cap, Entry>> = {};

  reset(): void {
    this.entries = {};
  }

  async apply(quota: Record<string, unknown>, scope: 'unit' | 'system', receivedAt: number,
    transport: string, write: (cap: Cap, value: number | null) => Promise<void>, active: () => boolean): Promise<void> {
    const now = Date.now();
    if (!active() || !Number.isFinite(receivedAt) || receivedAt <= 0 || receivedAt > now
      || now - receivedAt > REMAINING_TIME_TTL_MS) return;
    for (const cap of REMAINING_TIME_CAPS) {
      const key = `${scope === 'unit' ? 'bms' : 'cms'}${cap === 'charge_remaining' ? 'Chg' : 'Dsg'}RemTime`;
      if (!Object.prototype.hasOwnProperty.call(quota, key) || !active()) continue;
      const previous = this.entries[cap];
      // A prior receipt in the future is invalid after a wall-clock rollback.
      // Permit a genuinely new current receipt to recover, not an old queued packet.
      if (previous && previous.receivedAt <= now && receivedAt < previous.receivedAt) continue;
      const raw = quota[key];
      let value = NaN;
      if (typeof raw === 'number') value = raw;
      else if (typeof raw === 'string' && raw.trim()) value = Number(raw);
      const valid = Number.isFinite(value) && value >= 0;
      const entry: Entry = {
        receivedAt,
        appliedAt: null,
        failed: false,
        source: `${scope === 'unit' ? 'unit_bms' : 'system_cms'}_${transport === 'mqtt' || transport === 'rest' ? transport : 'unknown'}`,
      };
      this.entries[cap] = entry;
      try {
        await write(cap, valid ? value : null);
        if (!active()) return;
        if (valid && Date.now() >= receivedAt && Date.now() - receivedAt <= REMAINING_TIME_TTL_MS) entry.appliedAt = receivedAt;
      } catch {
        entry.failed = true;
      }
    }
    await this.expire(write, active);
  }

  async expire(write: (cap: Cap, value: number | null) => Promise<void>, active: () => boolean): Promise<void> {
    for (const cap of REMAINING_TIME_CAPS) {
      if (!active()) return;
      const entry = this.entries[cap];
      if (!entry || (entry.appliedAt !== null && entry.appliedAt <= Date.now()
        && Date.now() - entry.appliedAt <= REMAINING_TIME_TTL_MS && !entry.failed)) continue;
      entry.appliedAt = null;
      try {
        await write(cap, null);
      } catch {
        entry.failed = true;
      }
    }
  }

  snapshot(now = Date.now()): Record<string, { source: string; ageSec: number | null;
    receivedAgeSec: number | null; stale: boolean; applicationStatus: string }> {
    return Object.fromEntries(REMAINING_TIME_CAPS.map((cap) => {
      const entry = this.entries[cap];
      const ageSec = entry?.appliedAt != null && entry.appliedAt <= now ? Math.floor((now - entry.appliedAt) / 1000) : null;
      const stale = entry?.appliedAt == null || entry.appliedAt > now
        || now - entry.appliedAt > REMAINING_TIME_TTL_MS || entry.failed === true;
      let applicationStatus = 'applied';
      if (stale) applicationStatus = 'stale';
      if (ageSec === null) applicationStatus = 'unavailable';
      if (entry?.failed) applicationStatus = 'write_failed';
      return [cap, {
        source: entry?.source ?? 'unobserved',
        ageSec,
        receivedAgeSec: entry && entry.receivedAt <= now ? Math.floor((now - entry.receivedAt) / 1000) : null,
        stale,
        applicationStatus,
      }];
    }));
  }
}
