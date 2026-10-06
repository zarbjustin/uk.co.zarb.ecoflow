'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseStreamAc5000Frame } = require('../.homeybuild/lib/streamAc5000Protocol');
const { stream5000CapabilityCandidates } = require('../.homeybuild/lib/stream5000Capabilities');
const { createStreamPv5000ResearchAdapter } = require('../.homeybuild/lib/streamPv5000Research');
const { isSupportedStream5000Sn, supportedStream5000Models } = require('../.homeybuild/lib/stream5000Models');
const captures = require('./fixtures/stream5000PvResearch.json');
const existingCaptures = require('./fixtures/stream5000Telemetry.json');

function varint(number) {
  let value = BigInt(number);
  const bytes = [];
  do {
    let byte = Number(value & 127n);
    value >>= 7n;
    if (value) byte |= 128;
    bytes.push(byte);
  } while (value);
  return Buffer.from(bytes);
}
const tag = (number, wire) => varint(number * 8 + wire);
const int = (number, value) => Buffer.concat([tag(number, 0), varint(value)]);
const message = (number, value) => Buffer.concat([tag(number, 2), varint(value.length), value]);
const text = (number, value) => message(number, Buffer.from(value));
function float(number, value) {
  const bytes = Buffer.alloc(4);
  bytes.writeFloatLE(value);
  return Buffer.concat([tag(number, 5), bytes]);
}
function frame(payload, serial = captures.unit_a, func = 254, id = 39) {
  return message(1, Buffer.concat([message(1, payload), int(8, func), int(9, id), text(25, serial)]));
}
function pvEntry(serial, fields) { return message(1, Buffer.concat([text(1, serial), ...fields])); }
function parsePv(fields, serial = captures.unit_a) {
  return parseStreamAc5000Frame(frame(message(50, pvEntry(serial, fields))));
}
const zeroPv = { totalW: 0, string1W: 0, string2W: 0, string3W: 0, string4W: 0 };

test('ES21 research candidates stay offline despite separate core-monitoring admission', () => {
  const adapter = createStreamPv5000ResearchAdapter(captures.unit_a.toLowerCase());
  assert.equal(adapter.admission, 'offline-only');
  assert.equal(isSupportedStream5000Sn(captures.unit_a), true);
  assert.deepEqual(supportedStream5000Models().map((model) => model.telemetryAdapter), ['es22', 'es21']);
  assert.throws(() => createStreamPv5000ResearchAdapter('ES22TESTUNITAAAA'), /ES21/);
  assert.throws(() => createStreamPv5000ResearchAdapter('ES23UNVERIFIED'), /ES21/);
  assert.equal(adapter.parse(frame(message(11, int(5, 80)), captures.unit_b)), null);
  assert.equal(adapter.parse(frame(message(11, int(5, 80)), captures.unit_a)).socPct, 80);
  const { stream5000TelemetryAdapter } = require('../.homeybuild/lib/stream5000Adapters');
  const { stream5000ModelFromSn } = require('../.homeybuild/lib/stream5000Models');
  const runtime = stream5000TelemetryAdapter(stream5000ModelFromSn(captures.unit_a));
  assert.equal(runtime.parse(frame(message(11, int(5, 80)), captures.unit_b), captures.unit_a), null);
});

test('masked night capture clears each recorded unit; empty f50 does not clear or invent units', () => {
  const adapter = createStreamPv5000ResearchAdapter(captures.unit_a);
  const night = adapter.parse(frame(Buffer.from(captures.frames[0].pdata_hex, 'hex')));
  assert.deepEqual(night.unitsBySn[captures.unit_a].pv, zeroPv);
  assert.deepEqual(night.unitsBySn[captures.unit_b].pv, zeroPv);
  assert.deepEqual(adapter.candidates(night).directPv, zeroPv);
  assert.equal(adapter.parse(frame(Buffer.from(captures.frames[1].pdata_hex, 'hex'))), null);
});

test('linked daylight capture keeps own and relayed MPPT readings keyed by serial, never position', () => {
  const source = captures.unit_b;
  const telemetry = parseStreamAc5000Frame(frame(Buffer.from(captures.frames[2].pdata_hex, 'hex'), source));
  const own = stream5000CapabilityCandidates(telemetry, source).directPv;
  const peer = stream5000CapabilityCandidates(telemetry, captures.unit_a).directPv;
  assert.ok(Math.abs(own.totalW - 201.96947) < 0.001);
  assert.ok(Math.abs(own.string1W - 62.68369) < 0.001);
  assert.deepEqual(peer, { totalW: 216, string1W: 60, string2W: 62, string3W: 62, string4W: 30 });
  assert.deepEqual(stream5000CapabilityCandidates(telemetry, 'ES21UNLISTED'), {});
  assert.equal(telemetry.solarW, undefined, 'MPPT production does not become f11.9');
  const adapter = createStreamPv5000ResearchAdapter(source);
  assert.equal(adapter.mapUnit(telemetry).measure_battery, 48);
  assert.equal(adapter.mapSystem(telemetry).measure_battery, undefined, 'no invented installation SOC');
  assert.equal(Object.keys(adapter.mapUnit(telemetry)).some((key) => key.includes('pv')), false);
});

test('relayed partial capture does not label an omitted producing string as zero or residual', () => {
  const telemetry = parseStreamAc5000Frame(frame(Buffer.from(captures.frames[3].pdata_hex, 'hex'), captures.unit_b));
  assert.deepEqual(stream5000CapabilityCandidates(telemetry, captures.unit_a).directPv,
    { totalW: 239, string1W: 72, string2W: 71, string3W: 74 });
  assert.equal(telemetry.unitsBySn[captures.unit_a].pv.string4W, undefined);
});

test('missing strings clear only when an explicit total accounts for the reported strings', () => {
  assert.deepEqual(parsePv([float(3, 30), float(10, 10), float(11, 20)]).unitsBySn[captures.unit_a].pv,
    { totalW: 30, string1W: 0, string2W: 10, string3W: 20, string4W: 0 });
  assert.deepEqual(parsePv([float(10, 10)]).unitsBySn[captures.unit_a].pv, { string2W: 10 });
  assert.deepEqual(parsePv([float(3, 30)]).unitsBySn[captures.unit_a].pv, { totalW: 30 });
  assert.deepEqual(parsePv([float(3, 32.5), float(10, 10), float(11, 20)]).unitsBySn[captures.unit_a].pv,
    { totalW: 32.5, string1W: 0, string2W: 10, string3W: 20, string4W: 0 });
  assert.equal(parsePv([float(3, 32.6), float(10, 10), float(11, 20)]).unitsBySn[captures.unit_a].pv.string4W, undefined);
});

test('absent groups and another unit night entry cannot erase the source unit PV', () => {
  const source = captures.unit_a;
  const telemetry = parseStreamAc5000Frame(frame(Buffer.concat([
    message(50, pvEntry(source, [float(3, 100), float(9, 100)])),
    message(50, pvEntry(captures.unit_b, [])),
  ])));
  assert.equal(telemetry.unitsBySn[source].pv.totalW, 100);
  assert.deepEqual(telemetry.unitsBySn[captures.unit_b].pv, zeroPv);
  const noPv = parseStreamAc5000Frame(frame(message(33, float(6, 80))));
  assert.deepEqual(stream5000CapabilityCandidates(noPv, source), {});
});

test('bundled partial records merge only present PV keys, not an unrelated unit or synthetic zero', () => {
  const first = frame(message(50, pvEntry(captures.unit_a, [float(3, 239), float(12, 22)])));
  const second = frame(message(50, pvEntry(captures.unit_a, [float(3, 239), float(9, 72), float(10, 71), float(11, 74)])));
  const telemetry = parseStreamAc5000Frame(Buffer.concat([first, second]));
  assert.deepEqual(telemetry.unitsBySn[captures.unit_a].pv,
    { totalW: 239, string1W: 72, string2W: 71, string3W: 74, string4W: 22 });
});

test('malformed entries and invalid PV scalars cannot become night zeros or valid capabilities', () => {
  for (const fields of [[float(3, Infinity)], [float(3, NaN)], [int(3, 20)], [float(3, -10)]]) {
    const telemetry = parsePv(fields);
    assert.equal(telemetry.unitsBySn[captures.unit_a].pv.string1W, undefined);
    assert.deepEqual(stream5000CapabilityCandidates(telemetry, captures.unit_a), {});
  }
  const partiallyInvalid = parsePv([float(3, 100), float(9, 100), float(10, NaN)]);
  assert.deepEqual(partiallyInvalid.unitsBySn[captures.unit_a].pv, { totalW: 100, string1W: 100 },
    'an invalid string is not omitted/idle evidence even when valid strings match the total');
  const malformed = parseStreamAc5000Frame(frame(message(50, Buffer.concat([
    message(1, Buffer.from([0xff])), pvEntry(captures.unit_b, [float(3, 50), float(9, 50)]),
  ]))));
  assert.equal(malformed.unitsBySn[captures.unit_a], undefined);
  assert.equal(malformed.unitsBySn[captures.unit_b].pv.totalW, 50);
  assert.deepEqual(stream5000CapabilityCandidates({ unitsBySn: { [captures.unit_a]: { pv: { totalW: 100001 } } } }, captures.unit_a), {});
});

test('AC socket and solar-node candidates require a local source and stay distinct from MPPT', () => {
  const telemetry = parseStreamAc5000Frame(frame(Buffer.concat([
    message(11, Buffer.concat([float(7, 704), float(9, 80)])),
    message(50, pvEntry(captures.unit_a, [float(3, 200), float(9, 200)])),
  ])));
  assert.deepEqual(stream5000CapabilityCandidates(telemetry, captures.unit_a),
    { acSocketW: 352, solarNodeW: 80, directPv: { totalW: 200, string1W: 200, string2W: 0, string3W: 0, string4W: 0 } });
  assert.deepEqual(stream5000CapabilityCandidates(telemetry, captures.unit_b), {});
  assert.deepEqual(stream5000CapabilityCandidates({ acSocketW: 352, solarW: 80 }, captures.unit_a), {});
  const loaded = parseStreamAc5000Frame(Buffer.from(existingCaptures.socket.loaded[0].hex, 'hex'));
  assert.equal(loaded.acSocketW, 355, 'existing ES22 socket capture remains unchanged');
});

test('unknown expansion/gateway fields and BMS mAh must not become capacity, membership or energy', () => {
  const telemetry = parseStreamAc5000Frame(frame(Buffer.concat([
    int(9, 37), int(11, 20000), int(12, 10000), int(13, 19800), message(60, int(1, 2)),
  ]), captures.unit_a, 32, 50));
  assert.deepEqual(telemetry, { battTempC: 37, sourceSn: captures.unit_a });
  assert.deepEqual(stream5000CapabilityCandidates(telemetry, captures.unit_a), {});
});
