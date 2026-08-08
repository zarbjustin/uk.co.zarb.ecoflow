'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { appMqttClientId } = require('../.homeybuild/lib/appMqttClientId.js');

const USER_ID = '9876543210';

test('appMqttClientId produces the WEB_ ClientID EcoFlow expects', () => {
  const now = 1770000000000;
  const id = appMqttClientId(USER_ID, now);
  const parts = id.split('_');
  assert.strictEqual(parts.length, 6);
  assert.strictEqual(parts[0], 'WEB');
  assert.match(parts[1], /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.strictEqual(parts[2], USER_ID);
  assert.match(parts[3], /^[0-9a-f]{32}$/); // appKey
  assert.strictEqual(parts[4], String(now));
  assert.match(parts[5], /^[0-9A-F]{32}$/); // MD5 verify hash, uppercase
});

test('the verify hash covers the base, the timestamp and the app secret', () => {
  const now = 1770000000000;
  const id = appMqttClientId(USER_ID, now);
  const parts = id.split('_');
  const base = `WEB_${parts[1]}_${USER_ID}`;
  // The hash must not be reproducible from public parts alone — it depends on
  // the (public, per-appKey) secret from the table.
  const withoutSecret = crypto.createHash('md5').update(`${base}${now}`, 'utf8').digest('hex').toUpperCase();
  assert.notStrictEqual(parts[5], withoutSecret);
});

test('a fresh ClientID is produced on every call', () => {
  const now = 1770000000000;
  const ids = new Set();
  for (let i = 0; i < 25; i += 1) ids.add(appMqttClientId(USER_ID, now));
  // The broker refuses a reused ClientID, so uniqueness matters even within
  // the same millisecond.
  assert.strictEqual(ids.size, 25);
});
