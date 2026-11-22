'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DualCtLinkedEs21, resolveLinkedEs21 } = require('../.homeybuild/lib/dualCtLinkedEs21');
const { es21MeterBlockWatts, es21MeterReading } = require('../.homeybuild/lib/streamAc5000Protocol');
const { scalar, nested, varint } = require('./helpers/dualCtSynthetic');

const meter = 'DUALCTHOUSE01';
const officeMeter = 'OFFICECT0001';
const house = 'ES21HOUSE0001';
const office = 'ES21OFFICE001';
function inventory() {
  const app = [[meter, 'Smart Meter Dual CT'], [officeMeter, 'Smart Meter'], [house, 'STREAM 5000'], [office, 'STREAM 5000']]
    .map(([sn, productName]) => ({ sn, productName, shared: false }));
  const links = new Map([[meter, house], [officeMeter, office], [house, house], [office, office]]);
  const client = { getDeviceList: async () => app, getMainSn: async (sn, options) => {
    assert.equal(options.fresh, true); assert(options.signal); return links.get(sn);
  } };
  return { app, links, client };
}
test('linked ES21 resolves the owned property main and rejects Office overlap, unknown membership, shared and duplicate devices', async () => {
  const { app, links, client } = inventory();
  const resolve = () => resolveLinkedEs21(client, meter, app);
  assert.equal(await resolve(), house);
  links.set(officeMeter, house); assert.equal(await resolve(), null);
  links.delete(officeMeter); assert.equal(await resolve(), null);
  links.set(officeMeter, office); links.set(house, office); assert.equal(await resolve(), null);
  links.set(house, house); app[2].shared = true; assert.equal(await resolve(), null);
  app[2].shared = false; app.push(app[2]); assert.equal(await resolve(), null);
});
test('relink during identity lookup cancels proof; late completion cannot revive previous ownership', async t => {
  const { app, client, links } = inventory();
  const lookup = client.getMainSn;
  client.getMainSn = async (...args) => { const host = await lookup(...args); if (args[0] === house) links.set(meter, office); return host; };
  assert.equal(await resolveLinkedEs21(client, meter, app), null);
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const binding = new DualCtLinkedEs21();
  let release;
  const pending = binding.refresh(() => new Promise(done => { release = done; }));
  now++;
  await binding.refresh(async () => office);
  release(house); await pending;
  const sample = (host, receivedAt, watts = 0) => ({ host, watts, receivedAt, until: receivedAt + 30000 });
  const read = value => binding.sample(now, () => value);
  assert.equal(read(sample(office, now)), null);
  now++;
  assert.equal(read(sample(house, now)), null);
  assert.equal(read(sample(office, now + 1)), null);
  const zero = sample(office, now);
  assert.equal(read(zero).watts, 0);
  now += 5000; assert.equal(read(zero), null);
  now += 70000; assert.equal(read(sample(office, now)), null);
});
test('only a single explicit signed meter block is eligible, including zero and export', () => {
  const bytes = (id, b) => Buffer.concat([varint(id * 8 + 2), varint(b.length), b]);
  const int = (id, n) => Buffer.concat([varint(id * 8), varint(n)]);
  const frame = (data, sn = house, enc = 0) => bytes(1, Buffer.concat([bytes(1, data), int(6, enc), int(8, 254), int(9, 39), bytes(25, Buffer.from(sn))]));
  const watts = data => es21MeterBlockWatts(frame(data), house);
  assert.equal(watts(nested(15, [[3, -430]])), -430);
  assert.equal(watts(nested(16, [[16, 0]])), 0);
  for (const data of [nested(11, [[1, 600]]), nested(15, [[2, 300]]), nested(15, [[3, 1], [3, 2]]),
    Buffer.concat([nested(15, [[3, 100]]), nested(16, [[16, 100]])]), nested(15, [[3, NaN]]), bytes(15, int(3, 100))]) {
    assert.equal(watts(data), null);
  }
  const grid = bytes(15, scalar(3, 500));
  assert.equal(es21MeterReading(frame(grid, office), house), null);
  assert.equal(es21MeterReading(frame(grid, house, 1), house), null);
  assert.equal(es21MeterReading(frame(grid).subarray(0, -1), house), null);
});


test('ES21 phase fields require one labelled meter block and explicit matching Phase 1 and net watts', () => {
  const pack = (id, b) => Buffer.concat([varint(id * 8 + 2), varint(b.length), b]);
  const number = (id, n) => Buffer.concat([varint(id * 8), varint(n)]);
  const meter = 'ES81SYNTHETIC';
  const label = pack(3, Buffer.from(meter));
  const net = scalar(16, 15000);
  const watts = scalar(4, 15000);
  const block = (...fields) => pack(16, Buffer.concat(fields));
  const decode = (data, reporter = house) => es21MeterReading(pack(1, Buffer.concat([
    pack(1, data), number(8, 254), number(9, 39), ...(reporter ? [pack(25, Buffer.from(reporter))] : []),
  ])), house);
  assert.deepEqual(decode(block(label, watts, scalar(7, 234), scalar(10, 65), net)).phaseOne,
    { meter, power: 15000, voltage: 234, current: 65 });
  assert.deepEqual(decode(block(label, scalar(4, 0), scalar(10, 0), scalar(16, 0))).phaseOne,
    { meter, power: 0, voltage: undefined, current: 0 });
  assert.equal(decode(block(label, watts, net)).phaseOne.current, undefined);
  for (const b of [block(net), block(watts, net), block(label, label, watts, net), block(label, watts, watts, net),
    block(label, scalar(4, 50), net), block(label, watts, scalar(5, 50), net), block(label, number(4, 42), net),
    Buffer.concat([block(label, watts, net),block(label, scalar(10, 65))])]) {
    const result = decode(b); assert.equal(result.watts, 15000); assert.equal(result.phaseOne, undefined);
  }
  assert.equal(decode(block(label, watts, net), null).phaseOne, undefined);
  assert.equal(decode(block(label, watts, net), office), null);
});
