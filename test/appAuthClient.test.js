'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { EcoFlowAppAuthClient, EcoFlowAppAuthError } = require('../.homeybuild/lib/EcoFlowAppAuthClient.js');
const { encryptCertificationForTest } = require('../.homeybuild/lib/appAuthCrypto.js');

// Obviously-fake credentials — nothing here touches a real EcoFlow account.
const EMAIL = 'tester@example.invalid';
const PASSWORD = 'not-a-real-password';
const TOKEN = 'fake.jwt.token';
const USER_ID = '9876543210';

function ok(data) {
  return { status: 200, body: { code: '0', message: 'Success', data } };
}

function fail(code, message, status = 200) {
  return { status, body: { code, message } };
}

function loginOk() {
  return ok({ token: TOKEN, user: { userId: USER_ID } });
}

/** Records every request so assertions can inspect what was actually sent. */
function recorder(handler) {
  const calls = [];
  const transport = async (req) => {
    calls.push(req);
    return handler(req, calls.length);
  };
  return { calls, transport };
}

test('login posts the documented app-auth payload and stores the session', async () => {
  const { calls, transport } = recorder(() => loginOk());
  const client = new EcoFlowAppAuthClient({ email: EMAIL, password: PASSWORD, transport });

  const session = await client.getSession();
  assert.strictEqual(session.token, TOKEN);
  assert.strictEqual(session.userId, USER_ID);
  assert.strictEqual(session.host, 'https://api.ecoflow.com');
  assert.strictEqual(client.userId, USER_ID);

  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].method, 'POST');
  assert.strictEqual(calls[0].url, 'https://api.ecoflow.com/auth/login');
  const body = JSON.parse(calls[0].body);
  assert.strictEqual(body.email, EMAIL);
  assert.strictEqual(body.scene, 'IOT_APP');
  assert.strictEqual(body.userType, 'ECOFLOW');
  // The password is base64-encoded on the wire, never sent in the clear.
  assert.strictEqual(body.password, Buffer.from(PASSWORD, 'utf8').toString('base64'));
  assert.notStrictEqual(body.password, PASSWORD);

  // A second call reuses the cached token instead of logging in again.
  await client.getSession();
  assert.strictEqual(calls.length, 1);
});

test('login honours the preferred region and falls back to the other one', async () => {
  const { calls, transport } = recorder((req) => {
    if (req.url.startsWith('https://api-e.')) throw new Error('socket hang up');
    return loginOk();
  });
  const client = new EcoFlowAppAuthClient({
    email: EMAIL, password: PASSWORD, host: 'https://api-e.ecoflow.com', transport,
  });

  const session = await client.getSession();
  assert.strictEqual(session.host, 'https://api.ecoflow.com');
  assert.deepStrictEqual(calls.map((c) => c.url), [
    'https://api-e.ecoflow.com/auth/login',
    'https://api.ecoflow.com/auth/login',
  ]);
});

test('a preferred-host rejection still tries the other region', async () => {
  // Accounts are region-bound: the wrong region answers exactly like a wrong
  // password would, so a rejection there must not end the login attempt.
  const { calls, transport } = recorder((req) => {
    if (req.url.startsWith('https://api-e.')) return fail('1002', 'Email or password incorrect');
    return loginOk();
  });
  const client = new EcoFlowAppAuthClient({
    email: EMAIL, password: PASSWORD, host: 'https://api-e.ecoflow.com', transport,
  });

  const session = await client.getSession();
  assert.strictEqual(session.host, 'https://api.ecoflow.com');
  assert.strictEqual(session.token, TOKEN);
  assert.deepStrictEqual(calls.map((c) => c.url), [
    'https://api-e.ecoflow.com/auth/login',
    'https://api.ecoflow.com/auth/login',
  ]);
});

test('a rejected account is only reported after every approved region refused it', async () => {
  const { calls, transport } = recorder(() => fail('1002', 'Email or password incorrect'));
  const client = new EcoFlowAppAuthClient({ email: EMAIL, password: PASSWORD, transport });

  await assert.rejects(() => client.getSession(), (e) => {
    assert.ok(e instanceof EcoFlowAppAuthError);
    assert.strictEqual(e.code, '1002');
    assert.strictEqual(e.authFailure, true);
    // Errors surface to the pairing UI — they must never echo secrets.
    assert.ok(!e.message.includes(PASSWORD));
    assert.ok(!e.message.includes(EMAIL));
    assert.ok(!e.message.includes(TOKEN));
    return true;
  });
  assert.deepStrictEqual(calls.map((c) => c.url), [
    'https://api.ecoflow.com/auth/login',
    'https://api-e.ecoflow.com/auth/login',
  ]);
});

test('a network failure on one region still surfaces the other region rejection', async () => {
  const { transport } = recorder((req) => {
    if (req.url.startsWith('https://api.')) throw new Error('socket hang up');
    return fail('1002', 'Email or password incorrect');
  });
  const client = new EcoFlowAppAuthClient({ email: EMAIL, password: PASSWORD, transport });
  await assert.rejects(() => client.getSession(), (e) => {
    assert.strictEqual(e.authFailure, true);
    assert.strictEqual(e.code, '1002');
    return true;
  });
});

test('login never logs the reason a region rejected the account', async () => {
  const logged = [];
  const { transport } = recorder(() => fail('1002', 'Email or password incorrect'));
  const client = new EcoFlowAppAuthClient({
    email: EMAIL, password: PASSWORD, transport, log: (...a) => logged.push(a.join(' ')),
  });
  await assert.rejects(() => client.getSession());
  const text = logged.join('\n');
  assert.ok(!text.includes(PASSWORD));
  assert.ok(!text.includes(EMAIL));
  assert.ok(!text.includes('Email or password incorrect'));
});

test('a login response without a token is treated as an auth failure', async () => {
  const { transport } = recorder(() => ok({ user: { userId: USER_ID } }));
  const client = new EcoFlowAppAuthClient({ email: EMAIL, password: PASSWORD, transport });
  await assert.rejects(() => client.getSession(), /did not contain a token/);
});

test('an unapproved region is refused before any credential is sent', async () => {
  const { calls, transport } = recorder(() => loginOk());
  const client = new EcoFlowAppAuthClient({
    email: EMAIL, password: PASSWORD, host: 'https://evil.example.com', transport,
  });
  await assert.rejects(() => client.getSession(), /Unsupported EcoFlow API region/);
  assert.strictEqual(calls.length, 0);
});

test('getDeviceList sends the bearer token and normalizes the response', async () => {
  const { calls, transport } = recorder((req) => {
    if (req.url.endsWith('/auth/login')) return loginOk();
    return ok({
      bound: {
        ES22ZEB1ABCD0001: { deviceName: '', productName: '', online: 1 },
        BK61ZK1B2H720041: { deviceName: 'STREAM Ultra X', online: 1 },
      },
      share: { group: [{ sn: 'ES22ZEB1ABCD0002', deviceName: 'Garage AC 5000', online: 0 }] },
    });
  });
  const client = new EcoFlowAppAuthClient({ email: EMAIL, password: PASSWORD, transport });

  const devices = await client.getDeviceList();
  assert.deepStrictEqual(devices.map((d) => d.sn), [
    'ES22ZEB1ABCD0001', 'BK61ZK1B2H720041', 'ES22ZEB1ABCD0002',
  ]);
  const listCall = calls[1];
  assert.strictEqual(listCall.method, 'GET');
  assert.strictEqual(listCall.url, 'https://api.ecoflow.com/iot-service/user/device');
  assert.strictEqual(listCall.headers.Authorization, `Bearer ${TOKEN}`);
});

test('an expired token triggers exactly one re-login and a retry', async () => {
  let deviceCalls = 0;
  const { calls, transport } = recorder((req) => {
    if (req.url.endsWith('/auth/login')) return loginOk();
    deviceCalls += 1;
    if (deviceCalls === 1) return fail('401', 'token expired', 401);
    return ok({ bound: { ES22ZEB1ABCD0001: { online: 1 } } });
  });
  const client = new EcoFlowAppAuthClient({ email: EMAIL, password: PASSWORD, transport });

  const devices = await client.getDeviceList();
  assert.deepStrictEqual(devices.map((d) => d.sn), ['ES22ZEB1ABCD0001']);
  assert.deepStrictEqual(calls.map((c) => c.url), [
    'https://api.ecoflow.com/auth/login',
    'https://api.ecoflow.com/iot-service/user/device',
    'https://api.ecoflow.com/auth/login',
    'https://api.ecoflow.com/iot-service/user/device',
  ]);
});

test('a persistently rejected token does not loop', async () => {
  let logins = 0;
  const { transport } = recorder((req) => {
    if (req.url.endsWith('/auth/login')) {
      logins += 1;
      return loginOk();
    }
    return fail('401', 'token expired', 401);
  });
  const client = new EcoFlowAppAuthClient({ email: EMAIL, password: PASSWORD, transport });
  await assert.rejects(() => client.getDeviceList(), /401/);
  assert.strictEqual(logins, 2);
});

test('getMqttCredentials decrypts the certification payload', async () => {
  const payload = {
    certificateAccount: 'fake-account',
    certificatePassword: 'fake-cert-password',
    url: 'mqtt-e.ecoflow.com',
    port: '8084',
  };
  const { calls, transport } = recorder((req) => {
    if (req.url.endsWith('/auth/login')) return loginOk();
    return ok(encryptCertificationForTest(TOKEN, payload));
  });
  const client = new EcoFlowAppAuthClient({ email: EMAIL, password: PASSWORD, transport });

  const creds = await client.getMqttCredentials();
  assert.deepStrictEqual(creds, {
    account: 'fake-account',
    password: 'fake-cert-password',
    url: 'mqtt-e.ecoflow.com',
  });
  assert.strictEqual(calls[1].url, 'https://api.ecoflow.com/iot-auth/enterprise-development/user/certification');
  assert.strictEqual(calls[1].headers.Authorization, `Bearer ${TOKEN}`);
});

test('getMqttCredentials rejects an incomplete certification payload', async () => {
  const { transport } = recorder((req) => {
    if (req.url.endsWith('/auth/login')) return loginOk();
    return ok(encryptCertificationForTest(TOKEN, { url: 'mqtt-e.ecoflow.com' }));
  });
  const client = new EcoFlowAppAuthClient({ email: EMAIL, password: PASSWORD, transport });
  await assert.rejects(() => client.getMqttCredentials(), /certification response was incomplete/);
});

test('invalidateSession forces the next call to log in again', async () => {
  const { calls, transport } = recorder(() => loginOk());
  const client = new EcoFlowAppAuthClient({ email: EMAIL, password: PASSWORD, transport });
  await client.getSession();
  client.invalidateSession();
  assert.strictEqual(client.userId, undefined);
  await client.getSession();
  assert.strictEqual(calls.length, 2);
});

test('the client refuses to be constructed without credentials', () => {
  assert.throws(() => new EcoFlowAppAuthClient({ email: '', password: '' }), /email and password are required/);
});
