'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { decodeDualCtCandidates } = require('../.homeybuild/lib/dualCtDecoder');
const context = { productType: 421, cmdFunc: 254, cmdId: 21, source: 'app_mqtt', encoding: 'plain', receivedAt: 1000, now: 1000 };
function vi(value) { const out = []; do { out.push((value & 127) | (value > 127 ? 128 : 0)); value = Math.floor(value / 128); } while (value); return Buffer.from(out); }
function float(field, value) { const bytes = Buffer.alloc(4); bytes.writeFloatLE(value); return Buffer.concat([vi(field * 8 + 5), bytes]); }

test('observed overlapping fields decode unverified candidates with no phase summing or energy', () => {
  const values = [[515, -100], [962, 20], [963, -40], [772, 50], [956, 230], [957, 231], [771, 232], [958, -0.5], [959, 0.2], [784, 0]];
  const result = decodeDualCtCandidates(Buffer.concat(values.map(([f, v]) => float(f, v))), context);
  assert.equal(result.readings.length, 10);
  assert.equal(result.readings[0].candidate, 'aggregatePower');
  assert.equal(result.readings[0].value, -100);
  assert.equal(result.hardwareValidated, false);
  assert.equal(result.measurementTimestampKnown, false);
  assert.equal(result.contributesToEnergy, false);
  assert.equal(result.controlsEnabled, false);
  assert.equal(result.pairingEnabled, false);
});

test('additional fields expose float32 candidates only, with no guessed units, nested energy or runtime readings', () => {
  const result = decodeDualCtCandidates(Buffer.concat([991, 992, 993, 998, 985, 986, 987, 988, 989, 990].map((field) => float(field, 123))), context);
  assert.equal(result.readings.length, 10);
  for (const row of result.readings) { assert.equal(row.candidateUnit, null); assert.match(row.candidate, /^bankB_/); }
  assert.equal(result.additionalBankMappingVerified, false);
  const nested = Buffer.concat([vi(773 * 8 + 2), vi(4), Buffer.from('TEST')]);
  assert.equal(decodeDualCtCandidates(nested, context), null);
  assert.equal(decodeDualCtCandidates(float(515, 123), { ...context, cmdId: 22 }), null);
});

test('omitted-marker interpretation requires two correctly wired legacy fields and carries its provenance', () => {
  const omitted = { ...context, encodingBasis: 'omitted_zero_candidate' };
  assert.equal(decodeDualCtCandidates(float(515, 1), omitted), null);
  assert.equal(decodeDualCtCandidates(Buffer.concat([float(985, 230),float(991, -20)]), omitted), null);
  const result = decodeDualCtCandidates(Buffer.concat([float(515, -1),float(962, 0),float(998, -2)]), omitted);
  assert.equal(result.readings.length, 3);
  assert.equal(result.readings[1].value, 0);
  assert.equal(result.readings[2].candidateUnit, null);
  assert.equal(result.encodingVerified, false);
  assert.ok(result.readings.every(row => row.encodingBasis === 'omitted_zero_candidate'));
  for (const bad of [float(998,NaN),float(957,Infinity),float(988,1000001),
    Buffer.concat([vi(962*8),vi(2)]),float(962,7)]) {
    assert.equal(decodeDualCtCandidates(Buffer.concat([float(515,1),float(962,2),bad]), omitted), null);
  }
});

test('missing fields remain absent; wrong wires and nonfinite values never fabricate readings', () => {
  assert.equal(decodeDualCtCandidates(Buffer.concat([vi(515 * 8), vi(1)]), context), null);
  assert.equal(decodeDualCtCandidates(float(515, NaN), context), null);
  assert.equal(decodeDualCtCandidates(float(515, Infinity), context), null);
  assert.equal(decodeDualCtCandidates(float(515, 2000000), context), null);
  const result = decodeDualCtCandidates(float(962, 0), context);
  assert.equal(result.readings.length, 1);
  assert.equal(result.readings[0].value, 0);
});

test('identity transport and receipt freshness gates fail closed', () => {
  const payload = float(515, 123);
  assert.equal(decodeDualCtCandidates(payload, null), null);
  assert.equal(decodeDualCtCandidates(payload, undefined), null);
  for (const changed of [{ productType: 420 }, { cmdFunc: 32 }, { source: 'developer_mqtt' },
    { encoding: 'masked' }, { now: 999 }, { now: 91000 }, { now: 91001 }, { receivedAt: NaN }, { now: Infinity }]) {
    assert.equal(decodeDualCtCandidates(payload, { ...context, ...changed }), null);
  }
  assert.equal(decodeDualCtCandidates(payload, { ...context, now: 90999 }).receivedAgeSec, 89.999);
});

test('truncated malicious duplicate and oversized payloads do not return partial data', () => {
  const payload = float(515, 123);
  for (const invalid of [payload.subarray(0, payload.length - 1), Buffer.concat([payload, Buffer.from([0xff])]),
    Buffer.concat([payload, payload]), Buffer.alloc(65537), Buffer.from([0]), Buffer.from([15])]) {
    assert.equal(decodeDualCtCandidates(invalid, context), null);
  }
});
