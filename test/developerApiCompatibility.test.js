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
const LOCALIZED_ES22_MESSAGE = 'Delete this device and add it again as STREAM 5000 Series Unit.';
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
});

test('an already-paired ES22 stops before lifecycle setup and stays stopped', async () => {
  const device = new TestDevice('ES22ZE1B2J6W0110');

  await device.onInit();
  assert.deepStrictEqual(device.unavailableMessages, [LOCALIZED_ES22_MESSAGE]);
  assert.strictEqual(device.settingsReads, 0);
  assert.strictEqual(device.readyCalls, 0);
  assert.strictEqual(device.timerCalls, 0);
  assert.strictEqual(device.subscribeCalls, 0);

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
    device.sendSequence('Set backup reserve', [{ sn: 'ES22ZE1B2J6W0110' }]),
    (error) => error instanceof DeveloperApiQuarantineError
      && error.message === LOCALIZED_ES22_MESSAGE,
  );
  assert.strictEqual(warningCalls, 0);
  assert.strictEqual(timeoutCalls, 0);
});
