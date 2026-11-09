'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const { requestStream5000Reserve, ReserveRequestError } = require('../.homeybuild/lib/stream5000ReserveRequest');
const { EcoFlowClient } = require('../.homeybuild/lib/EcoFlowClient');
const originalLoad = Module._load;
let App; let Unit;
try {
  Module._load = function load(request, ...args) {
    if (request === 'homey') return { App: class {}, Device: class {} };
    return originalLoad.call(this, request, ...args);
  };
  App = require('../.homeybuild/app');
  Unit = require('../.homeybuild/lib/Stream5000UnitDevice').Stream5000PhysicalUnitDevice;
} finally { Module._load = originalLoad; }

const unitSn = 'ES22SYNTHETIC0001';
const mainSn = 'ES21SYNTHETIC0002';
const report = () => ({
  'bpBackupConfig-backupSocOnOff': true, 'bpBackupConfig-backupSoc': 50, workMode: 'SELF_CONSUMPTION',
});
const reason = expected => error => error instanceof ReserveRequestError && error.reason === expected;
function fixture() {
  const calls = []; let data = report(); let main = mainSn; let live = true;
  const controller = new AbortController();
  const client = {
    async getMainSnEnvelope(sn, options) { calls.push(['main', sn, options]); return { code: '0', data: { sn: main } }; },
    async getQuotaEnvelope(sn, quotas, options) { calls.push(['read', sn, quotas, options]); return { code: '0', data }; },
    async setQuotaEnvelope(body, options) { calls.push(['set', body, options]); return { code: '0' }; },
  };
  return {
    client, calls, controller, active: () => live,
    setData: value => { data = value; }, setMain: value => { main = value; }, revoke: () => { live = false; },
    run: (percent = 51) => requestStream5000Reserve(client, unitSn, percent, controller.signal, () => live),
  };
}

test('reserve card request uses fresh main routing and changes only the requested percentage once', async () => {
  for (const [sn, percent] of [[unitSn, 51], [mainSn, 0], [mainSn, 100]]) {
    const h = fixture();
    assert.deepEqual(await requestStream5000Reserve(h.client, sn, percent, h.controller.signal, h.active),
      { requestAccepted: true, applicationConfirmed: false });
    assert.deepEqual(h.calls.map(call => call[0]), ['main', 'read', 'main', 'set']);
    assert.equal(h.calls[0][1], sn); assert.equal(h.calls[2][1], sn);
    assert.equal(h.calls[1][1], mainSn);
    assert.deepEqual(h.calls[3][1], {
      sn: mainSn, cmdId: 38, cmdFunc: 254, dirSrc: 1, dirDest: 1, dest: 2, needAck: true,
      params: { bpBackupConfig: { backupSoc: percent } },
    });
    for (const call of h.calls) {
      const options = call.at(-1); assert.equal(options.signal, h.controller.signal); assert.equal(options.timeoutMs, 5000);
    }
  }
});

test('invalid targets and percentages cause no reads or writes', async () => {
  for (const percent of [null, true, '51', NaN, Infinity, -1, 101, 50.5]) {
    const h = fixture(); await assert.rejects(h.run(percent), reason('arguments')); assert.equal(h.calls.length, 0);
  }
  for (const sn of ['', 'BK21SYNTHETIC0001', 'ES23SYNTHETIC0001']) {
    const h = fixture();
    await assert.rejects(requestStream5000Reserve(h.client, sn, 51, h.controller.signal, h.active), reason('arguments'));
    assert.equal(h.calls.length, 0);
  }
});

test('disabled/unknown reserve, ambiguous status and native AI or scheduled modes cannot dispatch', async () => {
  const bad = [
    { ...report(), 'bpBackupConfig-backupSocOnOff': false },
    { ...report(), 'bpBackupConfig-backupSocOnOff': 1 },
    { ...report(), 'bpBackupConfig-backupSoc': null },
    { ...report(), 'bpBackupConfig-backupSoc': 50.5 },
    { ...report(), 'bpBackupConfig-backupSoc': 101 },
    ...['AI_MODE', 'TIMER_TASK', 'POU_MODE', 'EMERGENCY_STOP', undefined].map(workMode => ({ ...report(), workMode })),
    undefined,
  ];
  for (const data of bad) {
    const h = fixture(); h.setData(data);
    await assert.rejects(h.run(), reason('preflight')); assert.equal(h.calls.filter(c => c[0] === 'set').length, 0);
  }
  const h = fixture(); h.client.getQuotaEnvelope = async () => ({ code: 0, data: report() });
  await assert.rejects(h.run(), reason('preflight')); assert.equal(h.calls.filter(c => c[0] === 'set').length, 0);
});

test('unsupported or changed main routing never falls back to the paired address', async () => {
  for (const main of [null, '', 'BK21SYNTHETIC0001', 'ES22SYNTHETIC9999']) {
    const h = fixture();
    if (main === 'ES22SYNTHETIC9999') {
      const read = h.client.getQuotaEnvelope;
      h.client.getQuotaEnvelope = async (...args) => { const result = await read(...args); h.setMain(main); return result; };
    } else h.setMain(main);
    await assert.rejects(h.run(), reason('preflight')); assert.equal(h.calls.filter(c => c[0] === 'set').length, 0);
  }
});

test('consent withdrawal at every asynchronous preflight boundary suppresses submission', async () => {
  for (const boundary of [1, 2, 3]) {
    const h = fixture(); let completed = 0;
    for (const method of ['getMainSnEnvelope', 'getQuotaEnvelope']) {
      const original = h.client[method];
      h.client[method] = async (...args) => { const value = await original(...args); if (++completed === boundary) h.revoke(); return value; };
    }
    await assert.rejects(h.run(), reason('cancelled')); assert.equal(h.calls.filter(c => c[0] === 'set').length, 0);
  }
});

test('timeout, malformed acceptance and withdrawal after possible submission remain uncertain without retry or inverse', async () => {
  for (const outcome of ['timeout', 'malformed', 'revoked', 'aborted']) {
    const h = fixture(); let writes = 0;
    h.client.setQuotaEnvelope = async () => {
      writes++;
      if (outcome === 'timeout') throw new Error('synthetic provider detail must not escape');
      if (outcome === 'revoked') h.revoke();
      if (outcome === 'aborted') h.controller.abort();
      return { code: outcome === 'malformed' ? 0 : '0' };
    };
    await assert.rejects(h.run(), error => reason('uncertain')(error) && !error.message.includes('provider'));
    assert.equal(writes, 1);
  }
});

test('expired, backwards and invalid clocks cannot submit', async () => {
  for (const late of [999, 16001, NaN]) {
    const h = fixture(); let clock = 1000;
    const read = h.client.getQuotaEnvelope;
    h.client.getQuotaEnvelope = async (...args) => { const result = await read(...args); clock = late; return result; };
    await assert.rejects(requestStream5000Reserve(h.client, unitSn, 51, h.controller.signal, h.active, () => clock), reason('cancelled'));
    assert.equal(h.calls.filter(c => c[0] === 'set').length, 0);
  }
});

function appHarness(t) {
  const h = fixture(); const app = new App(); const values = {
    accessKey: 'synthetic-access', secretKey: 'synthetic-secret', host: 'https://api-e.ecoflow.com',
  };
  let enabled = true; let available = true; let paired = true;
  const device = {
    getData: () => ({ sn: unitSn }), getAvailable: () => available,
    getSetting: key => key === 'reserve_request_enabled' && enabled,
  };
  const settings = new EventEmitter(); settings.get = key => values[key];
  settings.set = () => assert.fail('No settings or optimistic state write');
  const timers = new Map(); let timer = 0; const actions = new Map();
  app.homey = {
    settings, app, __: key => key,
    drivers: { getDriver: id => ({ getDevices: () => id === 'stream_5000_unit' && paired ? [device] : [] }) },
    flow: {
      getActionCard: id => ({ registerRunListener: run => actions.set(id, run) }),
      getConditionCard: () => ({ registerRunListener() {} }),
    },
    setTimeout: fn => { timers.set(++timer, fn); return timer; }, clearTimeout: id => timers.delete(id),
  };
  app.log = () => {}; app.error = () => {};
  for (const method of ['getMainSnEnvelope', 'getQuotaEnvelope', 'setQuotaEnvelope']) {
    const original = EcoFlowClient.prototype[method];
    EcoFlowClient.prototype[method] = (...args) => h.client[method](...args);
    t.after(() => { EcoFlowClient.prototype[method] = original; });
  }
  return {
    ...h, app, device, values, actions, timers,
    disable: () => { enabled = false; }, offline: () => { available = false; }, remove: () => { paired = false; },
    run: () => app.requestStream5000BackupReserve(device, 51),
  };
}

test('actual registered THEN listener reaches the one-attempt client and returns acceptance only', async t => {
  const h = appHarness(t); await h.app.onInit();
  const listener = h.actions.get('stream_5000_request_backup_reserve'); assert.equal(typeof listener, 'function');
  assert.equal(await listener({ device: h.device, percent: 51 }), true);
  assert.equal(h.calls.filter(c => c[0] === 'set').length, 1); assert.equal(h.timers.size, 0);
  await h.app.onUninit();
});

test('actual app rejects opt-out, missing credentials, offline/removed/aggregate targets and active private controllers', async t => {
  const h = appHarness(t);
  h.disable(); await assert.rejects(h.run(), /disabled/);
  assert.equal(h.calls.length, 0);
  await assert.rejects(h.app.requestStream5000BackupReserve({}, 51), /unavailable/);
  await t.test('missing Developer access', async t2 => {
    const x = appHarness(t2); delete x.values.accessKey;
    await assert.rejects(x.run(), /credentials/); assert.equal(x.calls.length, 0);
  });
  for (const change of ['offline', 'remove', 'controller', 'lease']) {
    await t.test(change, async t2 => {
      const x = appHarness(t2);
      if (change === 'controller') x.values.houseReserveControl = { enabled: true };
      else if (change === 'lease') x.values.houseReserveLease = { completed: false };
      else x[change]();
      await assert.rejects(x.run(), /unavailable/); assert.equal(x.calls.length, 0);
    });
  }
});

test('app serializes requests without queueing and fences settings changes during preflight', async t => {
  const h = appHarness(t); await h.app.onInit(); let release;
  const original = h.client.getMainSnEnvelope;
  h.client.getMainSnEnvelope = (...args) => new Promise(resolve => { release = () => resolve(original(...args)); });
  const pending = h.run();
  await assert.rejects(h.run(), /busy/);
  h.app.homey.settings.emit('set', 'secretKey'); release();
  await assert.rejects(pending, /cancelled/);
  assert.equal(h.calls.filter(c => c[0] === 'set').length, 0);
  await h.app.onUninit();
  assert.equal(h.timers.size, 0);
});

test('device removal, opt-out and credential drift during main resolution prevent submission', async t => {
  for (const change of ['disable', 'remove', 'credentials']) {
    await t.test(change, async t2 => {
      const h = appHarness(t2); const original = h.client.getMainSnEnvelope;
      h.client.getMainSnEnvelope = async (...args) => {
        const result = await original(...args);
        if (change === 'credentials') h.values.secretKey = 'synthetic-replacement';
        else h[change]();
        return result;
      };
      await assert.rejects(h.run(), /cancelled/); assert.equal(h.calls.filter(c => c[0] === 'set').length, 0);
    });
  }
});

test('app deadline and shutdown abort local IO but never claim remote cancellation after submission', async t => {
  for (const stop of ['deadline', 'shutdown']) {
    await t.test(stop, async t2 => {
      const h = appHarness(t2); await h.app.onInit(); let release; let signal;
      h.client.setQuotaEnvelope = (_body, options) => {
        signal = options.signal; return new Promise(resolve => { release = () => resolve({ code: '0' }); });
      };
      const pending = h.run();
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(typeof release, 'function');
      if (stop === 'deadline') [...h.timers.values()][0]();
      else await h.app.onUninit();
      assert.equal(signal.aborted, true); release();
      await assert.rejects(pending, /uncertain/); assert.equal(h.timers.size, 0);
      if (stop === 'deadline') await h.app.onUninit();
    });
  }
});

test('physical-device consent changes and teardown revoke pending local requests and update truthful notice', async () => {
  const device = new Unit(); let cancelled = 0; const notices = [];
  device.homey = { app: { cancelStream5000ReserveRequests: () => { cancelled++; } }, __: key => key };
  device.setSettings = async value => { notices.push(value.experimental_notice); };
  await device.onSettings({ newSettings: { reserve_request_enabled: true }, changedKeys: ['reserve_request_enabled'] });
  await device.onSettings({ newSettings: { reserve_request_enabled: false }, changedKeys: ['reserve_request_enabled'] });
  assert.deepEqual(notices, ['reserve_request.notice', 'device.stream_5000_unit.monitoring_only']);
  await device.onUninit(); assert.equal(cancelled, 3);
});
