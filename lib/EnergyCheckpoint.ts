'use strict';

const CHECKPOINT_MS = 60 * 1000;

/** Coalesce high-frequency energy store writes while allowing an explicit teardown flush. */
export class EnergyCheckpoint {
  private timer: NodeJS.Timeout | null = null;
  private dirty = false;
  private homey: any;
  private persist: () => Promise<void>;

  constructor(homey: any, persist: () => Promise<void>) {
    this.homey = homey;
    this.persist = persist;
  }

  mark(): void {
    this.dirty = true;
    if (this.timer) return;
    this.timer = this.homey.setTimeout(() => {
      this.timer = null;
      this.flush().catch(() => {});
    }, CHECKPOINT_MS);
  }

  async flush(): Promise<void> {
    if (this.timer) {
      this.homey.clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.dirty) return;
    this.dirty = false;
    await this.persist();
  }
}
