'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { todayRange } = require('../.homeybuild/lib/streamHistory');

test('todayRange follows the Homey timezone date', () => {
  const instant = new Date('2026-07-12T23:30:00.000Z');
  assert.deepEqual(todayRange(instant, 'Europe/London'), {
    beginTime: '2026-07-13 00:00:00',
    endTime: '2026-07-13 23:59:59',
  });
  assert.deepEqual(todayRange(instant, 'UTC'), {
    beginTime: '2026-07-12 00:00:00',
    endTime: '2026-07-12 23:59:59',
  });
});
