'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeApiHost } = require('../.homeybuild/lib/apiHost');

test('normalizeApiHost accepts only canonical EcoFlow API origins', () => {
  assert.equal(normalizeApiHost(), 'https://api.ecoflow.com');
  assert.equal(normalizeApiHost('https://api-e.ecoflow.com/'), 'https://api-e.ecoflow.com');
  assert.throws(() => normalizeApiHost('https://example.com'), /Unsupported/);
  assert.throws(() => normalizeApiHost('https://api.ecoflow.com.example.com'), /Unsupported/);
});
