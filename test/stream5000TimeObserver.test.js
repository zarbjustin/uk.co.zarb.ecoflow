'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Stream5000TimeObserver, STREAM_5000_TIME_OBSERVER_RUNTIME_ENABLED: runtimeEnabled,
  STREAM_5000_TIME_OBSERVER_LIMITS: limits } = require('../.homeybuild/lib/stream5000TimeObserver');
const SN = 'ES21TESTUNIT0001';
const PEER = 'ES22TESTPEER0001';
const TOPIC = `/app/device/property/${SN}`;
function vi(input) {
  let n = BigInt(input); if (n < 0n) n += 1n << 64n;
  const bytes = [];
  do { bytes.push(Number(n & 127n) | (n > 127n ? 128 : 0)); n >>= 7n; } while (n);
  return Buffer.from(bytes);
}
const v = (number, value) => Buffer.concat([vi(number * 8), vi(value)]);
const group = (number, bytes) => Buffer.concat([vi(number * 8 + 2), vi(bytes.length), bytes]);
const str = (number, value) => group(number, Buffer.from(value));
function fp(number, value, double = false) {
  const bytes = Buffer.alloc(double ? 8 : 4);
  if (double) bytes.writeDoubleLE(value); else bytes.writeFloatLE(value);
  return Buffer.concat([vi(number * 8 + (double ? 1 : 5)), bytes]);
}
const header = (pdata, command = [254, 39], serial = SN, extra = Buffer.alloc(0)) => group(1, Buffer.concat([
  group(1, pdata), v(8, command[0]), v(9, command[1]), ...(serial === null ? [] : [str(25, serial)]), extra,
]));
const node = value => header(group(11, v(5, value)));
function harness(enabled = true) {
  const time = { now: 100000 };
  const observer = new Stream5000TimeObserver(SN, enabled, () => time.now);
  return { time, observer, start: () => observer.start(), evidence: () => observer.readEvidence().samples };
}

test('runtime/default observer is disabled and never touches payloads, clocks, settings or transports', () => {
  assert.equal(runtimeEnabled, false);
  const observer = new Stream5000TimeObserver(SN, undefined, () => { throw new Error('clock must not run'); });
  assert.equal(observer.start(), false);
  observer.observe(new Proxy({}, { get() { throw new Error('payload must not be read'); } }), TOPIC);
  assert.equal(observer.status().status, 'disabled');
  assert.deepEqual(observer.readEvidence().samples, []);
  for (const serial of [PEER.replace('ES22', 'ES23'), 'BK31TESTUNIT0001', '', null]) {
    const invalid = new Stream5000TimeObserver(serial, true);
    assert.equal(invalid.start(), false);
    assert.equal(invalid.status().status, 'disabled');
  }
  assert.equal(new Stream5000TimeObserver(SN, 'true').start(), false);
});

test('explicit start is single-use and receipts/reads cannot extend its capture or retention deadline', () => {
  const h = harness();
  h.observer.observe(node(50), TOPIC);
  assert.equal(h.observer.status().status, 'idle');
  assert.equal(h.start(), true);
  h.observer.observe(node(50), TOPIC);
  h.time.now += limits.captureMs - 1;
  assert.equal(h.start(), false);
  assert.equal(h.evidence().length, 1);
  h.time.now++;
  h.observer.observe(node(60), TOPIC);
  assert.equal(h.observer.status().status, 'complete');
  assert.equal(h.observer.status().reason, 'time_limit');
  assert.equal(h.evidence().length, 1);
  h.time.now = 100000 + limits.retentionMs;
  assert.deepEqual(h.evidence(), []);
  assert.equal(h.observer.status().reason, 'retention_expired');
  assert.equal(h.start(), false);
});

test('raw numeric candidates keep explicit zeros, receipt times, paths and scopes without guessing duration units', () => {
  const h = harness(); h.start();
  h.observer.observe(header(Buffer.concat([
    group(11, Buffer.concat([v(5, 0), v(8, 1234)])),
    group(33, Buffer.concat([fp(6, 61.5), v(9, 600)])),
    group(44, Buffer.concat([v(2, 31), v(10, 1234)])),
    group(54, group(1, Buffer.concat([str(1, SN), v(2, 61), v(4, 500)]))),
  ])), TOPIC);
  const evidence = h.observer.readEvidence();
  assert.equal(evidence.durationUnitsVerified, false);
  assert.equal(evidence.nativeDisplayScopeVerified, false);
  assert.equal(evidence.receiptOnly, true);
  const sample = evidence.samples[0];
  assert.equal(sample.receivedAt, 100000);
  assert.equal(sample.command, '254/39');
  assert.deepEqual(sample.fields.find(f => f.path === 'f11.5'), { path: 'f11.5', wire: 0, value: 0, structuralScope: 'node_11' });
  assert.equal(sample.fields.find(f => f.path === 'f33.6').value, 61.5);
  assert.equal(sample.fields.find(f => f.path === 'f44.10').structuralScope, 'node_44');
  assert.equal(sample.fields.find(f => f.path === 'f54.1.4').value, 500, 'no half-watt scaling or direction inference');
  assert.equal(sample.fields.some(f => f.path === 'f11.7'), false, 'no absent-as-zero inference');
  sample.fields[0].value = 999; sample.fields.push({ secret: 'PRIVATE' });
  assert.equal(h.evidence()[0].fields[0].value, 0);
  assert.doesNotMatch(JSON.stringify(h.observer.readEvidence()), /PRIVATE|ES21|ES22|minutes|seconds|capacityWh/);
});

test('only exact subscribed report/get-reply topics and allowed telemetry commands are admitted', () => {
  const h = harness(); h.start();
  for (const topic of [`/app/device/property/${PEER}`, `/app/device/property/${SN}/extra`,
    `/app/account/${SN}/thing/property/set`, `/app/account/${SN}/thing/property/set_reply`,
    `/app/account/${SN}/thing/property/get`, `/open/account/${SN}/quota`, `/app//${SN}/thing/property/get_reply`]) {
    h.observer.observe(node(51), topic);
  }
  h.observer.observe(node(51), '/'.repeat(100000));
  h.observer.observe(node(51), null);
  assert.equal(h.observer.status().inspectedFrames, 0);
  h.observer.observe(header(group(11, v(5, 51)), [254, 38]), TOPIC);
  h.observer.observe(header(group(11, v(5, 51)), [254, 40]), TOPIC);
  assert.equal(h.evidence().length, 0);
  h.observer.observe(node(51), `/app/PRIVATE_ACCOUNT/${SN}/thing/property/get_reply`);
  assert.equal(h.evidence().length, 1);
  assert.doesNotMatch(JSON.stringify(h.observer.readEvidence()), /PRIVATE_ACCOUNT|TESTUNIT|property/);
});

test('foreign/encrypted/ambiguous headers are ignored while valid bundle siblings remain available', () => {
  const h = harness(); h.start();
  const pdata = group(11, v(5, 51));
  h.observer.observe(Buffer.concat([
    header(pdata, [254, 39], PEER), header(pdata, [254, 39], SN, v(6, 1)),
    header(pdata, [254, 39], SN, v(8, 254)), header(pdata, [254, 39], SN, v(10, 999)),
    header(pdata, [254, 39], null),
  ]), TOPIC);
  assert.equal(h.evidence().length, 1);
  assert.equal(h.evidence()[0].fields[0].value, 51);
});

test('peer serials, text, byte arrays, task windows, arbitrary groups and out-of-range scalars never leave the observer', () => {
  const h = harness(); h.start();
  h.observer.observe(header(Buffer.concat([
    str(777, 'PRIVATE_TOKEN'), group(40, group(1, str(7, 'PRIVATE_WINDOW'))),
    group(11, Buffer.concat([str(1, 'PRIVATE_NAME'), fp(2, NaN), fp(3, Infinity), v(4, 31536001),
      fp(5, -Infinity, true), v(6, 9007199254740992n), fp(7, -10)])),
    group(54, Buffer.concat([
      group(1, Buffer.concat([str(1, PEER), v(2, 88), v(4, 777)])),
      group(1, Buffer.concat([str(1, SN), v(2, 61), str(3, 'PRIVATE_LABEL'), v(4, 500), str(17, 'PRIVATE_MODULE')])),
    ])),
  ])), TOPIC);
  const fields = h.evidence()[0].fields;
  assert.deepEqual(fields.map(f => f.path), ['f11.7', 'f54.1.2', 'f54.1.4']);
  assert.equal(fields[0].value, -10);
  assert.doesNotMatch(JSON.stringify(h.observer.readEvidence()), /PRIVATE|TESTPEER|TESTUNIT|777|NaN|Infinity/);
});

test('duplicate scalar/groups/own identities reject ambiguous candidates, not valid command siblings', () => {
  for (const pdata of [group(11, Buffer.concat([v(5, 1), v(5, 2)])),
    Buffer.concat([group(11, v(5, 1)), group(11, v(5, 2))]),
    group(54, group(1, Buffer.concat([str(1, SN), str(1, PEER), v(4, 99)]))),
    group(54, Buffer.concat([group(1, Buffer.concat([str(1, SN), v(4, 1)])), group(1, Buffer.concat([str(1, SN), v(4, 2)]))]))]) {
    const h = harness(); h.start();
    h.observer.observe(Buffer.concat([header(pdata), header(v(9, 31), [32, 50])]), TOPIC);
    assert.equal(h.evidence().length, 1);
    assert.equal(h.evidence()[0].command, '32/50');
    assert.equal(h.observer.status().rejectedFrames, 1);
  }
});

test('sampling is per command, independent of unrelated packets, and never invents new receipts on reads', () => {
  const h = harness(); h.start();
  h.observer.observe(node(50), TOPIC);
  h.time.now += 1;
  h.observer.observe(node(51), TOPIC);
  h.observer.observe(header(v(9, 31), [32, 50]), TOPIC);
  assert.equal(h.evidence().length, 2);
  assert.equal(h.evidence()[0].receivedAt, 100000);
  h.time.now = 100000 + limits.sampleIntervalMs;
  h.observer.observe(node(52), TOPIC);
  assert.equal(h.evidence().length, 3);
  h.observer.status(); h.observer.readEvidence();
  assert.equal(h.evidence()[0].receivedAt, 100000);
});

test('malformed protobuf, oversized headers and packed byte content are bounded and isolated', () => {
  for (const payload of [Buffer.from([255]), header(Buffer.from([0])), header(Buffer.from([15])),
    header(Buffer.from([18, 5, 1])), Buffer.concat(Array.from({ length: limits.headersPerFrame + 1 }, () => node(50))),
    header(Buffer.concat(Array.from({ length: limits.parsedFieldsPerFrame + 1 }, () => v(200, 1)))),
    header(Buffer.from([8, ...Array(11).fill(255)]))]) {
    const h = harness(); h.start();
    assert.doesNotThrow(() => h.observer.observe(payload, TOPIC));
    assert.deepEqual(h.evidence(), []);
    assert.equal(h.observer.status().rejectedFrames, 1);
  }
});

test('the inspected-frame budget also caps empty, oversized and repeated malformed frames', () => {
  for (const bytes of [Buffer.alloc(0), Buffer.alloc(limits.frameBytes + 1), Buffer.from([255])]) {
    const h = harness(); h.start();
    for (let count = 0; count < limits.inspectedFrames + 3; count++) h.observer.observe(bytes, TOPIC);
    assert.equal(h.observer.status().inspectedFrames, limits.inspectedFrames);
    assert.equal(h.observer.status().reason, 'frame_limit');
    assert.deepEqual(h.evidence(), []);
  }
});

test('total input budget stops inspection even when individual malformed frames fit the frame bound', () => {
  const h = harness(); h.start();
  const bytes = Buffer.alloc(limits.frameBytes);
  for (let count = 0; count < limits.inspectedFrames; count++) h.observer.observe(bytes, TOPIC);
  assert.equal(h.observer.status().inputBytes, limits.inputBytes);
  assert.equal(h.observer.status().reason, 'input_limit');
});

test('sample and row budgets finish captures with bounded, explicitly truncated candidate output', () => {
  const h = harness(); h.start();
  for (let frame = 0; frame < 10; frame++) {
    h.observer.observe(Buffer.concat(Array.from({ length: 8 }, () => node(50))), TOPIC);
    h.time.now += limits.sampleIntervalMs;
  }
  assert.equal(h.observer.status().retainedSamples, limits.samples);
  assert.equal(h.observer.status().reason, 'sample_limit');
  const r = harness(); r.start();
  const scalars = count => Buffer.concat(Array.from({ length: count }, (_value, index) => v(index + 1, 1)));
  const record = group(1, Buffer.concat([str(1, SN), ...Array.from({ length: 11 }, (_value, index) => v(index + 2, 1))]));
  const payload = Buffer.concat([group(11, scalars(16)), group(33, scalars(16)), group(50, record), group(54, record)]);
  for (let frame = 0; frame < 10; frame++) {
    r.observer.observe(Buffer.concat(Array.from({ length: 8 }, () => header(payload))), TOPIC);
    r.time.now += limits.sampleIntervalMs;
  }
  assert.equal(r.observer.status().retainedRows, limits.rows);
  assert.equal(r.observer.status().reason, 'row_limit');
  assert.equal(r.evidence().at(-1).truncated, true);
  assert.ok(r.evidence().every(sample => sample.fields.length <= limits.rowsPerHeader));
  assert.ok(JSON.stringify(r.observer.readEvidence()).length < 262144, 'private evidence stays bounded, not a support export');
});

test('retention expiry, clock rollback and invalid clocks erase evidence without automatic rearming', () => {
  for (const invalidNow of [99999, NaN, Infinity]) {
    const h = harness(); h.start(); h.observer.observe(node(50), TOPIC);
    h.time.now = invalidNow;
    assert.deepEqual(h.evidence(), []);
    assert.equal(h.observer.status().reason, 'clock_reset');
    h.time.now = 100001;
    assert.equal(h.start(), false);
    h.observer.observe(node(50), TOPIC);
    assert.deepEqual(h.evidence(), []);
  }
  for (const now of [0, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.equal(new Stream5000TimeObserver(SN, true, () => now).start(), false);
  }
  assert.equal(new Stream5000TimeObserver(SN, true, () => { throw new Error('PRIVATE'); }).start(), false);
});

test('close erases all numeric candidates, is idempotent, and rejects late callbacks', () => {
  const h = harness(); h.start(); h.observer.observe(node(50), TOPIC);
  h.observer.close(); h.observer.close();
  h.observer.observe(node(60), TOPIC);
  assert.equal(h.observer.status().status, 'stopped');
  assert.equal(h.observer.status().retainedSamples, 0);
  assert.equal(h.observer.status().retainedRows, 0);
  assert.deepEqual(h.evidence(), []);
  assert.equal(h.start(), false);
});
