'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  DEFAULT_EFFICIENCY_PERCENT,
  MAX_RUNTIME_MINUTES,
  MIN_DISCHARGE_POWER_W,
  calculateEnergy,
  calculateRuntimeMinutes,
  effectiveFloorSoc,
  selectRuntime,
  streamData,
} = require('../widgets/stream_common');

function device(id, name, { capabilities = {}, settings = {} } = {}) {
  return {
    getId: () => id,
    getName: () => name,
    getAvailable: () => true,
    getCapabilityValue: (capability) => capabilities[capability] ?? null,
    getSetting: (setting) => settings[setting] ?? null,
  };
}

function homey(streamDevices, unitDevices = [], stream5000Systems = []) {
  return {
    drivers: {
      getDriver: (id) => ({
        getDevices: () => {
          if (id === 'stream') return streamDevices;
          if (id === 'stream_5000_system') return stream5000Systems;
          return unitDevices;
        },
      }),
    },
  };
}

test('streamData selects a stable widget device id with index fallback', () => {
  const devices = [device('one', 'First'), device('two', 'Second')];
  assert.equal(streamData(homey(devices), { deviceId: 'two' }).name, 'Second');
  assert.equal(streamData(homey(devices), { index: '2' }).name, 'Second');
  assert.deepEqual(streamData(homey(devices), { deviceId: 'missing' }), {
    ok: false,
    reason: 'device_not_found',
  });
});

test('streamData never resolves a physical STREAM Unit id as an aggregate system', () => {
  const aggregate = device('system-main-sn', 'Home Battery');
  const unit = device('physical-unit-sn', 'Physical Unit');
  assert.equal(streamData(homey([aggregate], [unit]), { deviceId: aggregate.getId() }).name, 'Home Battery');
  assert.deepEqual(streamData(homey([aggregate], [unit]), { deviceId: unit.getId() }), {
    ok: false,
    reason: 'device_not_found',
  });
});

test('streamData resolves a STREAM 5000 installation aggregate alongside BK systems', () => {
  const bk = device('bk-system', 'BK Home Battery');
  const es22 = device('es22-system', '5000 Home Battery');
  assert.equal(streamData(homey([bk], [], [es22]), { deviceId: es22.getId() }).name, '5000 Home Battery');
});

test('widget manifests admit STREAM 5000 only where its aggregate telemetry is sufficient', () => {
  const commonAggregateMarker = 'measure_power';
  const bkRichAggregateMarker = 'measure_power.from_battery';
  const streamManifest = require('../drivers/stream/driver.compose.json');
  const unitManifest = require('../drivers/stream_unit/driver.compose.json');
  const stream5000Manifest = require('../drivers/stream_5000_system/driver.compose.json');
  const stream5000UnitManifest = require('../drivers/stream_5000_unit/driver.compose.json');
  assert.ok(streamManifest.capabilities.includes(commonAggregateMarker));
  assert.ok(stream5000Manifest.capabilities.includes(commonAggregateMarker));
  assert.equal(unitManifest.capabilities.includes(commonAggregateMarker), false);
  assert.deepEqual(unitManifest.energy, { batteries: ['INTERNAL'] });
  assert.equal(stream5000UnitManifest.capabilities.includes('measure_power'), false);
  assert.deepEqual(stream5000UnitManifest.energy, { batteries: ['INTERNAL'] });
  const capacity = streamManifest.settings.find((item) => item.id === 'installed_capacity_kwh');
  const efficiency = streamManifest.settings.find((item) => item.id === 'discharge_efficiency_percent');
  assert.equal(Object.hasOwn(capacity, 'value'), false);
  assert.deepEqual([capacity.min, capacity.max], [0.1, 200]);
  assert.deepEqual([efficiency.value, efficiency.min, efficiency.max], [92, 50, 100]);

  for (const widgetId of ['stream_battery_plan', 'stream_flow']) {
    const manifest = require(path.join('..', 'widgets', widgetId, 'widget.compose.json'));
    assert.equal(manifest.devices.filter.capabilities, commonAggregateMarker);
  }
  for (const widgetId of ['stream_balance', 'stream_solar_forecast', 'stream_tariff_opportunity']) {
    const manifest = require(path.join('..', 'widgets', widgetId, 'widget.compose.json'));
    assert.equal(manifest.devices.filter.capabilities, bkRichAggregateMarker);
  }
});

test('energy estimates use capacity, SOC and the greatest non-discharge floor', () => {
  const zeroFloor = calculateEnergy({
    capacityKwh: 9.6,
    soc: 26,
    backupReserve: 0,
    dischargeLimit: 0,
  });
  assert.equal(zeroFloor.storedEnergyKwh, 2.496);
  assert.equal(zeroFloor.usableEnergyKwh, 2.496);
  assert.equal(zeroFloor.effectiveFloorSoc, 0);

  const reserved = calculateEnergy({
    capacityKwh: 10,
    soc: 50,
    backupReserve: 20,
    dischargeLimit: 30,
  });
  assert.equal(reserved.storedEnergyKwh, 5);
  assert.equal(reserved.usableEnergyKwh, 2);
  assert.equal(reserved.effectiveFloorSoc, 30);

  assert.equal(calculateEnergy({
    capacityKwh: 10,
    soc: 20,
    backupReserve: 30,
    dischargeLimit: 10,
  }).usableEnergyKwh, 0);
});

test('energy estimates stay unavailable for missing or invalid capacity', () => {
  for (const capacityKwh of [null, '', 0, -1, 201, Number.NaN]) {
    const estimate = calculateEnergy({
      capacityKwh,
      soc: 50,
      backupReserve: 0,
      dischargeLimit: 0,
    });
    assert.equal(estimate.storedEnergyKwh, null);
    assert.equal(estimate.usableEnergyKwh, null);
  }
});

test('unknown reserve floor keeps usable energy unknown and uses device runtime', () => {
  assert.equal(effectiveFloorSoc(null, null), null);
  assert.deepEqual(calculateEnergy({
    capacityKwh: 9.6,
    soc: 80,
    backupReserve: null,
    dischargeLimit: null,
  }), {
    capacityKwh: 9.6,
    storedEnergyKwh: 7.68,
    usableEnergyKwh: null,
    effectiveFloorSoc: null,
  });

  const aggregate = device('system', 'Home Battery', {
    capabilities: {
      measure_battery: 80,
      measure_power: -500,
      discharge_remaining: 240,
    },
    settings: {
      installed_capacity_kwh: 9.6,
      discharge_efficiency_percent: 92,
    },
  });
  const data = streamData(homey([aggregate]), { deviceId: 'system' });
  assert.equal(data.storedEnergyKwh, 7.68);
  assert.equal(data.usableEnergyKwh, null);
  assert.equal(data.effectiveFloorSoc, null);
  assert.equal(data.timeToEmpty, 240);
  assert.equal(data.timeToEmptySource, 'device_reported');
});

test('runtime calculation follows the discharge sign convention and efficiency', () => {
  const exact = calculateRuntimeMinutes({
    usableEnergyKwh: 9.6 * 0.26,
    batteryPowerW: -420,
    efficiency: 100,
  });
  assert.ok(Math.abs(exact - 356.57142857142856) < 1e-9);

  const defaultEfficiency = calculateRuntimeMinutes({
    usableEnergyKwh: 9.6 * 0.26,
    batteryPowerW: -420,
  });
  assert.ok(Math.abs(defaultEfficiency - exact * DEFAULT_EFFICIENCY_PERCENT / 100) < 1e-9);
});

test('runtime calculation rejects idle, charging, invalid and excessive estimates', () => {
  assert.equal(calculateRuntimeMinutes({
    usableEnergyKwh: 2,
    batteryPowerW: -(MIN_DISCHARGE_POWER_W - 1),
  }), null);
  assert.equal(calculateRuntimeMinutes({
    usableEnergyKwh: 2,
    batteryPowerW: -MIN_DISCHARGE_POWER_W,
  }), null);
  assert.equal(calculateRuntimeMinutes({ usableEnergyKwh: 2, batteryPowerW: 420 }), null);
  assert.equal(calculateRuntimeMinutes({ usableEnergyKwh: Number.NaN, batteryPowerW: -420 }), null);
  assert.equal(calculateRuntimeMinutes({
    usableEnergyKwh: 200,
    batteryPowerW: -(MIN_DISCHARGE_POWER_W + 1),
  }), null);
});

test('runtime selection prefers calculation and otherwise labels device fallback', () => {
  assert.deepEqual(selectRuntime({
    usableEnergyKwh: 2.496,
    batteryPowerW: -420,
    efficiency: 100,
    reportedMinutes: 5460,
  }), {
    minutes: 356.57142857142856,
    source: 'calculated',
  });
  assert.deepEqual(selectRuntime({
    usableEnergyKwh: null,
    batteryPowerW: -420,
    reportedMinutes: 5460,
  }), {
    minutes: 5460,
    source: 'device_reported',
  });
  assert.deepEqual(selectRuntime({
    usableEnergyKwh: 2,
    batteryPowerW: -20,
    reportedMinutes: 120,
  }), {
    minutes: 120,
    source: 'device_reported',
  });
  assert.deepEqual(selectRuntime({
    usableEnergyKwh: 2,
    batteryPowerW: 420,
    reportedMinutes: 120,
  }), {
    minutes: 120,
    source: 'device_reported',
  });
  assert.deepEqual(selectRuntime({
    usableEnergyKwh: 2,
    batteryPowerW: 420,
    reportedMinutes: MAX_RUNTIME_MINUTES + 1,
  }), {
    minutes: null,
    source: null,
  });
});

test('streamData exposes stored, usable and preferred runtime data', () => {
  const aggregate = device('system', 'Home Battery', {
    capabilities: {
      measure_battery: 26,
      measure_power: -420,
      backup_reserve_soc: 0,
      discharge_limit: 0,
      discharge_remaining: 5460,
    },
    settings: {
      installed_capacity_kwh: 9.6,
      discharge_efficiency_percent: 100,
    },
  });
  const data = streamData(homey([aggregate]), { deviceId: 'system' });
  assert.equal(data.storedEnergyKwh, 2.496);
  assert.equal(data.usableEnergyKwh, 2.496);
  assert.ok(Math.abs(data.timeToEmpty - 356.57142857142856) < 1e-9);
  assert.equal(data.timeToEmptySource, 'calculated');
  assert.equal(data.dischargeRemaining, 5460);
});
