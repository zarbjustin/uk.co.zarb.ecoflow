'use strict';

/** A three-way power state with a dead-band around zero. */
export type PowerState = 'pos' | 'neg' | 'idle';

/**
 * Classify a signed power reading into pos / neg / idle using a symmetric
 * dead-band (default ±5 W) so small fluctuations around zero don't flip state.
 */
export function powerState(power: number, band = 5): PowerState {
  if (power > band) return 'pos';
  if (power < -band) return 'neg';
  return 'idle';
}

/**
 * Decide which "started" trigger (if any) to fire when moving from `prev` to
 * `next`. Fires only when ENTERING an active state (pos/neg) from a DIFFERENT
 * state — so idle→active and active→active(opposite) both fire, but active→idle
 * and the first (anchoring) sample do not. This fixes the 2-state edge bugs where
 * export→idle wrongly fired "import started" and idle→active fired nothing.
 */
export function startedTrigger(
  prev: PowerState | undefined,
  next: PowerState,
  posCard: string,
  negCard: string,
): string | null {
  if (prev === undefined) return null; // first sample only anchors state
  if (next === prev) return null;
  if (next === 'pos') return posCard;
  if (next === 'neg') return negCard;
  return null; // entering idle is not a "started" edge
}
