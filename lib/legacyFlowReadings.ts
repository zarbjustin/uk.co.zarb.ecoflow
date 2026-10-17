/** Session-only receipts for original STREAM Flow observations. Never changes energy or device controls. */
export const LEGACY_FLOW_TTL_MS = 180000;
export const LEGACY_SOLAR_SKEW_MS = 5000;
const MODES = ['self_powered', 'ai', 'scheduled', 'tou'];
const NUMERIC = ['measure_power', 'measure_battery', 'measure_power.grid', 'measure_power.pv', 'measure_power.load'];
type Entry = { value: unknown; at: number };

export function legacyFlowValueValid(cap: string, value: unknown): boolean {
  if (cap === 'operating_mode') return typeof value === 'string' && MODES.includes(value);
  if (cap === 'feed_in_control') return typeof value === 'boolean';
  if (!NUMERIC.includes(cap) || typeof value !== 'number' || !Number.isFinite(value)) return false;
  if (cap === 'measure_battery') return value >= 0 && value <= 100;
  if (['measure_power.pv', 'measure_power.load'].includes(cap)) return value >= 0 && value <= 100000;
  return Math.abs(value) <= 100000;
}

export function assertLegacyThreshold(direction: unknown, value: unknown, max = 100000): void {
  if (typeof direction !== 'string' || !['above', 'below'].includes(direction) || typeof value !== 'number' || !Number.isFinite(value)
    || value < 0 || value > max) throw new Error('legacy_flow_invalid_threshold');
}

export class LegacyFlowReadings {
  private fields = new Map<string, Entry>();

  invalidate(cap: string): void {
    this.fields.delete(cap);
  }

  observe(cap: string, value: unknown, applied: unknown, at: number, now = Date.now()): void {
    if (!Number.isFinite(at) || at <= 0 || at > now || now - at >= LEGACY_FLOW_TTL_MS) return;
    const previous = this.fields.get(cap);
    if (previous && previous.at <= now && at < previous.at) return;
    if (!legacyFlowValueValid(cap, value) || value !== applied) {
      this.invalidate(cap); return;
    }
    this.fields.set(cap, { value, at });
  }

  assert(caps: string[], current: (cap: string) => unknown, coherent = false, now = Date.now()): void {
    const fields = caps.map((cap) => {
      const entry = this.fields.get(cap);
      if (!Number.isFinite(now) || !entry || entry.at > now || now - entry.at >= LEGACY_FLOW_TTL_MS
        || !legacyFlowValueValid(cap, current(cap)) || current(cap) !== entry.value) throw new Error('legacy_flow_readings_unavailable');
      return entry;
    });
    if (coherent && Math.max(...fields.map((entry) => entry.at)) - Math.min(...fields.map((entry) => entry.at)) > LEGACY_SOLAR_SKEW_MS) {
      throw new Error('legacy_flow_readings_incoherent');
    }
  }
}
