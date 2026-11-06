'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

class FakeDevice {
  constructor() { this.values = { onoff: true, measure_power: 500 }; this.data = { sn: 'BK61SYNTHETIC', outlet: 1 }; }
  getData() { return this.data; }
  getCapabilityValue(cap) { return this.values[cap]; }
  async setCapabilityValue(cap, value) { this.values[cap] = value; }
  registerCapabilityListener() {}
  error() {}
}
const originalLoad = Module._load;
let Socket;
try {
  Module._load = function load(request, ...args) {
    if (request === 'homey') return { Device: FakeDevice };
    return originalLoad.call(this, request, ...args);
  };
  Socket = require('../.homeybuild/drivers/stream_socket/device');
} finally { Module._load = originalLoad; }

test('socket telemetry rejects missing and malformed power and non-binary relay values', async () => {
  for (const outlet of [1, 2]) {
    const d = new Socket(); d.data.outlet = outlet;
    await d.onReady();
    const relay = outlet === 1 ? 'relay2Onoff' : 'relay3Onoff';
    const power = outlet === 1 ? 'powGetSchuko1' : 'powGetSchuko2';
    for (const value of [null, '', '  ', 'invalid', {}, [], NaN, Infinity]) {
      await d.applyQuota({ [relay]: value, [power]: value });
      assert.deepEqual(d.values, { onoff: true, measure_power: 500 });
    }
    d.values.onoff = false;
    for (const value of [-1, 2, 'invalid']) {
      await d.applyQuota({ [relay]: value });
      assert.equal(d.values.onoff, false);
    }
    for (const value of [true, 1, '1']) {
      await d.applyQuota({ [relay]: value, [power]: '42.5' });
      assert.equal(d.values.onoff, true);
      assert.equal(d.values.measure_power, 42.5);
    }
    for (const value of [false, 0, '0']) {
      await d.applyQuota({ [relay]: value, [power]: '0' });
      assert.deepEqual(d.values, { onoff: false, measure_power: 0 });
    }
  }
});
