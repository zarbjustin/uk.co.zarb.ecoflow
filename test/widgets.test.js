'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { streamData } = require('../widgets/stream_common');

function device(id, name) {
  return {
    getId: () => id,
    getName: () => name,
    getAvailable: () => true,
    getCapabilityValue: () => null,
  };
}

function homey(devices) {
  return { drivers: { getDriver: () => ({ getDevices: () => devices }) } };
}

test('streamData selects a stable widget device id with index fallback', () => {
  const devices = [device('one', 'First'), device('two', 'Second')];
  assert.equal(streamData(homey(devices), { deviceId: 'two' }).name, 'Second');
  assert.equal(streamData(homey(devices), { index: '2' }).name, 'Second');
  assert.deepEqual(streamData(homey(devices), { deviceId: 'missing' }), {
    ok: false,
    reason: 'device_not_found',
  });
});
