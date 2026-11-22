'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readStream5000OfficialSoc } = require('../.homeybuild/lib/stream5000OfficialSoc');
const sn = 'ES21SYNTHETIC01';
const main = 'ES22SYNTHETIC02';
function client(percent, options = {}) {
  const calls = [];
  return { calls,
    getMainSn: async (selected, opts) => {
      calls.push({ kind: 'main', selected, opts });
      return calls.length > 2 && options.changed ? 'ES21SYNTHETIC03' : main;
    },
    getQuotaAll: async (selected, opts) => {
      calls.push({ kind: 'quota', selected, opts });
      if (options.reject) throw new Error('synthetic rejection');
      if (options.abort) options.abort.abort();
      return options.quota ?? { 'sysEnergyStreamReport-bpSoc': percent, 'sysEnergyStreamReport-bpPwr': 9999 };
    },
  };
}

test('official aggregate SOC accepts explicit zero from the resolved main only and keeps provenance', async () => {
  const c = client(0); const abort = new AbortController(); let now = 100000;
  const value = await readStream5000OfficialSoc(c, sn, abort.signal, () => now++);
  assert.deepEqual(value, { percent: 0, requestStartedAt: 100000, receivedAt: 100001,
    basis: 'cloud_latest_report', hardwareReportedAt: null });
  assert.deepEqual(c.calls.map(c => [c.kind, c.selected]), [['main', sn], ['quota', main], ['main', sn]]);
  assert.ok(c.calls.every(c => c.opts.fresh === true && c.opts.signal === abort.signal));
  assert.deepEqual(Object.keys(value).sort(), ['basis', 'hardwareReportedAt', 'percent', 'receivedAt', 'requestStartedAt']);
});

test('official SOC never infers zero from missing, nested, string, unit-only or invalid values', async () => {
  for (const percent of [undefined, null, '', '0', false, NaN, Infinity, -1, 101]) {
    assert.equal(await readStream5000OfficialSoc(client(percent), sn, new AbortController().signal, () => 100000), null);
  }
  for (const quota of [{}, { sysEnergyStreamReport: { bpSoc: 0 } }, { unitSoc: 0 }]) {
    assert.equal(await readStream5000OfficialSoc(client(null, { quota }), sn, new AbortController().signal, () => 100000), null);
  }
});

test('official SOC refuses wrong-family reporters, changed reporter, abort and stale or rolled-back reads', async () => {
  const signal = new AbortController().signal;
  const c = client(0); c.getMainSn = async () => 'BK61SYNTHETIC01';
  assert.equal(await readStream5000OfficialSoc(c, sn, signal, () => 100000), null);
  assert.equal(c.calls.length, 0, 'wrong reporter must not query quota');
  assert.equal(await readStream5000OfficialSoc(client(0, { changed: true }), sn, signal, () => 100000), null);
  const abort = new AbortController();
  assert.equal(await readStream5000OfficialSoc(client(0, { abort }), sn, abort.signal, () => 100000), null);
  for (const end of [99999, 115001, NaN]) {
    let calls = 0;
    assert.equal(await readStream5000OfficialSoc(client(0), sn, signal, () => calls++ ? end : 100000), null);
  }
  const before = client(0);
  assert.equal(await readStream5000OfficialSoc(before, '../invalid', signal, () => 100000), null);
  assert.equal(before.calls.length, 0);
  await assert.rejects(readStream5000OfficialSoc(client(0, { reject: true }), sn, signal, () => 100000));
});
