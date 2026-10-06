'use strict';

/** Covers hourly feeds plus a small delay; not a tariff validity guarantee. */
export const PRICE_MAX_AGE_MS = 90 * 60 * 1000;

export function currentPriceIsFresh(value: unknown, updatedAt: number, now = Date.now()): value is number {
  return typeof value === 'number' && Number.isFinite(value)
    && Number.isFinite(updatedAt) && updatedAt > 0 && now >= updatedAt && now - updatedAt <= PRICE_MAX_AGE_MS;
}
