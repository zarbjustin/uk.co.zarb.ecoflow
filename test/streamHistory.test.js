'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { todayRange, fetchDailyEnergy } = require('../.homeybuild/lib/streamHistory');

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

test('history never turns booleans, arrays or objects into invented numerical totals', async () => {
  for (const indexValue of [true, false, [], [12], {}, null, '', Infinity]) {
    const client = { getHistory: async () => [{ indexValue, extra: '1' }] };
    const daily = await fetchDailyEnergy(client, 'BK61TEST');
    assert.equal(daily.solarWh, undefined);
    assert.equal(daily.gridImportWh, undefined);
  }
  const daily = await fetchDailyEnergy({ getHistory: async () => [{ indexValue: '0', extra: '1' }] }, 'BK61TEST');
  assert.equal(daily.solarWh, 0);
});
