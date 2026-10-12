'use strict';

export const STREAM_5000_LIVE_CAPABILITIES = [
  'measure_battery', 'measure_power', 'stream_unit_power_battery_flow', 'battery_charging_state',
  'measure_power.load', 'measure_power.grid', 'measure_power.grid_import', 'measure_power.grid_export',
  'measure_temperature', 'battery_soh',
  'stream_5000_direct_pv', 'stream_5000_socket_power',
  'stream_unit_power_pv1', 'stream_unit_power_pv2', 'stream_unit_power_pv3', 'stream_unit_power_pv4',
];

export const STREAM_5000_POWER_FRESH_MS = 180000;

/** Connection timeout is not permission to display minutes-old watt readings. */
export function stream5000ReadingLimitMs(key: string, connectionLimitMs: number): number {
  const power = key === 'measure_power' || key.startsWith('measure_power.')
    || key.startsWith('stream_unit_power_') || key === 'battery_charging_state'
    || key === 'stream_5000_direct_pv' || key === 'stream_5000_socket_power';
  return power ? Math.min(connectionLimitMs, STREAM_5000_POWER_FRESH_MS) : connectionLimitMs;
}

/** Separate from BK's writable settings. These are observations, never commands. */
export const STREAM_5000_CONFIGURATION_CAPABILITIES: Readonly<Record<string, string>> = {
  mode: 'stream_5000_mode',
  maxChargeSocPct: 'stream_5000_charge_limit',
  minDischargeSocPct: 'stream_5000_discharge_limit',
  backupReservePct: 'stream_5000_backup_reserve',
  maxGridInputW: 'stream_5000_grid_input_limit',
  maxGridOutputW: 'stream_5000_grid_output_limit',
};

export function stream5000ConfigurationValues(snapshot: any): Record<string, number | string | null> {
  const values: Record<string, number | string | null> = {};
  for (const [field, capability] of Object.entries(STREAM_5000_CONFIGURATION_CAPABILITIES)) {
    const entry = snapshot?.values?.[field];
    const numericMax = field.endsWith('Pct') ? 100 : 100000;
    const valid = field === 'mode' ? ['self_powered', 'intelligent_plus', 'custom'].includes(entry?.value)
      : typeof entry?.value === 'number' && Number.isFinite(entry.value) && entry.value >= 0 && entry.value <= numericMax;
    values[capability] = entry?.stale === false && valid ? entry.value : null;
  }
  return values;
}

/** Receipt and successful application are separate; unrelated deltas cannot refresh power. */
export class Stream5000ReadingAges {
  private readonly timestamps = new Map<string, number>();
  private readonly received = new Map<string, number>();
  private readonly writeFailures = new Set<string>();

  canApply(key: string, at: number, now: number, limitMs: number): boolean {
    // A wall-clock rollback invalidates the old epoch, not the next fresh packet.
    // Reject future queued packets. Retain the old applied stamp as stale until
    // a new-epoch write succeeds; do not revive it on a clock change.
    if (Number.isFinite(at) && at > 0 && Number.isFinite(now) && at <= now
      && (this.received.get(key) ?? 0) > now) this.received.delete(key);
    return STREAM_5000_LIVE_CAPABILITIES.includes(key) && Number.isFinite(at) && at > 0
      && Number.isFinite(now) && at <= now && at >= (this.received.get(key) ?? 0)
      && now - at <= stream5000ReadingLimitMs(key, limitMs);
  }

  /** An attempted receipt is not a successfully applied Homey reading. */
  receive(key: string, at: number): void {
    if (STREAM_5000_LIVE_CAPABILITIES.includes(key) && Number.isFinite(at) && at >= 0
      && at >= (this.received.get(key) ?? 0)) this.received.set(key, at);
  }

  failed(key: string, at?: number): void {
    if (!STREAM_5000_LIVE_CAPABILITIES.includes(key)) return;
    if (at !== undefined) {
      if (!Number.isFinite(at) || at < 0 || at < (this.received.get(key) ?? 0)) return;
      this.receive(key, at);
    }
    this.writeFailures.add(key);
  }

  hasWriteFailures(): boolean {
    return this.writeFailures.size > 0;
  }

  /** Call only after the capability write succeeds (or its value already matches). */
  observe(values: Record<string, unknown>, at: number): void {
    if (!Number.isFinite(at) || at < 0) return;
    for (const [key, value] of Object.entries(values)) {
      if (!STREAM_5000_LIVE_CAPABILITIES.includes(key)) continue;
      if (value !== null && !(typeof value === 'number' && Number.isFinite(value)) && typeof value !== 'string') continue;
      if (at < (this.received.get(key) ?? 0)) continue;
      this.receive(key, at);
      this.writeFailures.delete(key);
      if (value === null) this.timestamps.delete(key);
      else if ((typeof value === 'number' && Number.isFinite(value)) || typeof value === 'string') {
        this.timestamps.set(key, at);
      }
    }
  }

  expired(now: number, limitMs: number): string[] {
    return [...new Set([...this.writeFailures, ...[...this.timestamps]
      .filter(([key, at]) => at > now || now - at > stream5000ReadingLimitMs(key, limitMs))
      .map(([key]) => key)])];
  }

  forget(key: string): void {
    this.timestamps.delete(key);
    this.received.delete(key);
    this.writeFailures.delete(key);
  }

  snapshot(now: number, limitMs: number): Record<string, unknown> {
    return Object.fromEntries([...this.received].map(([key, receivedAt]) => {
      const at = this.timestamps.get(key);
      const stale = at === undefined || at > now || now - at > stream5000ReadingLimitMs(key, limitMs);
      let applicationStatus = stale ? 'stale' : 'applied';
      if (at === undefined) applicationStatus = 'unavailable';
      if (this.writeFailures.has(key)) applicationStatus = 'write_failed';
      return [key, {
        ageSec: at === undefined || at > now ? null : Math.floor((now - at) / 1000),
        receivedAgeSec: receivedAt > now ? null : Math.floor((now - receivedAt) / 1000),
        stale: stale || this.writeFailures.has(key),
        applicationStatus,
      }];
    }));
  }
}
