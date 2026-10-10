'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { describe, render } = require('../settings/meter-status');

test('meter summary fails closed for missing, stale, malformed and unknown evidence', () => {
  assert.equal(describe(null).state, 'waiting');
  for (const ageSec of [91, -1, null, NaN, Infinity]) {
    const status = describe({ activeGrid: { source: 'direct_meter', value: 100, ageSec, stale: false } });
    assert.equal(status.state, 'stale');
    assert.equal(status.value, null);
  }
  assert.equal(describe({ activeGrid: { source: 'PRIVATE', value: 100, ageSec: 0, stale: false } }).state, 'waiting');
  assert.equal(describe({ activeGrid: { source: 'direct_meter', value: NaN, ageSec: 0, stale: false } }).value, null);
  assert.deepEqual(describe({ activeGrid: { source: 'linked_installation', value: 0, ageSec: 0.1, stale: false } }),
    { state: 'linked_installation', value: 0, ageSec: 1 });
});

function element() {
  return { textContent: '', children: [], ownerDocument: { createElement: () => ({ textContent: '' }) },
    appendChild(child) { this.children.push(child); } };
}

test('meter summary covers direct, fallback and missing meters without echoing private labels', () => {
  const output = element();
  render(output, { smartMeters: [
    { name: 'PRIVATE', evidence: { activeGrid: { source: 'direct_meter', value: -315, ageSec: 1, stale: false } } },
    { evidence: { activeGrid: { source: 'linked_installation', value: 0, ageSec: 2, stale: false } } },
    { evidence: null },
  ] }, key => key);
  const text = output.children.map(p => p.textContent).join('\n');
  assert.match(text, /meter 1: direct_meter/);
  assert.match(text, /power: -315 W/);
  assert.match(text, /meter 2: linked_installation/);
  assert.match(text, /fallback_help/);
  assert.match(text, /meter 3: waiting/);
  assert.match(text, /missing_help/);
  assert.match(text, /accounting/);
  assert.ok(!text.includes('PRIVATE'));
});

test('meter summary empty and failed report states and translations are complete', () => {
  const empty = element(); render(empty, { smartMeters: [] }, key => key);
  assert.equal(empty.children[0].textContent, 'none');
  const failure = element(); render(failure, null, key => key);
  assert.equal(failure.children[0].textContent, 'refresh');
  const english = require('../locales/en.json').settings.meter;
  for (const locale of ['de', 'nl']) {
    const entries = require(`../locales/${locale}.json`).settings.meter;
    assert.deepEqual(Object.keys(entries).sort(), Object.keys(english).sort());
    assert.ok(Object.values(entries).every(value => typeof value === 'string' && value.length));
  }
});
