'use strict';

const CHECKPOINT_MS = 60 * 1000;

/** Coalesce high-frequency energy store writes while allowing an explicit teardown flush. */
export class EnergyCheckpoint {
  private timer: NodeJS.Timeout | null = null;
  private dirty = false;
  private inFlight: Promise<void> | null = null;
  private failures = 0;
  private closed = false;
  private homey: any;
  private persist: () => Promise<void>;

  constructor(homey: any, persist: () => Promise<void>) {
    this.homey = homey;
    this.persist = persist;
  }

  mark(): void {
    if (this.closed) return;
    this.dirty = true;
    this.schedule();
  }

  private schedule(): void {
    if (this.timer || this.closed) return;
    this.timer = this.homey.setTimeout(() => {
      this.timer = null;
      if (this.closed) return;
      this.flush().catch(() => {});
    }, CHECKPOINT_MS);
  }

  async flush(): Promise<void> {
    if (this.timer) {
      this.homey.clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.inFlight) {
      await this.inFlight;
      await this.flush();
      return;
    }
    if (!this.dirty) return;
    this.dirty = false;
    this.inFlight = Promise.resolve().then(() => this.persist()).catch((error) => {
      this.failures += 1;
      this.dirty = true;
      this.schedule();
      throw error;
    }).finally(() => {
      this.inFlight = null;
    });
    await this.inFlight;
  }

  /** Drain accepted work without leaving a retry owned by a retired device. */
  async close(): Promise<void> {
    this.closed = true;
    await this.flush();
  }

  diagnostics(): { pending: boolean; writing: boolean; failures: number } {
    return { pending: this.dirty, writing: this.inFlight !== null, failures: this.failures };
  }
}
