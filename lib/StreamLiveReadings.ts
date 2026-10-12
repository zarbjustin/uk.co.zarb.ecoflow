'use strict';

export const STREAM_LIVE_TTL_MS = 180000;
export const STREAM_SYSTEM_LIVE_CAPS = ['measure_power', 'battery_charging_state',
  'measure_power.pv', 'measure_power.pv1', 'measure_power.pv2', 'measure_power.pv3', 'measure_power.pv4',
  'measure_power.grid', 'measure_power.load', 'measure_power.schuko1', 'measure_power.schuko2',
  'measure_power.from_pv', 'measure_power.from_battery', 'measure_power.from_grid'] as const;
export const STREAM_UNIT_LIVE_CAPS = ['stream_unit_power_battery_flow', 'battery_charging_state', 'stream_unit_power_grid', 'stream_unit_power_solar',
  'measure_power.load',
  'stream_unit_power_pv1', 'stream_unit_power_pv2', 'stream_unit_power_pv3', 'stream_unit_power_pv4',
  'stream_unit_power_ac1', 'stream_unit_power_ac2', 'stream_unit_power_from_solar',
  'stream_unit_power_from_battery', 'stream_unit_power_from_grid'] as const;
type Entry = { receivedAt: number; appliedAt: number | null; failed: boolean };

/** Display freshness only. Never integrates watts, changes counters or commands hardware. */
export class StreamLiveReadings {
  private fields: Record<string, Entry> = {};
  private readonly caps: readonly string[];
  constructor(caps: readonly string[]) {
    this.caps = caps;
  }

  tracks(cap: string): boolean {
    return this.caps.includes(cap);
  }

  reset(): void {
    this.fields = {};
  }

  async apply(cap: string, value: unknown, at: number, write: (value: number | string | null) => Promise<void>,
    active: () => boolean): Promise<boolean> {
    const now = Date.now();
    if (!active() || !this.tracks(cap) || !Number.isFinite(at) || at <= 0 || at > now
      || now - at > STREAM_LIVE_TTL_MS) return false;
    const old = this.fields[cap];
    if (old && old.receivedAt <= now && at < old.receivedAt) return false;
    const valid = cap === 'battery_charging_state' ? ['charging', 'discharging', 'idle'].includes(String(value))
      : typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 100000;
    const entry: Entry = { receivedAt: at, appliedAt: null, failed: false };
    this.fields[cap] = entry;
    try {
      await write(valid ? value as number | string : null);
      if (!active()) return false;
      if (valid && at <= Date.now() && Date.now() - at <= STREAM_LIVE_TTL_MS) entry.appliedAt = at;
      else await write(null);
    } catch {
      entry.failed = true;
      if (active()) await write(null).catch(() => {});
    }
    return active() && entry.appliedAt !== null && !entry.failed;
  }

  async expire(write: (cap: string) => Promise<void>, active: () => boolean): Promise<void> {
    for (const [cap, entry] of Object.entries(this.fields)) {
      if (!active()) return;
      if (entry.appliedAt !== null && entry.appliedAt <= Date.now()
        && Date.now() - entry.appliedAt <= STREAM_LIVE_TTL_MS && !entry.failed) continue;
      entry.appliedAt = null;
      await write(cap).catch(() => {
        entry.failed = true;
      });
    }
  }

  snapshot(now = Date.now()): Record<string, { ageSec: number | null; receivedAgeSec: number | null;
    stale: boolean; applicationStatus: string }> {
    return Object.fromEntries(this.caps.map((cap) => {
      const entry = this.fields[cap];
      const ageSec = entry?.appliedAt != null && entry.appliedAt <= now ? Math.floor((now - entry.appliedAt) / 1000) : null;
      const stale = ageSec === null || entry!.failed || now - entry!.appliedAt! > STREAM_LIVE_TTL_MS;
      let applicationStatus = stale ? 'stale' : 'applied';
      if (ageSec === null) applicationStatus = 'unavailable';
      if (entry?.failed) applicationStatus = 'write_failed';
      return [cap, {
        ageSec,
        receivedAgeSec: entry && entry.receivedAt <= now ? Math.floor((now - entry.receivedAt) / 1000) : null,
        stale,
        applicationStatus,
      }];
    }));
  }
}
