'use strict';

import { STREAM_5000_POWER_FRESH_MS } from './stream5000Readings';

export const STREAM_5000_PRESENTATION_CAPABILITY = 'stream_5000_reading_status';
export const STREAM_5000_PRESENTATION_STATES = [
  'waiting', 'live', 'last_reported_standby', 'expired', 'disconnected', 'write_failed', 'scope_unverified',
] as const;
// Presentation only: never extend power freshness or feed a number into Energy/Flows.
const LAST_STANDBY_RETENTION_MS = 20 * 60 * 1000;

export class Stream5000BatteryPresentation {
  private standbyAt = 0;
  private powerAt = 0;
  private observedAt = 0;

  reset(): void {
    this.standbyAt = 0; this.powerAt = 0; this.observedAt = 0;
  }

  /** Only a successfully applied, coherent zero + idle delta establishes last standby. */
  observe(values: Record<string, unknown>, at: number, now: number): void {
    const power = 'stream_unit_power_battery_flow';
    if (!(power in values) && !('battery_charging_state' in values)) return;
    if (!Number.isFinite(at) || at <= 0 || at > now || now - at > STREAM_5000_POWER_FRESH_MS
      || at < this.observedAt) return;
    this.observedAt = at;
    this.standbyAt = 0;
    if (power in values) this.powerAt = typeof values[power] === 'number' && Number.isFinite(values[power]) ? at : 0;
    if (values[power] === 0 && values.battery_charging_state === 'idle') this.standbyAt = at;
  }

  snapshot(input: {
    now: number; connectionLimitMs: number; telemetryAt: number; active: boolean;
    live: boolean; seen: boolean; writeFailed: boolean; linked: boolean;
  }): { status: typeof STREAM_5000_PRESENTATION_STATES[number]; lastStandbyAgeSec: number | null; live: boolean; energyUsed: false } {
    const { now } = input;
    if (!Number.isFinite(now) || this.observedAt > now) this.reset();
    if (now - this.standbyAt > Math.min(input.connectionLimitMs, LAST_STANDBY_RETENTION_MS)) this.standbyAt = 0;
    const connected = input.active && input.telemetryAt > 0 && input.telemetryAt <= now
      && now - input.telemetryAt <= input.connectionLimitMs;
    let status: typeof STREAM_5000_PRESENTATION_STATES[number];
    if (input.linked) {
      this.reset(); status = 'scope_unverified';
    } else if (input.writeFailed) {
      this.reset(); status = 'write_failed';
    } else if (!connected) {
      this.reset(); status = input.seen ? 'disconnected' : 'waiting';
    } else if (input.live && this.powerAt > 0 && now - this.powerAt <= STREAM_5000_POWER_FRESH_MS) status = 'live';
    else if (this.standbyAt > 0) status = 'last_reported_standby';
    else status = input.seen ? 'expired' : 'waiting';
    return {
      status,
      lastStandbyAgeSec: this.standbyAt > 0 ? Math.floor((now - this.standbyAt) / 1000) : null,
      live: status === 'live',
      energyUsed: false,
    };
  }
}
