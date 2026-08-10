'use strict';

/**
 * Shared, reset-proof energy integration helpers.
 *
 * The EcoFlow STREAM open API does not expose lifetime cumulative energy
 * counters over REST (accuChgEnergy/accuDsgEnergy and friends come back empty),
 * so cumulative kWh for the Homey Energy dashboard must be derived locally by
 * integrating instantaneous power over time. Homey requires cumulative
 * `meter_power` values to be monotonic (never decrease), which these helpers
 * guarantee.
 */

/** Maximum sample gap to integrate over; longer gaps (downtime, clock jumps) are ignored. */
export const MAX_GAP_MS = 60 * 60 * 1000; // 1 hour

/**
 * Decide how to account battery energy for a quota sample, avoiding the
 * cross-mode double-count (device `accu*Energy` counters vs REST power
 * integration). Once counters have EVER been seen (`countersAvailable`) they are
 * authoritative and power is never integrated again.
 *  - 'counter'   → this sample carries counters; advance from them.
 *  - 'skip'      → counters are the source but this sample has none; do nothing.
 *  - 'integrate' → counters never seen; integrate power as the fallback.
 */
export function batteryEnergyMode(hasCounters: boolean, countersAvailable: boolean): 'counter' | 'skip' | 'integrate' {
  if (hasCounters) return 'counter';
  if (countersAvailable) return 'skip';
  return 'integrate';
}

function validInterval(powerW: number, dtMs: number): boolean {
  return Number.isFinite(powerW) && Number.isFinite(dtMs) && dtMs > 0 && dtMs <= MAX_GAP_MS;
}

export interface SignedTotals {
  /** Energy accumulated while power was positive (import / charge), in Wh. */
  posWh: number;
  /** Energy accumulated while power was negative (export / discharge), in Wh. */
  negWh: number;
}

export interface TimedSignedTotals extends SignedTotals {
  /** Timestamp of the most recent valid power sample. Runtime-only; never persisted. */
  lastSampleAt: number;
}

/**
 * Integrate a signed power sample into two monotonic buckets:
 *  - positive power → `posWh` (e.g. grid import, battery charge)
 *  - negative power → `negWh` (e.g. grid export, battery discharge)
 */
export function integrateSignedPower(prev: SignedTotals, powerW: number, dtMs: number): SignedTotals {
  if (!validInterval(powerW, dtMs)) return { posWh: prev.posWh, negWh: prev.negWh };
  const wh = (Math.abs(powerW) * dtMs) / 3_600_000;
  return powerW >= 0
    ? { posWh: prev.posWh + wh, negWh: prev.negWh }
    : { posWh: prev.posWh, negWh: prev.negWh + wh };
}

/**
 * Integrate a timestamped signed-power sample and always re-anchor after a long
 * gap or backwards clock adjustment. The first sample establishes the anchor
 * without inventing energy for time before the app observed the device.
 */
export function integrateTimedSignedPower(
  prev: TimedSignedTotals,
  powerW: number,
  sampleAt: number,
): TimedSignedTotals {
  if (!Number.isFinite(powerW) || !Number.isFinite(sampleAt) || sampleAt <= 0) return { ...prev };
  if (prev.lastSampleAt <= 0 || sampleAt < prev.lastSampleAt) {
    return { ...prev, lastSampleAt: sampleAt };
  }
  if (sampleAt === prev.lastSampleAt) return { ...prev };
  const next = integrateSignedPower(prev, powerW, sampleAt - prev.lastSampleAt);
  return { ...next, lastSampleAt: sampleAt };
}

/**
 * Integrate a one-directional (always non-negative) power sample, e.g. solar
 * generation. Negative/zero power and invalid intervals add nothing.
 */
export function integratePositivePower(prevWh: number, powerW: number, dtMs: number): number {
  if (!validInterval(powerW, dtMs) || powerW <= 0) return prevWh;
  return prevWh + (powerW * dtMs) / 3_600_000;
}

/**
 * Track a device-reported cumulative counter that may reset to 0 (e.g. on a
 * firmware update) and produce a strictly monotonic total. The first sample only
 * anchors `lastRaw` (no jump). A decrease is treated as a reset and the new raw
 * value is counted from zero.
 *
 * @param prevTotalWh  the monotonic total so far (Wh)
 * @param lastRawWh    the previous raw counter value, or undefined on first call
 * @param rawWh        the current raw counter value (Wh)
 */
export function followResettableCounter(
  prevTotalWh: number,
  lastRawWh: number | undefined,
  rawWh: number,
): { totalWh: number; lastRawWh: number } {
  if (!Number.isFinite(rawWh) || rawWh < 0) {
    return { totalWh: prevTotalWh, lastRawWh: lastRawWh ?? 0 };
  }
  if (lastRawWh === undefined) {
    return { totalWh: prevTotalWh, lastRawWh: rawWh };
  }
  const delta = rawWh >= lastRawWh ? rawWh - lastRawWh : rawWh;
  return { totalWh: prevTotalWh + delta, lastRawWh: rawWh };
}
