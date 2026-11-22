'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('MQTT indirect IPv6 parser rejects oversized multiline zones within a bounded isolated process', () => {
  // GHSA-rxp7-6hxx-x8q5: older releases scan these rejected inputs quadratically.
  // Isolate the check so a dependency regression cannot stall the test runner.
  const result = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const { Address4, Address6 } = require('ip-address');
    assert.equal(Address4.isValid('192.0.2.1'), true);
    assert.equal(Address6.isValid('2001:db8::1'), true);
    assert.equal(Address6.isValid('fe80::1%eth0'), true);
    for (const code of [10, 13, 0x2028, 0x2029]) {
      assert.equal(Address6.isValid('%'.repeat(256 * 1024) + String.fromCharCode(code)), false);
    }
  `], { cwd: path.join(__dirname, '..'), timeout: 5000, encoding: 'utf8', maxBuffer: 4096 });
  assert.equal(result.status, 0, result.error?.code || result.stderr || 'Isolated address validation failed');
});
