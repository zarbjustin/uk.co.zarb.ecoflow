import { dualCtFreshAge } from './dualCtContract';

/** Trapezoid between two observations, split at zero. Caller owns the explicit clock basis. */
export function dualCtPowerIntervalWh(p: number, q: number, elapsed: number) {
  if (![p, q].every((n) => Number.isFinite(n) && Math.abs(n) <= 100000)
    || elapsed <= 0 || !dualCtFreshAge(elapsed)) return null;
  let imported = 0; let exported = 0;
  if (p >= 0 && q >= 0) imported = ((p + q) * elapsed) / 2;
  else if (p <= 0 && q <= 0) exported = (-(p + q) * elapsed) / 2;
  else {
    const firstMs = (elapsed * Math.abs(p)) / (Math.abs(p) + Math.abs(q));
    const first = (Math.abs(p) * firstMs) / 2; const second = (Math.abs(q) * (elapsed - firstMs)) / 2;
    imported = p > 0 ? first : second;
    exported = p < 0 ? first : second;
  }
  return { importedWh: imported / 3600000, exportedWh: exported / 3600000 };
}
