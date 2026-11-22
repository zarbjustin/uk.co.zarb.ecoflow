'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseStreamAc5000Frame } = require('../.homeybuild/lib/streamAc5000Protocol');
const { mapStreamAc5000 } = require('../.homeybuild/lib/streamAc5000Mapping');
const { STREAM_5000_LIVE_CAPABILITIES } = require('../.homeybuild/lib/stream5000Readings');
const core = require('./fixtures/stream5000Es21Core.json');
const captures = require('./fixtures/stream5000Telemetry.json');
const audit = require('./fixtures/stream5000ContractAudit.json');

test('public ES21/ES22 captures do not fabricate time remaining from SOC, BMS, task windows or power', () => {
  const frames = [...core.frames, ...Object.values(captures).flatMap(group => group.frames || []),
    ...Object.values(audit.captures).flatMap(group => group.frames)];
  let decoded = 0;
  for (const frame of frames) {
    if (!frame.hex) continue;
    const telemetry = parseStreamAc5000Frame(Buffer.from(frame.hex, 'hex'));
    if (!telemetry) continue;
    decoded++;
    for (const scope of ['unit', 'system']) {
      const values = mapStreamAc5000(telemetry, { scope });
      assert.equal(Object.hasOwn(values, 'charge_remaining'), false);
      assert.equal(Object.hasOwn(values, 'discharge_remaining'), false);
      assert.equal(Object.keys(values).some(key => /remaining|runtime|duration/i.test(key)), false);
    }
    assert.equal(Object.keys(telemetry).some(key => /remaining|runtime|RemTime/i.test(key)), false);
  }
  assert.ok(decoded >= 15, 'exercise captured core, linked-unit, socket and BMS frames');
});

test('legacy BMS/CMS names and plausible energy estimates cannot leak into either 5000 role', () => {
  for (const scope of ['unit', 'system']) {
    for (const battW of [-250, 0, 250]) {
      const values = mapStreamAc5000({
        socPct: 61, socPrecisePct: 61, battW,
        bmsChgRemTime: 1234, bmsDsgRemTime: 1234, cmsChgRemTime: 1234, cmsDsgRemTime: 1234,
        batteryCapacityWh: 9876, charge_remaining: 1234, discharge_remaining: 1234,
      }, { scope });
      assert.equal(values.charge_remaining, undefined);
      assert.equal(values.discharge_remaining, undefined);
    }
  }
  assert.equal(STREAM_5000_LIVE_CAPABILITIES.some(key => /remaining|runtime/.test(key)), false);
  const manifest = require('../app.json');
  for (const id of ['stream_5000_unit', 'stream_5000_system', 'stream_ac5000']) {
    const capabilities = manifest.drivers.find(driver => driver.id === id).capabilities;
    assert.equal(capabilities.some(key => /remaining|runtime/.test(key)), false);
  }
});
