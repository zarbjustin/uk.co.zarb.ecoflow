/** Forecast dates and freshness are independent of EcoFlow telemetry; no persistent cache or API calls. */
export const FORECAST_FLOW_TTL_MS = 6 * 60 * 60 * 1000;

export function localForecastDay(now: number, timeZone: string, offset = 0): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(now));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day') + offset)).toISOString().slice(0, 10);
}

export function sameForecastZone(left: unknown, right: unknown): boolean {
  try {
    if (typeof left !== 'string' || typeof right !== 'string') return false;
    return new Intl.DateTimeFormat('en', { timeZone: left }).resolvedOptions().timeZone
      === new Intl.DateTimeFormat('en', { timeZone: right }).resolvedOptions().timeZone;
  } catch {
    return false;
  }
}

type ForecastEntry = { value: number; at: number; day: string; timeZone: string; context: string };
export class ForecastFlowReadings {
  private fields = new Map<string, ForecastEntry>();

  invalidate(cap: string): void {
    this.fields.delete(cap);
  }

  observe(cap: string, value: unknown, applied: unknown, at: number, day: unknown, timeZone: string, context: string, now = Date.now()): void {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value !== applied
      || !Number.isFinite(at) || at <= 0 || at > now || now - at >= FORECAST_FLOW_TTL_MS
      || day !== localForecastDay(now, timeZone, cap === 'solar_forecast_tomorrow' ? 1 : 0)) {
      this.invalidate(cap); return;
    }
    this.fields.set(cap, {
      value, at, day: String(day), timeZone, context,
    });
  }

  assert(cap: string, value: unknown, timeZone: string, context: string, now = Date.now()): void {
    const row = this.fields.get(cap);
    if (!row || typeof value !== 'number' || !Number.isFinite(value) || row.value !== value || row.context !== context
      || row.timeZone !== timeZone || !Number.isFinite(now) || now < row.at || now - row.at >= FORECAST_FLOW_TTL_MS
      || row.day !== localForecastDay(now, timeZone, cap === 'solar_forecast_tomorrow' ? 1 : 0)) throw new Error('legacy_flow_forecast_unavailable');
  }
}
