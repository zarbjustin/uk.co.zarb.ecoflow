'use strict';

/**
 * Compare a numeric capability value against an above/below threshold. Returns
 * false for non-finite values (e.g. an unset capability), so "price below X" is
 * only true when a real price has been provided.
 */
export function aboveBelow(value: unknown, direction: 'above' | 'below', threshold: number): boolean {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  return direction === 'above' ? value > threshold : value < threshold;
}
