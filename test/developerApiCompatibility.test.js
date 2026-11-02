'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Module = require('node:module');
const {
  DEVELOPER_API_UNSUPPORTED_MESSAGE_KEY,
  developerApiQuarantineMessageKey,
  DeveloperApiQuarantineError,
  ES22_WRONG_DRIVER_MESSAGE_KEY,
} = require('../.homeybuild/lib/developerApiCompatibility.js');
const { EcoFlowApiError } = require('../.homeybuild/lib/EcoFlowClient.js');

function loadWithHomeyMock(modulePath) {
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === 'homey') return { Device: class Device {} };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const resolved = require.resolve(modulePath);
    delete require.cache[resolved];
    return require(resolved);
  } finally {
    Module._load = originalLoad;
  }
}

const { BaseEcoFlowDevice } = loadWithHomeyMock('../.homeybuild/lib/BaseEcoFlowDevice.js');
const StreamDevice = loadWithHomeyMock('../.homeybuild/drivers/stream/device.js');
const LOCALIZED_ES22_MESSAGE = 'Use STREAM 5000 Series Unit for monitoring; Home Battery Energy pairing has a separate opt-in.';
const LOCALIZED_UNSUPPORTED_MESSAGE = 'Delete this unsupported device and add its dedicated type.';

class TestDevice extends BaseEcoFlowDevice {
  constructor(sn, quotaResponses = []) {
    super();
    this.sn = sn;
    this.quotaResponses = [...quotaResponses];
    this.readyCalls = 0;
    this.settingsReads = 0;
    this.timerCalls = 0;
    this.clearTimerCalls = 0;
    this.subscribeCalls = 0;
    this.unsubscribeCalls = 0;
    this.writeCalls = 0;
    this.quotaCalls = 0;
    this.teardownCalls = 0;
    this.logs = [];
    this.unavailableMessages = [];
    this.available = true;
    this.settingsValues = null;
    this.homey = {
      __(key) {
        if (key === ES22_WRONG_DRIVER_MESSAGE_KEY) return LOCALIZED_ES22_MESSAGE;
        if (key === DEVELOPER_API_UNSUPPORTED_MESSAGE_KEY) return LOCALIZED_UNSUPPORTED_MESSAGE;
        return key;
      },
      settings: {
        get: (key) => {
          this.settingsReads += 1;
          if (!this.settingsValues) throw new Error('settings must not be read');
          return this.settingsValues[key];
        },
      },
      setInterval: () => {
        this.timerCalls += 1;
        return {};
      },
      clearInterval: () => {
        this.clearTimerCalls += 1;
      },
      app: {
        subscribeRealtime: async () => {
          this.subscribeCalls += 1;
          return true;
        },
        unsubscribeRealtime: () => {
          this.unsubscribeCalls += 1;
        },
      },
    };
    this.client = {
      getQuotaAll: async () => {
        this.quotaCalls += 1;
        const response = this.quotaResponses.shift();
        if (response instanceof Error) throw response;
        return response || {};
      },
      setQuota: async (payload) => {
        this.writeCalls += 1;
        return payload;
      },
    };
  }

  getReadSn() {
    return this.sn;
  }

  async applyQuota() {}

  async onReady() {
    this.readyCalls += 1;
  }

  async setUnavailable(message) {
    this.available = false;
    this.unavailableMessages.push(message);
  }

  getAvailable() {
    return this.available;
  }

  async setAvailable() {
    this.available = true;
  }

  log(...args) {
    this.logs.push(args.join(' '));
  }

  error(...args) {
    this.logs.push(args.join(' '));
  }

  getSetting() {
    return 30;
  }

  manualPoll() {
    return this.poll();
  }

  manualWrite(payload) {
    return this.writeQuota(payload);
  }

  enableAutomaticPollingState() {
    this.settingsValues = {
      accessKey: 'access',
      secretKey: 'secret',
      host: undefined,
    };
    this.clientCredentialsKey = 'access:secret:';
    this.pollTimer = {};
    this.subscribedSn = this.sn;
    this.realtimeApp = this.homey.app;
    this.quotaHandler = () => {};
    this.statusHandler = () => {};
  }

  async onTeardown() {
    this.teardownCalls += 1;
  }
}

test('the exact reported ES22 serial is quarantined from the Developer API', () => {
  assert.strictEqual(
    developerApiQuarantineMessageKey('ES22ZE1B2J6W0110'),
    ES22_WRONG_DRIVER_MESSAGE_KEY,
  );
  assert.strictEqual(developerApiQuarantineMessageKey('es22ze1b2j6w0110'), ES22_WRONG_DRIVER_MESSAGE_KEY);
  assert.strictEqual(developerApiQuarantineMessageKey('BK61ZK1B2H720041'), null);
  assert.strictEqual(developerApiQuarantineMessageKey('ES21TESTUNITAAAA'), ES22_WRONG_DRIVER_MESSAGE_KEY);
});

test('an ES21 in a legacy Developer driver cannot initialize, poll or write', async () => {
  const device = new TestDevice('ES21TESTUNITAAAA');
  await device.onInit();
  assert.deepStrictEqual(device.unavailableMessages, [LOCALIZED_ES22_MESSAGE]);
  await assert.rejects(device.manualPoll(), DeveloperApiQuarantineError);
  await assert.rejects(device.manualWrite({ sn: device.sn }), DeveloperApiQuarantineError);
  assert.strictEqual(device.settingsReads, 0);
  assert.strictEqual(device.quotaCalls, 0);
  assert.strictEqual(device.writeCalls, 0);
  assert.strictEqual(device.subscribeCalls, 0);
  assert.strictEqual(device.timerCalls, 0);
});

test('an already-paired ES22 stops before lifecycle setup and stays stopped', async () => {
  const device = new TestDevice('ES22ZE1B2J6W0110');

  await device.onInit();
  assert.deepStrictEqual(device.unavailableMessages, [LOCALIZED_ES22_MESSAGE]);
  assert.strictEqual(device.settingsReads, 0);
  assert.strictEqual(device.readyCalls, 0);
  assert.strictEqual(device.timerCalls, 0);
  assert.strictEqual(device.subscribeCalls, 0);
  assert.ok(device.logs.some((message) => message.includes('STREAM Home Battery (5000)')));
  assert.ok(!device.logs.some((message) => message.includes('add it again as STREAM 5000 Series Unit')));

  await device.onSettings({ newSettings: { poll_interval: 10 }, changedKeys: ['poll_interval'] });
  await assert.rejects(device.manualPoll(), {
    name: 'DeveloperApiQuarantineError',
    message: LOCALIZED_ES22_MESSAGE,
  });
  await assert.rejects(device.manualWrite({ sn: 'ES22ZE1B2J6W0110' }), {
    name: 'DeveloperApiQuarantineError',
    message: LOCALIZED_ES22_MESSAGE,
  });

  assert.strictEqual(device.timerCalls, 0);
  assert.strictEqual(device.writeCalls, 0);
  assert.deepStrictEqual(device.unavailableMessages, [LOCALIZED_ES22_MESSAGE]);
});

test('the shared write gate blocks an ES22 command target without quarantining a BK read path', async () => {
  const device = new TestDevice('BK61ZK1B2H720041');
  const payload = { sn: 'BK61ZK1B2H720041', cmdCode: 'test' };

  await assert.rejects(device.manualWrite({ sn: 'ES22ZE1B2J6W0110', cmdCode: 'test' }), {
    name: 'DeveloperApiQuarantineError',
    message: LOCALIZED_ES22_MESSAGE,
  });
  device.enableAutomaticPollingState();
  assert.deepStrictEqual(await device.manualWrite(payload), payload);
  assert.strictEqual(device.writeCalls, 1);
  assert.deepStrictEqual(device.unavailableMessages, []);
});

test('three consecutive API 1006 failures stop polling, MQTT and writes', async () => {
  const serial = 'ZZ99FUTURE';
  const failures = Array.from(
    { length: 3 },
    () => new EcoFlowApiError('1006', 'unsupported device'),
  );
  const device = new TestDevice(serial, failures);
  device.enableAutomaticPollingState();

  await device.manualPoll();
  await device.manualPoll();
  assert.deepStrictEqual(device.unavailableMessages, []);

  await device.manualPoll();
  assert.deepStrictEqual(device.unavailableMessages, [LOCALIZED_UNSUPPORTED_MESSAGE]);
  assert.strictEqual(device.quotaCalls, 3);
  assert.strictEqual(device.clearTimerCalls, 1);
  assert.strictEqual(device.unsubscribeCalls, 1);
  assert.strictEqual(device.teardownCalls, 1);

  await assert.rejects(device.manualPoll(), DeveloperApiQuarantineError);
  await assert.rejects(device.manualWrite({ sn: serial }), {
    name: 'DeveloperApiQuarantineError',
    message: LOCALIZED_UNSUPPORTED_MESSAGE,
  });
  assert.strictEqual(device.quotaCalls, 3);
  assert.strictEqual(device.writeCalls, 0);
  assert.deepStrictEqual(device.unavailableMessages, [LOCALIZED_UNSUPPORTED_MESSAGE]);
  assert.ok(device.logs.every((entry) => !entry.includes(serial)));
});

test('a successful poll resets the consecutive API 1006 count', async () => {
  const fail = () => new EcoFlowApiError('1006', 'unsupported device');
  const device = new TestDevice('ZZ99RESET', [
    fail(), fail(), { cmsBattSoc: 50 }, fail(), fail(), fail(),
  ]);
  device.enableAutomaticPollingState();

  for (let i = 0; i < 5; i += 1) await device.manualPoll();
  assert.deepStrictEqual(device.unavailableMessages, []);
  assert.strictEqual(device.quotaCalls, 5);

  await device.manualPoll();
  assert.deepStrictEqual(device.unavailableMessages, [LOCALIZED_UNSUPPORTED_MESSAGE]);
  assert.strictEqual(device.quotaCalls, 6);
});

test('backup-reserve quarantine errors are rethrown unchanged without warning or follow-up poll', async () => {
  const device = new StreamDevice();
  let warningCalls = 0;
  let timeoutCalls = 0;
  device.homey = {
    __(key) {
      return key === ES22_WRONG_DRIVER_MESSAGE_KEY ? LOCALIZED_ES22_MESSAGE : key;
    },
    setTimeout() {
      timeoutCalls += 1;
    },
  };
  device.getData = () => ({ sn: 'ES22ZE1B2J6W0110' });
  device.setWarning = async () => {
    warningCalls += 1;
  };

  await assert.rejects(
    device.flowSetBackupReserve(20),
    (error) => error instanceof DeveloperApiQuarantineError
      && error.message === LOCALIZED_ES22_MESSAGE,
  );
  assert.strictEqual(warningCalls, 0);
  assert.strictEqual(timeoutCalls, 0);
});


test('legacy ES22 upgrade preserves both actual driver identities, history and counters without starting network work', async () => {
  const StreamUnitDevice = loadWithHomeyMock('../.homeybuild/drivers/stream_unit/device.js');
  for (const Driver of [StreamDevice, StreamUnitDevice]) {
    const device = new Driver();
    const saved = {
      data: { sn: 'ES22SYNTHETIC0001' },
      store: { mainSn: 'ES22SYNTHETIC0001', checkpoint: { chargedKwh: 4.381, dischargedKwh: 3.146 } },
      settings: { note: 'existing installation', capacity: 5 },
      capabilities: ['measure_battery', 'measure_power', 'meter_power.charged', 'meter_power.discharged'],
      values: { measure_battery: 0, 'meter_power.charged': 4.381, 'meter_power.discharged': 3.146 },
    };
    const before = structuredClone(saved);
    let message;
    const forbidden = () => { assert.fail('Quarantined legacy pairing must not mutate state or start device work'); };
    device.homey = { __: key => key, settings: { get: forbidden }, setInterval: forbidden, setTimeout: forbidden };
    device.getData = () => saved.data;
    device.getStoreValue = key => saved.store[key];
    device.setUnavailable = async value => { message = value; };
    device.log = () => {};
    for (const method of ['setSettings', 'setStoreValue', 'setCapabilityValue', 'addCapability', 'removeCapability', 'onReady', 'poll']) {
      device[method] = forbidden;
    }
    await device.onInit();
    assert.match(message, /STREAM 5000 Series Unit/);
    assert.deepStrictEqual(saved, before);
    await device.onSettings({ newSettings: { poll_interval: 10 }, changedKeys: ['poll_interval'] });
    assert.deepStrictEqual(saved, before);
  }
});

test('original consumer diagnostics distinguish queued delivery, blocked application, failure and recovery without payloads', async () => {
  const { reportingSnapshot } = require('../.homeybuild/lib/streamReportingDiagnostics.js');
  const d = new TestDevice('BK31SYNTHETIC0001');
  let release; let entered;
  const began = new Promise(resolve => { entered = resolve; });
  const blocked = d.queueDeviceWork(async () => { entered(); await new Promise(resolve => { release = resolve; }); });
  await began;
  let fail = true;
  d.applyQuota = async () => { if (fail) throw new Error('PRIVATE_PAYLOAD'); };
  const pending = d.queueQuota({ secret: 'PRIVATE_PAYLOAD' }, 'mqtt');
  let report = reportingSnapshot(d, Date.now());
  assert.equal(report.delivery.mqtt.queued, 1);
  assert.equal(report.delivery.mqtt.pending, 1);
  assert.equal(report.delivery.mqtt.started, 0);
  release(); await blocked;
  await assert.rejects(pending, /PRIVATE_PAYLOAD/);
  report = reportingSnapshot(d, Date.now());
  assert.equal(report.delivery.mqtt.pending, 0);
  assert.equal(report.delivery.mqtt.failed, 1);
  assert.equal(report.delivery.mqtt.running, 0);
  fail = false; d.mqttOffline = true;
  await d.queueQuota({ secret: 'PRIVATE_PAYLOAD' }, 'mqtt');
  report = reportingSnapshot(d, Date.now());
  assert.equal(report.delivery.mqtt.completed, 1);
  assert.equal(report.delivery.completionIsReadingAcceptance, false);
  assert.ok(!JSON.stringify(report.delivery).includes('PRIVATE_PAYLOAD'));
  assert.equal(report.delivery.rest.queued, 0);
});

test('consumer evidence export rejects injected identities, timestamps and invalid counts', () => {
  const { streamDeliverySnapshot } = require('../.homeybuild/lib/streamDeliveryDiagnostics.js');
  const report = streamDeliverySnapshot({ mqtt: { queued: 999999, pending: -1, completed: 2,
    lastQueuedAt: 1000, lastCompletedAt: 5000, secret: 'PRIVATE' }, privateTopic: 'PRIVATE' }, 2000);
  assert.equal(report.mqtt.queued, 0); assert.equal(report.mqtt.pending, 0);
  assert.equal(report.mqtt.completed, 2); assert.equal(report.mqtt.lastQueuedAgeSec, 1);
  assert.equal(report.mqtt.lastCompletedAgeSec, null);
  assert.ok(!JSON.stringify(report).includes('PRIVATE'));
  assert.ok(!Object.hasOwn(report.mqtt, 'lastQueuedAt'));
});
