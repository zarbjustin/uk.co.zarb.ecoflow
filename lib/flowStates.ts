'use strict';

export type PowerDirection = -1 | 0 | 1;

export function powerDirection(watts: number, deadband = 5): PowerDirection {
  if (watts > deadband) return 1;
  if (watts < -deadband) return -1;
  return 0;
}

/** Return a newly-started non-idle direction, including transitions out of idle. */
export function startedDirection(previous: PowerDirection | undefined, current: PowerDirection): PowerDirection | null {
  if (previous === undefined || current === 0 || current === previous) return null;
  return current;
}
