'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fields, config, taskLists, socketBalances, audit } = require('./helpers/stream5000ContractAudit');
const captures = require('./fixtures/stream5000ContractAudit.json');
const { decodeFrameHeaders, parseStreamAc5000Frame } = require('../.homeybuild/lib/streamAc5000Protocol');
const { supportedStream5000Models } = require('../.homeybuild/lib/stream5000Models');
const { stream5000TelemetryAdapter } = require('../.homeybuild/lib/stream5000Adapters');
const app = require('../app.json');

test('contract audit pins public masked upstream captures, not local credentials or synthetic hardware evidence', () => {
  assert.equal(captures.provenance.commit, '6f3c327fcd3bc2cdd22b7c006bb4d19607ef7e61');
  assert.equal(captures.provenance.license, 'MIT');
  assert.match(captures.provenance.notice, /Public masked captures only/);
  assert.equal(audit().fixtureFrameCount, 31);
  for (const group of Object.values(captures.captures)) {
    assert.match(group.source, /^tests\/fixtures\/stream_ac5000\//);
    assert.match(group.sourceBlobSha, /^[a-f0-9]{40}$/);
    for (const frame of group.frames) {
      assert.match(frame.hex, /^(?:[a-f0-9]{2})+$/);
      if (frame.size !== undefined) assert.equal(Buffer.from(frame.hex, 'hex').length, frame.size);
      const headers = decodeFrameHeaders(Buffer.from(frame.hex, 'hex'));
      assert.ok(headers.length > 0);
      for (const header of headers) {
        if (header.deviceSn) assert.match(header.deviceSn, /^X+$/);
      }
    }
  }
});

test('independent wire inspection rejects truncated, oversized and unsupported fields', () => {
  for (const bytes of [[255], [18, 4, 0], [0], [15], [13, 0], Array(11).fill(255)]) {
    assert.throws(() => fields(Buffer.from(bytes)), RangeError);
  }
  assert.deepEqual(fields(Buffer.from([8, 0])), [{ number: 1, wire: 0, value: 0 }]);
  assert.deepEqual(fields(Buffer.from([18, 0])), [{ number: 2, wire: 2, value: Buffer.alloc(0) }]);
});

test('ES22 grid-input writes target only f10.2; the output companions must not be copied', () => {
  const frames = captures.captures.es22GridInputWrites.frames;
  const writes = frames.filter((_frame, index) => index % 2 === 0);
  assert.deepEqual(writes.map((frame) => config(frame, '254/38')), [
    [{ 2: 1200 }], [{ 2: 2200 }], [{ 2: 2600 }], [{ 2: 2500 }],
  ]);
  for (const frame of writes) {
    const header = decodeFrameHeaders(Buffer.from(frame.hex, 'hex'))[0];
    assert.equal(header.cmdFunc, 254);
    assert.equal(header.cmdId, 38, 'never use the original BK command id 17');
    assert.equal(parseStreamAc5000Frame(Buffer.from(frame.hex, 'hex')), null,
      'a write is not a telemetry readback');
  }
});

test('ES22 acknowledgements do not masquerade as configuration telemetry or prove the input ceiling', () => {
  const acknowledgements = captures.captures.es22GridInputWrites.frames.filter((_frame, index) => index % 2 === 1);
  assert.equal(acknowledgements.length, 4);
  for (const frame of acknowledgements) {
    assert.deepEqual(config(frame), []);
    assert.equal(parseStreamAc5000Frame(Buffer.from(frame.hex, 'hex')), null);
  }
  assert.ok(supportedStream5000Models().every((model) => model.monitoringOnly));
});

test('ES22 independent settings readback confirms 1800 W input and unchanged 800 W output', () => {
  const frame = captures.captures.es22GridInputReadback.frames[0];
  const [readback] = config(frame);
  assert.equal(readback[1], 800);
  assert.equal(readback[2], 1800);
  assert.equal(readback[6], 800, 'output ceiling is separate from input power');
  const telemetry = parseStreamAc5000Frame(Buffer.from(frame.hex, 'hex'));
  assert.ok(telemetry, 'unsupported configuration must not break recognised telemetry');
  assert.equal(telemetry.maxGridInputPowerW, undefined, 'research inspection is not runtime feature support');
});

test('ES21 output write and readback are corroborated, without claiming ES21 input-control acceptance', () => {
  const frames = captures.captures.es21OutputWrites.frames;
  assert.deepEqual(config(frames[1], '254/38'), [{ 1: 1000, 4: 21, 5: 800 }]);
  assert.deepEqual(config(frames[2]), [{ 1: 1000 }]);
  assert.deepEqual(config(frames[3], '254/38'), [{ 1: 2000, 4: 21, 5: 800 }]);
  assert.equal(config(frames[2])[0][2], undefined, 'output evidence is not an input-limit experiment');
  assert.ok(parseStreamAc5000Frame(Buffer.from(frames[2].hex, 'hex')));
});

test('scheduled tasks preserve repeated blocks, target SOC, slots and overnight windows', () => {
  const [tasks] = taskLists(captures.captures.es22Tasks.frames[0]);
  assert.deepEqual(tasks, [
    { slot: 1, enabled: true, startMinute: 180, endMinute: 1020, chargeW: 1800, chargeTargetSoc: 100 },
    { slot: 2, enabled: true, startMinute: 1080, endMinute: 120, dischargeW: 1400 },
  ]);
  assert.equal(tasks[0].dischargeW, undefined);
  assert.equal(tasks[1].chargeW, undefined);
});

test('an explicitly present zero-watt charge task is not missing or inherited from its neighbour', () => {
  const [tasks] = taskLists(captures.captures.es22Tasks.frames[1]);
  assert.equal(tasks[0].chargeW, 0);
  assert.equal(tasks[0].chargeTargetSoc, 100);
  assert.equal(tasks[1].dischargeW, 297);
  assert.equal(tasks[0].dischargeW, undefined);
});

test('task deletion is a whole-list replacement; absent deltas and acknowledgements do not clear it', () => {
  const frames = captures.captures.es22TaskDeletion.frames;
  const byRole = (role) => frames.find((frame) => frame.role === role);
  assert.equal(taskLists(byRole('both_tasks_push'))[0].length, 2);
  assert.equal(taskLists(byRole('stale_get_reply_after_delete'))[0].length, 2,
    'an older snapshot may still contain the deleted task');
  for (const role of ['after_delete_get_reply', 'after_delete_push']) {
    const [tasks] = taskLists(byRole(role));
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].chargeW, 2500);
    assert.equal(tasks[0].dischargeW, undefined);
  }
  assert.equal(taskLists(byRole('no_task_list_push')), undefined);
  assert.equal(taskLists(byRole('delete_ack')), undefined);
  const [replacement] = taskLists(byRole('after_own_write_push'));
  assert.equal(replacement.length, 1);
  assert.equal(replacement[0].dischargeW, 0);
});

test('socket inspector independently reproduces 44–45 W battery discharge with no runtime discrepancy', () => {
  const samples = socketBalances();
  assert.deepEqual(samples.map((sample) => sample.expectedBatteryW), [-44, -45, -45, -45]);
  for (const sample of samples) {
    assert.equal(sample.discrepancyW, sample.runtimeBatteryW - sample.expectedBatteryW);
    assert.equal(sample.batteryToSocketW, -sample.expectedBatteryW);
    assert.equal(sample.discrepancyW, 0);
  }
  // Expected balance remains independent of the runtime field map.
});

test('both admitted models stay monitoring-only, with exactly one Energy role and no control writer', () => {
  assert.deepEqual(supportedStream5000Models().map((model) => model.telemetryAdapter), ['es22', 'es21']);
  for (const model of supportedStream5000Models()) {
    assert.equal(model.monitoringOnly, true);
    const adapter = stream5000TelemetryAdapter(model);
    assert.equal(adapter.writeControl, undefined);
    assert.equal(adapter.setQuota, undefined);
  }
  const system = app.drivers.find((driver) => driver.id === 'stream_5000_system');
  assert.equal(system.energy.homeBattery, true);
  assert.ok(system.capabilities.includes('meter_power.charged'));
  for (const id of ['stream_5000_unit', 'stream_ac5000']) {
    const unit = app.drivers.find((driver) => driver.id === id);
    assert.equal(unit.energy.homeBattery, undefined);
    assert.equal(unit.capabilities.some((capability) => ['measure_power', 'meter_power.charged', 'meter_power.discharged'].includes(capability)), false);
  }
});
