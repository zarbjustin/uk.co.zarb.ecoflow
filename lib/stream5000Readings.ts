'use strict';

export const STREAM_5000_LIVE_CAPABILITIES = [
  'measure_battery', 'measure_power', 'stream_unit_power_battery_flow', 'battery_charging_state',
  'measure_power.load', 'measure_power.grid', 'measure_power.grid_import', 'measure_power.grid_export',
  'measure_temperature', 'battery_soh',
  'stream_5000_direct_pv', 'stream_5000_socket_power',
  'stream_unit_power_pv1', 'stream_unit_power_pv2', 'stream_unit_power_pv3', 'stream_unit_power_pv4',
];

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

/** Independent receipt age for each reading; a temperature delta cannot refresh power. */
export class Stream5000ReadingAges {
  private readonly timestamps = new Map<string, number>();

  observe(values: Record<string, unknown>, at: number): void {
    if (!Number.isFinite(at) || at < 0) return;
    for (const [key, value] of Object.entries(values)) {
      if (!STREAM_5000_LIVE_CAPABILITIES.includes(key)) continue;
      if (value === null) this.timestamps.delete(key);
      else if ((typeof value === 'number' && Number.isFinite(value)) || typeof value === 'string') {
        this.timestamps.set(key, at);
      }
    }
  }

  expired(now: number, limitMs: number): string[] {
    return [...this.timestamps].filter(([, at]) => at > now || now - at > limitMs).map(([key]) => key);
  }

  forget(key: string): void {
    this.timestamps.delete(key);
  }

  snapshot(now: number, limitMs: number): Record<string, unknown> {
    return Object.fromEntries([...this.timestamps].map(([key, at]) => [key, {
      ageSec: at > now ? null : Math.floor((now - at) / 1000),
      stale: at > now || now - at > limitMs,
    }]));
  }
}
