'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const A = 'BK61SYNTHETICOLD';
const B = 'BK61SYNTHETICMAIN';
const C = 'BK61SYNTHETICOTHER';
const originalLoad = Module._load;
let Driver;
try {
  Module._load = function load(request, ...args) {
    if (request === 'homey') return { Driver: class { getDevices() { return this.existing; } } };
    if (request === '../../lib/pairing') return {
      registerCredentialHandlers() {},
      clientFromSettings: driver => driver.client,
    };
    return originalLoad.call(this, request, ...args);
  };
  Driver = require('../.homeybuild/drivers/stream/driver');
} finally { Module._load = originalLoad; }

async function harness(existing = []) {
  const driver = new Driver(); driver.existing = existing;
  driver.client = {
    getDeviceList: async () => [{ sn: B, deviceName: 'Synthetic battery' }],
    getMainSn: async () => B,
    getQuotaAll: async () => ({}),
  };
  driver.homey = { drivers: { getDriver: id => id === 'stream' ? driver : { getDevices: () => [] } } };
  const handlers = {};
  await driver.onPair({ setHandler: (name, fn) => { handlers[name] = fn; } });
  return { driver, list: handlers.list_devices };
}

test('aggregate pairing excludes the verified active source of an existing immutable identity', async () => {
  const existing = { getData: () => ({ sn: A }), getAggregateSourceSn: () => B };
  const h = await harness([existing]);
  assert.deepEqual(await h.list(), []);
  assert.equal(existing.getData().sn, A);
});

test('aggregate pairing retains distinct installations and fails closed on unavailable aggregate inventory', async () => {
  const h = await harness([{ getData: () => ({ sn: A }), getAggregateSourceSn: () => C }]);
  assert.equal((await h.list())[0].data.sn, B);
  h.driver.homey.drivers.getDriver = () => { throw Error('synthetic unavailable inventory'); };
  await assert.rejects(h.list(), /inventory/i);
});
