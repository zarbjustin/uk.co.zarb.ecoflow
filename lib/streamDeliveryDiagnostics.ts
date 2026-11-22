'use strict';

const SOURCES = ['mqtt', 'rest'] as const;
const COUNTS = ['queued', 'started', 'completed', 'failed', 'skipped', 'pending', 'running', 'dropped'] as const;
const TIMES = ['lastQueuedAt', 'lastStartedAt', 'lastCompletedAt', 'lastFailedAt'] as const;

/** Consumer callbacks and processing only; never proof of broker delivery or valid readings. */
export function streamDeliverySnapshot(input: any, now: number): Record<string, unknown> {
  const result: Record<string, unknown> = { scope: 'consumer_queue', completionIsReadingAcceptance: false };
  for (const source of SOURCES) {
    const row = input?.[source];
    result[source] = Object.fromEntries([
      ['accountingIncomplete', row?.dropped > 0 || row?.failed > 0],
      ...COUNTS.map((key) => [key, Number.isSafeInteger(row?.[key]) && row[key] >= 0 && row[key] <= 65535 ? row[key] : 0]),
      ...TIMES.map((key) => [key.replace(/At$/, 'AgeSec'), typeof row?.[key] === 'number'
        && Number.isFinite(row[key]) && row[key] > 0 && row[key] <= now ? Math.floor((now - row[key]) / 1000) : null]),
    ]);
  }
  return result;
}

export class StreamDeliveryDiagnostics {
  private rows = Object.fromEntries(SOURCES.map((source) => [source, Object.fromEntries(COUNTS.map((key) => [key, 0]))]));

  queued(source: 'mqtt' | 'rest', now: number): void {
    const row = this.rows[source];
    row.queued = Math.min(65535, row.queued + 1);
    row.pending = Math.min(65535, row.pending + 1);
    row.lastQueuedAt = now;
  }

  dropped(source: 'mqtt' | 'rest'): void {
    const row = this.rows[source];
    row.pending = Math.max(0, row.pending - 1);
    row.dropped = Math.min(65535, row.dropped + 1);
  }

  async run(source: 'mqtt' | 'rest', work: () => Promise<boolean>): Promise<void> {
    const row = this.rows[source];
    row.pending = Math.max(0, row.pending - 1);
    row.running = Math.min(65535, row.running + 1);
    row.started = Math.min(65535, row.started + 1);
    row.lastStartedAt = Date.now();
    try {
      const completed = await work();
      const key = completed ? 'completed' : 'skipped';
      row[key] = Math.min(65535, row[key] + 1);
      if (completed) row.lastCompletedAt = Date.now();
    } catch (error) {
      row.failed = Math.min(65535, row.failed + 1);
      row.lastFailedAt = Date.now();
      throw error;
    } finally {
      row.running = Math.max(0, row.running - 1);
    }
  }

  /** Internal timestamps are reprojected again at the export boundary. */
  evidence() {
    return Object.fromEntries(SOURCES.map((source) => [source, {
      ...this.rows[source],
      accountingIncomplete: this.rows[source].dropped > 0 || this.rows[source].failed > 0,
    }]));
  }
}
