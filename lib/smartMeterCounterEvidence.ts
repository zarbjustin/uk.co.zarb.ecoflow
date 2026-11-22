'use strict';

import { toFiniteNumber } from './quota';

const FRESH_MS = 180000;
type Candidate = { importWh: number; exportWh: number; netWh: number; at: number };

/** Observational BK21 hypothesis only: no counter writes or migration gate. */
export class SmartMeterCounterEvidence {
  private previous: Candidate | null = null;
  private lastAt = 0;
  private status: 'waiting' | 'incomplete' | 'invalid' | 'consistent' | 'counter_decrease' = 'waiting';
  private validRecords = 0;
  private importAdvanceObserved = false;
  private exportAdvanceObserved = false;
  private counterDecreaseObserved = false;

  observe(record: unknown, at: number, now = Date.now()): void {
    if (!Number.isFinite(at) || at <= 0 || at > now || now - at > FRESH_MS || at < this.lastAt) return;
    if (!record || typeof record !== 'object' || Array.isArray(record)) return;
    this.lastAt = at;
    const input = record as Record<string, unknown>;
    // All three values must belong to this record; never merge partial counters.
    const importWh = toFiniteNumber(input.todayActive);
    const exportWh = toFiniteNumber(input.totalReactiveEnergy);
    const netWh = toFiniteNumber(input.totalActiveEnergy);
    if (importWh === undefined || exportWh === undefined || netWh === undefined) {
      this.status = 'incomplete';
      return;
    }
    if (importWh < 0 || exportWh < 0 || Math.abs(importWh - exportWh - netWh) > 1) {
      this.status = 'invalid';
      return;
    }
    this.validRecords += 1;
    const next = {
      importWh, exportWh, netWh, at,
    };
    const decreased = this.previous && (importWh < this.previous.importWh || exportWh < this.previous.exportWh);
    if (decreased) {
      this.counterDecreaseObserved = true;
      this.status = 'counter_decrease';
    } else {
      this.status = 'consistent';
      if (this.previous) {
        this.importAdvanceObserved ||= importWh > this.previous.importWh;
        this.exportAdvanceObserved ||= exportWh > this.previous.exportWh;
      }
    }
    this.previous = next;
  }

  snapshot(now = Date.now()): Record<string, unknown> {
    const ageSec = this.lastAt > 0 && this.lastAt <= now ? (now - this.lastAt) / 1000 : null;
    return {
      status: this.status,
      validRecords: this.validRecords,
      lastRecordAgeSec: ageSec,
      stale: ageSec === null || ageSec > FRESH_MS / 1000,
      importAdvanceObserved: this.importAdvanceObserved,
      exportAdvanceObserved: this.exportAdvanceObserved,
      counterDecreaseObserved: this.counterDecreaseObserved,
      unitsVerified: false,
      midnightBehaviourVerified: false,
      migrationAllowed: false,
    };
  }
}

/** Pure design/replay preview; NOT called by a device's energy accounting. */
export function previewMeterCounterContinuity(existingWh: number, baselineRawWh: number, nextRawWh: number): number | null {
  if (![existingWh, baselineRawWh, nextRawWh].every((value) => Number.isFinite(value) && value >= 0)
    || nextRawWh < baselineRawWh) return null;
  const result = existingWh + (nextRawWh - baselineRawWh);
  return Number.isFinite(result) ? result : null;
}
