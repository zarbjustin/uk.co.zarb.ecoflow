'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  APP_AUTH_EMAIL_SETTING,
  APP_AUTH_HOST_SETTING,
  APP_AUTH_PASSWORD_SETTING,
  clearSavedAppAuthCreds,
  getSavedAppAuthCreds,
  hasSavedAppAuthCreds,
  registerAppAuthHandlers,
} = require('../.homeybuild/lib/appAuthPairing.js');

// Obviously-fake credentials — nothing here touches a real EcoFlow account.
const EMAIL = 'tester@example.invalid';
const PASSWORD = 'not-a-real-password';
const TOKEN = 'fake.jwt.token';
const USER_ID = '9876543210';
const SN = 'ES22ZEB1ABCD0001';

function fakeHomey() {
  const values = new Map();
  const timers = [];
  return {
    values,
    timers,
    writes: [],
    settings: {
      get(key) {
        return values.has(key) ? values.get(key) : null;
      },
      set(key, value) {
        values.set(key, value);
      },
      unset(key) {
        values.delete(key);
      },
    },
    setTimeout(fn) {
      timers.push(fn);
      return timers.length;
    },
    /** Run everything the pairing session scheduled. */
    runTimers() {
      const queued = timers.splice(0, timers.length);
      for (const fn of queued) fn();
    },
  };
}

function fakeSession() {
  const handlers = new Map();
  return {
    handlers,
    setHandler(event, handler) {
      handlers.set(event, handler);
      return this;
    },
    call(event, data) {
      const handler = handlers.get(event);
      assert.ok(handler, `no handler registered for ${event}`);
      return handler(data);
    },
  };
}

function fakeDriver(homey, devices = []) {
  return {
    homey,
    logs: [],
    devices,
    log(...args) {
      this.logs.push(args.join(' '));
    },
    getDevices() {
      return this.devices;
    },
  };
}

/** Transport that accepts the login and lists one ES22 plus one BK unit. */
function okTransport(calls = []) {
  return async (req) => {
    calls.push(req);
    if (req.url.endsWith('/auth/login')) {
      return { status: 200, body: { code: '0', data: { token: TOKEN, user: { userId: USER_ID } } } };
    }
    return {
      status: 200,
      body: {
        code: '0',
        data: {
          bound: {
            [SN]: { deviceName: 'STREAM AC 5000', online: 1 },
            BK61ZK1B2H720041: { deviceName: 'STREAM Ultra X', online: 1 },
          },
        },
      },
    };
  };
}

function rejectingTransport() {
  return async () => ({ status: 200, body: { code: '1002', message: 'Email or password incorrect' } });
}

function login(session, host = 'https://api.ecoflow.com') {
  return session.call('app_login', { email: EMAIL, password: PASSWORD, host });
}

function storedKeys(homey) {
  return [...homey.values.keys()].sort();
}

test('a successful sign-in stores nothing until a device is added', async () => {
  const homey = fakeHomey();
  const driver = fakeDriver(homey);
  const session = fakeSession();
  const pairing = registerAppAuthHandlers(driver, session, { transport: okTransport(), cleanupDelayMs: 0 });

  assert.strictEqual(await session.call('check_app_credentials'), false);
  assert.strictEqual(await login(session), true);

  // Signed in, but the Homey still holds no account.
  assert.deepStrictEqual(storedKeys(homey), []);
  assert.strictEqual(hasSavedAppAuthCreds(homey), false);
  // ...and the view still skips the form, because this session is signed in.
  assert.strictEqual(await session.call('check_app_credentials'), true);

  // Discovery works from the in-memory session, before anything is persisted.
  const devices = await pairing.getClient().getDeviceList();
  assert.ok(devices.some((d) => d.sn === SN));
  assert.deepStrictEqual(storedKeys(homey), []);

  await session.call('add_device', { data: { sn: SN } });
  assert.deepStrictEqual(getSavedAppAuthCreds(homey), {
    email: EMAIL, password: PASSWORD, host: 'https://api.ecoflow.com',
  });
});

test('the region that accepted the login is the one stored', async () => {
  const homey = fakeHomey();
  const session = fakeSession();
  const calls = [];
  registerAppAuthHandlers(fakeDriver(homey), session, { transport: okTransport(calls), cleanupDelayMs: 0 });

  await login(session, 'https://api-e.ecoflow.com');
  await session.call('add_device', {});
  assert.strictEqual(homey.values.get(APP_AUTH_HOST_SETTING), 'https://api-e.ecoflow.com');
  assert.strictEqual(calls[0].url, 'https://api-e.ecoflow.com/auth/login');
});

test('cancelling after signing in leaves no credentials behind', async () => {
  const homey = fakeHomey();
  const driver = fakeDriver(homey);
  const session = fakeSession();
  registerAppAuthHandlers(driver, session, { transport: okTransport(), cleanupDelayMs: 0 });

  await login(session);
  await session.call('disconnect');
  homey.runTimers();

  assert.deepStrictEqual(storedKeys(homey), []);
  assert.strictEqual(hasSavedAppAuthCreds(homey), false);
});

test('an empty device list leaves no credentials behind', async () => {
  const homey = fakeHomey();
  const session = fakeSession();
  const emptyTransport = async (req) => {
    if (req.url.endsWith('/auth/login')) {
      return { status: 200, body: { code: '0', data: { token: TOKEN, user: { userId: USER_ID } } } };
    }
    return { status: 200, body: { code: '0', data: { bound: {} } } };
  };
  const pairing = registerAppAuthHandlers(fakeDriver(homey), session, {
    transport: emptyTransport, cleanupDelayMs: 0,
  });

  await login(session);
  assert.deepStrictEqual(await pairing.getClient().getDeviceList(), []);
  await session.call('disconnect');
  homey.runTimers();

  assert.deepStrictEqual(storedKeys(homey), []);
});

test('a rejected sign-in stores nothing', async () => {
  const homey = fakeHomey();
  const session = fakeSession();
  registerAppAuthHandlers(fakeDriver(homey), session, { transport: rejectingTransport(), cleanupDelayMs: 0 });

  await assert.rejects(() => login(session), (e) => {
    assert.ok(!e.message.includes(PASSWORD));
    return true;
  });
  assert.deepStrictEqual(storedKeys(homey), []);
  await session.call('disconnect');
  homey.runTimers();
  assert.deepStrictEqual(storedKeys(homey), []);
});

test('an incomplete form is refused before any request is made', async () => {
  const homey = fakeHomey();
  const session = fakeSession();
  const calls = [];
  registerAppAuthHandlers(fakeDriver(homey), session, { transport: okTransport(calls), cleanupDelayMs: 0 });

  await assert.rejects(() => session.call('app_login', { email: '', password: '' }), /required/);
  assert.strictEqual(calls.length, 0);
  assert.deepStrictEqual(storedKeys(homey), []);
});

test('credentials stored for a device that never appeared are removed again', async () => {
  const homey = fakeHomey();
  const driver = fakeDriver(homey, []);
  const session = fakeSession();
  registerAppAuthHandlers(driver, session, { transport: okTransport(), cleanupDelayMs: 0 });

  await login(session);
  await session.call('add_device', {});
  assert.strictEqual(hasSavedAppAuthCreds(homey), true);

  // The pairing ended but no device was created — take the account back out.
  await session.call('disconnect');
  homey.runTimers();
  assert.deepStrictEqual(storedKeys(homey), []);
});

test('credentials are kept when the device really was created', async () => {
  const homey = fakeHomey();
  const driver = fakeDriver(homey, []);
  const session = fakeSession();
  registerAppAuthHandlers(driver, session, { transport: okTransport(), cleanupDelayMs: 0 });

  await login(session);
  await session.call('add_device', {});
  driver.devices = [{ getData: () => ({ sn: SN }) }];
  await session.call('disconnect');
  homey.runTimers();

  assert.strictEqual(hasSavedAppAuthCreds(homey), true);
  assert.strictEqual(homey.values.get(APP_AUTH_EMAIL_SETTING), EMAIL);
  assert.strictEqual(homey.values.get(APP_AUTH_PASSWORD_SETTING), PASSWORD);
});

test('pairing a second ES22 reuses the stored account and never clears it', async () => {
  const homey = fakeHomey();
  homey.values.set(APP_AUTH_EMAIL_SETTING, EMAIL);
  homey.values.set(APP_AUTH_PASSWORD_SETTING, PASSWORD);
  homey.values.set(APP_AUTH_HOST_SETTING, 'https://api.ecoflow.com');
  // A device list that is momentarily empty must not cost the user the account.
  const driver = fakeDriver(homey, []);
  const session = fakeSession();
  const pairing = registerAppAuthHandlers(driver, session, { cleanupDelayMs: 0 });

  // The form is skipped: the saved account is offered straight to discovery.
  assert.strictEqual(await session.call('check_app_credentials'), true);
  assert.ok(pairing.getClient());

  await session.call('add_device', {});
  await session.call('disconnect');
  homey.runTimers();

  assert.strictEqual(hasSavedAppAuthCreds(homey), true);
});

test('adding several devices writes the account exactly once', async () => {
  const homey = fakeHomey();
  const driver = fakeDriver(homey, []);
  const session = fakeSession();
  const written = [];
  const realSet = homey.settings.set.bind(homey.settings);
  homey.settings.set = (key, value) => {
    written.push(key);
    realSet(key, value);
  };
  registerAppAuthHandlers(driver, session, { transport: okTransport(), cleanupDelayMs: 0 });

  await login(session);
  await session.call('add_device', {});
  await session.call('add_device', {});

  assert.deepStrictEqual(written.sort(), [
    APP_AUTH_EMAIL_SETTING, APP_AUTH_HOST_SETTING, APP_AUTH_PASSWORD_SETTING,
  ].sort());
});

test('disconnect is idempotent and never clears an account twice', async () => {
  const homey = fakeHomey();
  const driver = fakeDriver(homey, []);
  const session = fakeSession();
  registerAppAuthHandlers(driver, session, { transport: okTransport(), cleanupDelayMs: 0 });

  await login(session);
  await session.call('add_device', {});
  await session.call('disconnect');
  await session.call('disconnect');
  assert.strictEqual(homey.timers.length, 1);
  homey.runTimers();
  assert.deepStrictEqual(storedKeys(homey), []);
});

test('the pairing session never logs the account it handles', async () => {
  const homey = fakeHomey();
  const driver = fakeDriver(homey);
  const session = fakeSession();
  registerAppAuthHandlers(driver, session, { transport: okTransport(), cleanupDelayMs: 0 });

  await login(session);
  await session.call('add_device', {});
  const text = driver.logs.join('\n');
  assert.ok(!text.includes(PASSWORD));
  assert.ok(!text.includes(EMAIL));
  assert.ok(!text.includes(TOKEN));
});

test('clearSavedAppAuthCreds removes every credential key', () => {
  const homey = fakeHomey();
  homey.values.set(APP_AUTH_EMAIL_SETTING, EMAIL);
  homey.values.set(APP_AUTH_PASSWORD_SETTING, PASSWORD);
  homey.values.set(APP_AUTH_HOST_SETTING, 'https://api.ecoflow.com');
  clearSavedAppAuthCreds(homey);
  assert.deepStrictEqual(storedKeys(homey), []);
  assert.strictEqual(hasSavedAppAuthCreds(homey), false);
});
