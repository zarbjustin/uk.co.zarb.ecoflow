'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const { dualCtHomeyContributors: classify, DualCtHomeyEnergyContext, DUAL_CT_PROPERTY_GRID: grid } = require('../.homeybuild/lib/dualCtHomeyEnergyContext');
const device = (id, caps = ['measure_power'], cumulative = true, settings = {}) => ({ id, capabilities: caps, energyObj: { cumulative }, settings });
const sn = 'DUALCTSYNTHETIC01';
const source = { sn, shared: false, modelCodes: [{ field: 'productType', code: 421 }] };
function fixture(options = {}) {
  let now = 1000, closes = 0, lists = 0; let devices = [source]; let firmware = 'synthetic.1';
  const client = { getSession: async () => ({ host: 'https://api.ecoflow.com', userId: 'synthetic' }), getDeviceList: async () => devices };
  const context = new DualCtHomeyEnergyContext({ homey: {}, sn, client: () => client, now: () => now,
    readFirmware: async () => firmware, reader: async () => ({ list: async () => { lists++; return {}; }, close() { closes++; } }), ...options });
  return { context, client, now: n => { now = n; }, devices: d => { devices = d; }, firmware: f => { firmware = f; }, counts: () => ({ closes, lists }) };
}
test('Homey property inventory distinguishes fuel, downstream inclusion and property overlap conservatively', () => {
  const inventory = { grid: device('grid'), office: device('office', undefined, true, { energy_cumulative_include: false }),
    hidden: device('hidden', undefined, true, { energy_exclude: true }), gas: device('gas', ['meter_gas']), water: device('water', ['meter_water']),
    battery: device('battery', undefined, null) };
  assert.deepEqual(classify(inventory), { complete: true, contributors: [
    { id: 'grid', grid, contributes: true }, { id: 'office', grid, contributes: false }, { id: 'hidden', grid, contributes: false }] });
  for (const input of [null, [], { x: device('different') }, { x: { id: 'x', capabilities: ['measure_power'] } },
    { x: device('x', undefined, true, { energy_exclude: 'true' }) }]) assert.equal(classify(input).complete, false);
});
test('only the exact own driver/source is excluded, and duplicate own identities block the inventory', () => {
  const own = { sn, driverId: 'synthetic:driver' };
  const row = { ...device('own'), driverId: own.driverId, data: { sn } };
  assert.deepEqual(classify({ own: row, other: device('other') }, own).contributors, [{ id: 'other', grid, contributes: true }]);
  assert.equal(classify({ own: row, duplicate: { ...row, id: 'duplicate' } }, own).complete, false);
  assert.equal(classify({ own: row }, { ...own, sn: 'OTHER' }).contributors[0].contributes, true);
});
test('normal discovery cannot fabricate firmware or access Homey inventory when firmware is unavailable', async () => {
  const h = fixture({ readFirmware: undefined });
  await assert.rejects(h.context.refresh(), /energy_source_unavailable/);
  assert.equal(h.context.snapshot(), null); assert.deepEqual(h.counts(), { lists: 0, closes: 0 });
});
test('owned source and inventory expire independently, clock rollback clears eligibility and readers close on failure', async () => {
  const h = fixture(); await h.context.refresh(); assert.equal(h.context.snapshot().source.identity.firmware, 'synthetic.1');
  assert.deepEqual(h.counts(), { lists: 1, closes: 1 });
  h.now(91000); assert.equal(h.context.snapshot(), null);
  h.now(999); assert.equal(h.context.snapshot(), null);
  h.now(2000); h.devices([{ ...source, shared: true }]); await assert.rejects(h.context.refresh()); assert.equal(h.context.snapshot(), null);
  const failed = fixture({ reader: async () => ({ list: async () => { throw new Error('PRIVATE'); }, close() { failed.closed = true; } }) });
  await assert.rejects(failed.context.refresh(), /energy_source_unavailable/); assert.equal(failed.closed, true);
});
test('closing during firmware readback fences the late result and never creates a source snapshot', async () => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  const h = fixture({ readFirmware: () => pending });
  const read = h.context.refresh(); await new Promise(setImmediate); h.context.close(); release('synthetic.1');
  await assert.rejects(read); assert.equal(h.context.snapshot(), null); assert.equal(h.counts().lists, 0);
});

test('a hanging local inventory read times out and closes its reader without authorising Energy', async () => {
  let closed = false;
  const h = fixture({ readTimeoutMs: 5, reader: async () => ({ list: () => new Promise(() => {}), close() { closed = true; } }) });
  await assert.rejects(h.context.refresh(), /energy_source_unavailable/);
  assert.equal(closed, true); assert.equal(h.context.snapshot(), null);
});
