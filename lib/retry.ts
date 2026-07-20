'use strict';

export interface RetryOptions {
  /** Total attempts (>=1). */
  attempts: number;
  /** Return true if the error is worth retrying (e.g. transient network/timeout). */
  isRetryable: (error: unknown) => boolean;
  /** Optional backoff (ms) before attempt N+1; receives the 1-based attempt just tried. */
  delayMs?: (attempt: number) => number;
  /** Optional sleeper (injectable for tests); defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => {
  // eslint-disable-next-line homey-app/global-timers
  setTimeout(resolve, ms);
});

/**
 * Run an async function with bounded retries. Retries only while
 * `isRetryable(error)` is true and attempts remain; re-throws otherwise. Pure and
 * injectable (pass `sleep`) so retry policy can be unit-tested without real timers.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const attempts = Math.max(1, opts.attempts);
  const sleep = opts.sleep || defaultSleep;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt >= attempts || !opts.isRetryable(e)) throw e;
      if (opts.delayMs) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(opts.delayMs(attempt));
      }
    }
  }
  throw lastErr;
}
