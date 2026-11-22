'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DualCtHistory, dualCtHistorySnapshot } = require('../.homeybuild/lib/dualCtHistory');
const { describe, render } = require('../settings/dual-ct-status');

test('history coalesces repeated fixed events, bounds memory and reports ages without timestamps', () => {
  const history = new DualCtHistory();
  for (let i = 0; i < 200; i++) history.record(0, 'app_mqtt', 'protobuf', 1000 + i);
  assert.deepEqual(history.snapshot(2000), [{ deviceIndex: 0, source: 'app_mqtt', status: 'protobuf',
    firstAgeSec: 1, lastAgeSec: 0.801, samples: 128 }]);
  for (let i = 0; i < 100; i++) history.record(i % 2, 'developer_mqtt', 'json', 3000 + i);
  assert.equal(history.snapshot(4000).length, 24);
  assert.doesNotMatch(JSON.stringify(history.snapshot(4000)), /firstAt|lastAt|3000/);
});

test('history projection strips private fields and rejects invalid/future ages and unknown enums', () => {
  const base = { deviceIndex: 0, source: 'app_mqtt', status: 'protobuf', firstAgeSec: 10, lastAgeSec: 0, samples: 1 };
  const result = dualCtHistorySnapshot([base, { ...base, source: 'PRIVATE' }, { ...base, lastAgeSec: -1 },
    { ...base, samples: Infinity }, { ...base, firstAgeSec: -1 }, { ...base, firstAgeSec: 0, lastAgeSec: 1 },
    { ...base, secret: 'PRIVATE', value: 999, sn: 'PRIVATE' }]);
  assert.equal(result.length, 2); assert.doesNotMatch(JSON.stringify(result), /PRIVATE|999/);
  const history = new DualCtHistory(); history.record(0, 'app_mqtt', 'protobuf', 1000);
  assert.deepEqual(history.snapshot(999), []); assert.deepEqual(history.snapshot(2000), []);
  history.record(0, 'app_mqtt', 'protobuf', 1000); history.clear(); assert.deepEqual(history.snapshot(2000), []);
});

test('plain summary distinguishes not-found, no interpretable data and actual structure without claiming readings', () => {
  const en = require('../locales/en.json').settings.dual_ct;
  function text(evidence) {
    const element = { textContent: '', children: [], ownerDocument: { createElement: () => ({ textContent: '' }) },
      appendChild(child) { this.children.push(child); } };
    render(element, evidence, (key) => en[key]);
    return element.children.map((child) => child.textContent).join(' ');
  }
  assert.match(text({ status: 'no_explicit_model' }), /does not prove the meter is absent/);
  assert.match(text({ status: 'complete', frames: 0 }), /not a zero reading/);
  const evidence = { status: 'complete', frames: 2, deviceCount: 1, history: [{ source: 'app_json', status: 'json', lastAgeSec: 2 }],
    routes: [{ deviceIndex: 0, source: 'app_mqtt', status: 'listening' }], sn: 'PRIVATE', values: 'PRIVATE' };
  assert.match(text(evidence), /Channel mapping, units and direction are still unverified/);
  assert.match(text(evidence), /receipt not established/); assert.doesNotMatch(text(evidence), /PRIVATE/);
  assert.equal(describe({ status: 'PRIVATE', frames: Infinity, routes: [{ source: 'PRIVATE' }] }).state, 'not_started');
});

test('EN DE NL summary labels are complete and capture guidance no longer demands a one-minute deadline', () => {
  const keys = Object.keys(require('../locales/en.json').settings.dual_ct).sort();
  for (const locale of ['en', 'de', 'nl']) {
    const translations = require(`../locales/${locale}.json`).settings;
    assert.deepEqual(Object.keys(translations.dual_ct).sort(), keys);
    assert(Object.values(translations.dual_ct).every((value) => typeof value === 'string' && value.length > 0));
    assert.doesNotMatch(translations.reporter.capture_guide_screenshots, /Within one minute|Innerhalb einer Minute|binnen één minuut/);
  }
});
