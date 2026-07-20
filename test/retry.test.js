'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { withRetry } = require('../.homeybuild/lib/retry.js');

const noSleep = async () => {};

test('returns on first success without retrying', async () => {
  let calls = 0;
  const r = await withRetry(async () => { calls += 1; return 'ok'; }, { attempts: 3, isRetryable: () => true, sleep: noSleep });
  assert.strictEqual(r, 'ok');
  assert.strictEqual(calls, 1);
});

test('retries a retryable error up to the attempt limit, then succeeds', async () => {
  let calls = 0;
  const r = await withRetry(async () => {
    calls += 1;
    if (calls < 3) throw new Error('transient');
    return 'ok';
  }, { attempts: 3, isRetryable: () => true, sleep: noSleep });
  assert.strictEqual(r, 'ok');
  assert.strictEqual(calls, 3);
});

test('does NOT retry a non-retryable error', async () => {
  let calls = 0;
  await assert.rejects(() => withRetry(async () => {
    calls += 1;
    throw new Error('fatal');
  }, { attempts: 3, isRetryable: () => false, sleep: noSleep }), /fatal/);
  assert.strictEqual(calls, 1);
});

test('throws the last error after exhausting attempts', async () => {
  let calls = 0;
  await assert.rejects(() => withRetry(async () => {
    calls += 1;
    throw new Error('attempt ' + calls);
  }, { attempts: 2, isRetryable: () => true, sleep: noSleep }), /attempt 2/);
  assert.strictEqual(calls, 2);
});

test('delayMs is consulted between attempts', async () => {
  const delays = [];
  let calls = 0;
  await withRetry(async () => {
    calls += 1;
    if (calls < 3) throw new Error('x');
    return 1;
  }, { attempts: 3, isRetryable: () => true, delayMs: (a) => a * 100, sleep: async (ms) => { delays.push(ms); } });
  assert.deepStrictEqual(delays, [100, 200]);
});

