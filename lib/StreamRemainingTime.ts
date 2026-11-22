'use strict';

export const REMAINING_TIME_CAPS = ['charge_remaining', 'discharge_remaining'] as const;
export const REMAINING_TIME_TTL_MS = 180000;
type Cap = typeof REMAINING_TIME_CAPS[number];
type Entry = { receivedAt: number; appliedAt: number | null; failed: boolean; source: string; value: number | null };

/** Original STREAM estimates: independent receipt ages, not connection freshness.
 * Source scope is explicit; 5939 is not a proven sentinel and remains a valid duration.
 */
export class StreamRemainingTime {
  private entries: Partial<Record<Cap, Entry>> = {};
  private power: { value: number | null; at: number; directionSince: number } | null = null;

  observePower(value: number | null, at: number): void {
    const now = Date.now();
    if (!Number.isFinite(at) || at <= 0 || at > now || now - at > REMAINING_TIME_TTL_MS
      || (this.power && this.power.at <= now && at < this.power.at)) return;
    const previous = this.direction(now);
    const previousSince = this.power?.directionSince;
    this.power = {
      value: typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 100000 ? value : null,
      at,
      directionSince: at,
    };
    if (previous !== 'unavailable' && previous === this.direction(now) && previousSince !== undefined) {
      this.power.directionSince = previousSince;
    }
  }

  private direction(now: number): 'charging' | 'discharging' | 'idle' | 'unavailable' {
    if (!this.power || this.power.value === null || this.power.at > now
      || now - this.power.at > REMAINING_TIME_TTL_MS) return 'unavailable';
    if (this.power.value > 5) return 'charging';
    return this.power.value < -5 ? 'discharging' : 'idle';
  }

  private displayable(cap: Cap, entry: Entry, now: number): boolean {
    return entry.value !== null && entry.receivedAt <= now && now - entry.receivedAt <= REMAINING_TIME_TTL_MS
      && this.power !== null && entry.receivedAt >= this.power.directionSince
      && this.direction(now) === (cap === 'charge_remaining' ? 'charging' : 'discharging');
  }

  reset(): void {
    this.entries = {};
    this.power = null;
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
        value: valid ? value : null,
        source: `${scope === 'unit' ? 'unit_bms' : 'system_cms'}_${transport === 'mqtt' || transport === 'rest' ? transport : 'unknown'}`,
      };
      this.entries[cap] = entry;
      try {
        const show = this.displayable(cap, entry, now);
        await write(cap, show ? entry.value : null);
        if (!active()) return;
        if (show && this.displayable(cap, entry, Date.now())) entry.appliedAt = receivedAt;
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
      if (!entry) continue;
      const show = !entry.failed && this.displayable(cap, entry, Date.now());
      if (show && entry.appliedAt !== null) continue;
      entry.appliedAt = null;
      try {
        await write(cap, show ? entry.value : null);
        if (active() && show && this.displayable(cap, entry, Date.now())) entry.appliedAt = entry.receivedAt;
        else if (show && active()) await write(cap, null);
      } catch {
        entry.failed = true;
      }
    }
  }

  snapshot(now = Date.now()): Record<string, { source: string; ageSec: number | null;
    receivedAgeSec: number | null; stale: boolean; applicationStatus: string; displayReason: string; reportedMinutes: number | null }> {
    return Object.fromEntries(REMAINING_TIME_CAPS.map((cap) => {
      const entry = this.entries[cap];
      const ageSec = entry?.appliedAt != null && entry.appliedAt <= now ? Math.floor((now - entry.appliedAt) / 1000) : null;
      const stale = entry?.appliedAt == null || entry.appliedAt > now
        || now - entry.appliedAt > REMAINING_TIME_TTL_MS || entry.failed === true || !this.displayable(cap, entry, now);
      let applicationStatus = 'applied';
      if (stale) applicationStatus = 'stale';
      if (ageSec === null) applicationStatus = 'unavailable';
      if (entry?.failed) applicationStatus = 'write_failed';
      const fresh = entry && entry.receivedAt <= now && now - entry.receivedAt <= REMAINING_TIME_TTL_MS;
      let displayReason = 'not_reported';
      if (entry) displayReason = fresh ? 'invalid' : 'expired';
      if (fresh && entry.value !== null) {
        const direction = this.direction(now);
        displayReason = direction === 'unavailable' ? 'direction_unavailable' : 'inactive_direction';
        if (direction === (cap === 'charge_remaining' ? 'charging' : 'discharging')
          && this.power && entry.receivedAt < this.power.directionSince) displayReason = 'fresh_estimate_required';
        if (this.displayable(cap, entry, now)) displayReason = 'active_direction';
      }
      if (entry?.failed) displayReason = 'write_failed';
      return [cap, {
        source: entry?.source ?? 'unobserved',
        ageSec,
        receivedAgeSec: entry && entry.receivedAt <= now ? Math.floor((now - entry.receivedAt) / 1000) : null,
        stale,
        applicationStatus,
        displayReason,
        reportedMinutes: fresh ? entry.value : null,
      }];
    }));
  }
}
