'use strict';

/** One running batch and one merged pending batch; no unbounded promise backlog. */
export class CoalescedTelemetryQueue<T> {
  private pending: T | null = null;
  private running: Promise<void> | null = null;
  private stopped = false;
  private coalesced = 0;
  private batches = 0;
  private readonly merge: (old: T, next: T) => T;
  private readonly apply: (batch: T) => Promise<void>;
  constructor(merge: (old: T, next: T) => T, apply: (batch: T) => Promise<void>) {
    this.merge = merge;
    this.apply = apply;
  }

  submit(batch: T): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.pending !== null) {
      this.pending = this.merge(this.pending, batch); this.coalesced++;
    } else this.pending = batch;
    if (!this.running) {
      this.running = Promise.resolve().then(async () => {
        try {
          while (!this.stopped && this.pending !== null) {
            const next = this.pending; this.pending = null; this.batches++;
            try {
              await this.apply(next);
            } catch { /* Optional diagnostics remain isolated. */ }
          }
        } finally {
          this.running = null;
        }
      });
    }
    return this.running;
  }

  stop(): void {
    this.stopped = true; this.pending = null;
  }

  snapshot(): Record<string, number | boolean> {
    return {
      running: this.running !== null,
      pending: this.pending !== null,
      coalesced: this.coalesced,
      batches: this.batches,
      maxPendingBatches: 1,
    };
  }
}
