'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readDualCtCurrentFirmware } = require('../.homeybuild/lib/dualCtFirmware');
const { EcoFlowAppAuthClient } = require('../.homeybuild/lib/EcoFlowAppAuthClient');
const { resolveDualCtGridEnergyContract, DUAL_CT_ENERGY_RUNTIME_ENABLED } = require('../.homeybuild/lib/dualCtGridEnergySource');
const sn = 'DUALCTSYNTHETIC01';
function response() {
  return { sn, productType: 421, online: 1,
    cpackInfo: { version: '1.0.0.41', isUpgrading: false, orderUpgradeStatus: 0,
      module: { controller: '1.0.0.23', radio: '1.1.0.12' }, moduleIsLoader: {} },
    latestPackInfo: { version: '2.0.0.1' } };
}
const ok = data => ({ status: 200, body: { code: '0', data } });
function clientWith(transport) {
  return new EcoFlowAppAuthClient({ email: 'firmware@example.invalid', password: 'synthetic-password', host: 'https://api-e.ecoflow.com', transport });
}
test('firmware reader selects the current pack, not an advertised update or a subsystem revision', () => {
  assert.deepEqual(readDualCtCurrentFirmware(response(), sn), { version: '1.0.0.41', basis: 'cloud_current_package', hardwareReportedAt: null });
  const changed = response(); changed.cpackInfo.version = '1.0.0.42';
  assert.equal(readDualCtCurrentFirmware(changed, sn).version, '1.0.0.42');
  assert.equal(DUAL_CT_ENERGY_RUNTIME_ENABLED, true);
  assert.equal(resolveDualCtGridEnergyContract({ productType: 421, firmware: '1.0.0.41' }).timing, 'verified_live_receipt_estimate');
});
test('wrong identity, offline/unknown state, offered-only versions and ambiguous schema cannot identify current firmware', () => {
  const cases = [null, [], {}, { ...response(), sn: 'OTHERCTSYNTHETIC01' }, { ...response(), productType: 420 },
    { ...response(), productType: '421' }, { ...response(), online: 0 }, { ...response(), online: true },
    { ...response(), online: undefined }, { ...response(), cpackInfo: null }, { ...response(), cpackInfo: [] },
    { ...response(), cpackInfo: { version: '1.0.0.41' } }];
  for (const value of [undefined, null, '', 'V1.0.0.41', '1.0.0', '1.0.0.256', '01.0.0.41', 16777257]) {
    const row = response(); row.cpackInfo.version = value; cases.push(row);
  }
  for (const row of cases) assert.equal(readDualCtCurrentFirmware(row, sn), null);
  assert.equal(readDualCtCurrentFirmware(response(), '../not-a-meter'), null);
});
test('upgrading, unknown upgrade status, loader mode and malformed module records fail closed', () => {
  for (const mutation of [c => { c.isUpgrading = true; }, c => { delete c.isUpgrading; }, c => { c.isUpgrading = 'false'; },
    c => { c.orderUpgradeStatus = 1; }, c => { delete c.orderUpgradeStatus; }, c => { c.orderUpgradeStatus = '0'; },
    c => { c.moduleIsLoader = { controller: true }; }, c => { c.moduleIsLoader = { controller: 0 }; },
    c => { delete c.moduleIsLoader; }, c => { c.moduleIsLoader = []; }, c => { c.module = {}; },
    c => { c.module.radio = 123; }, c => { c.module = []; }]) {
    const row = response(); mutation(row.cpackInfo); assert.equal(readDualCtCurrentFirmware(row, sn), null);
  }
});
test('app firmware requests use only owned-region metadata GET after authentication, with native required headers', async () => {
  const calls = [];
  const client = clientWith(async req => {
    calls.push(req);
    if (req.url.endsWith('/auth/login')) return ok({ token: 'synthetic-token', user: { userId: 'synthetic-user' } });
    assert.equal(req.method, 'GET'); assert.equal(req.body, undefined);
    const url = new URL(req.url);
    assert.equal(url.origin, 'https://api-e.ecoflow.com'); assert.equal(url.pathname, '/iot-service/device/latestPackInfo');
    assert.equal(url.searchParams.get('sn'), sn); assert.equal(url.searchParams.get('supportSelfRD'), '1');
    assert.equal(req.headers.lang, 'en-us'); assert.equal(req.headers.version, '6.17.5');
    return ok(response());
  });
  assert.equal((await client.getDualCtCurrentFirmware(sn)).version, '1.0.0.41');
  assert.equal((await client.getDualCtCurrentFirmware(sn)).hardwareReportedAt, null);
  assert.equal(calls.filter(r => r.method === 'GET').length, 2, 'perform a new lookup, not a cached version read');
  assert.equal(calls.filter(r => r.method !== 'GET').length, 1, 'only login, no version-report or upgrade write');
});
test('invalid selectors cause no authentication/network; metadata errors and mismatched replies never fall back to offered versions', async () => {
  const invalid = clientWith(() => assert.fail('invalid selector must not access the account'));
  assert.equal(await invalid.getDualCtCurrentFirmware('../bad'), null);
  for (const data of [{ ...response(), sn: 'OTHERCTSYNTHETIC01' }, { latestPackInfo: { version: '1.0.0.41' } }]) {
    const client = clientWith(async req => req.url.endsWith('/auth/login')
      ? ok({ token: 'synthetic-token', user: { userId: 'synthetic-user' } }) : ok(data));
    assert.equal(await client.getDualCtCurrentFirmware(sn), null);
  }
  const client = clientWith(async req => req.url.endsWith('/auth/login')
    ? ok({ token: 'synthetic-token', user: { userId: 'synthetic-user' } }) : { status: 503, body: { code: '503', message: 'unavailable' } });
  await assert.rejects(client.getDualCtCurrentFirmware(sn));
});
