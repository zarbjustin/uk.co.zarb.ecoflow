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

function validInterval(powerW: number, dtMs: number): boolean {
  return Number.isFinite(powerW) && Number.isFinite(dtMs) && dtMs > 0 && dtMs <= MAX_GAP_MS;
}

export interface SignedTotals {
  /** Energy accumulated while power was positive (import / charge), in Wh. */
  posWh: number;
  /** Energy accumulated while power was negative (export / discharge), in Wh. */
  negWh: number;
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
 * Integrate a one-directional (always non-negative) power sample, e.g. solar
 * generation. Negative/zero power and invalid intervals add nothing.
 */
export function integratePositivePower(prevWh: number, powerW: number, dtMs: number): number {
  if (!validInterval(powerW, dtMs) || powerW <= 0) return prevWh;
  return prevWh + (powerW * dtMs) / 3_600_000;
}
