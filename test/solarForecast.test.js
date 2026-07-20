'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  radiationToKwh, parseRadiation, toForecast, fetchSolarRadiation,
} = require('../.homeybuild/lib/solarForecast.js');

test('radiationToKwh scales MJ/m2 by the calibration factor and clamps at 0', () => {
  assert.strictEqual(radiationToKwh(20, 0.67), 20 * 0.67);
  assert.strictEqual(radiationToKwh(0, 0.67), 0);
  assert.strictEqual(radiationToKwh(-5, 0.67), 0);
  assert.strictEqual(radiationToKwh(null, 0.67), null);
  assert.strictEqual(radiationToKwh(20, NaN), null);
});

test('parseRadiation reads today/tomorrow from the Open-Meteo daily array', () => {
  const r = parseRadiation({ daily: { shortwave_radiation_sum: [18.4, 9.1] } });
  assert.strictEqual(r.today, 18.4);
  assert.strictEqual(r.tomorrow, 9.1);
});

test('parseRadiation is null-safe on malformed responses', () => {
  assert.deepStrictEqual(parseRadiation({}), { today: null, tomorrow: null });
  assert.deepStrictEqual(parseRadiation({ daily: {} }), { today: null, tomorrow: null });
  assert.deepStrictEqual(parseRadiation(null), { today: null, tomorrow: null });
});

test('toForecast converts both days with the factor', () => {
  const fc = toForecast({ today: 20, tomorrow: 10 }, 0.5);
  assert.strictEqual(fc.todayKwh, 10);
  assert.strictEqual(fc.tomorrowKwh, 5);
});

test('fetchSolarRadiation builds the request URL and parses (injected getJson)', async () => {
  let calledUrl = '';
  const r = await fetchSolarRadiation(51.5, -0.12, async (url) => {
    calledUrl = url;
    return { daily: { shortwave_radiation_sum: [22.2, 11.1] } };
  });
  assert.match(calledUrl, /latitude=51\.5000/);
  assert.match(calledUrl, /longitude=-0\.1200/);
  assert.match(calledUrl, /shortwave_radiation_sum/);
  assert.strictEqual(r.today, 22.2);
  assert.strictEqual(r.tomorrow, 11.1);
});

test('fetchSolarRadiation returns nulls for invalid coordinates', async () => {
  const r = await fetchSolarRadiation(NaN, NaN, async () => ({}));
  assert.deepStrictEqual(r, { today: null, tomorrow: null });
});
