'use strict';

const MIN_CAPACITY_KWH = 0.1;
const MAX_CAPACITY_KWH = 200;
const DEFAULT_EFFICIENCY_PERCENT = 92;
const MIN_EFFICIENCY_PERCENT = 50;
const MAX_EFFICIENCY_PERCENT = 100;
const MIN_DISCHARGE_POWER_W = 50;
const MAX_RUNTIME_MINUTES = 7 * 24 * 60;

function finite(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function settingNumber(value, fallback) {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function boundedNumber(value, min, max, fallback = null) {
  const n = settingNumber(value, fallback);
  return n != null && n >= min && n <= max ? n : fallback;
}

function cap(device, id) {
  return finite(device.getCapabilityValue(id));
}

function textCap(device, id) {
  const value = device.getCapabilityValue(id);
  return value == null ? null : String(value);
}

function setting(device, id) {
  try {
    return device.getSetting(id);
  } catch (e) {
    return null;
  }
}

function percentage(value) {
  return boundedNumber(value, 0, 100);
}

function effectiveFloorSoc(backupReserve, dischargeLimit) {
  const thresholds = [percentage(backupReserve), percentage(dischargeLimit)]
    .filter((value) => value != null);
  return thresholds.length ? Math.max(...thresholds) : null;
}

function calculateEnergy({
  capacityKwh, soc, backupReserve, dischargeLimit,
}) {
  const capacity = boundedNumber(capacityKwh, MIN_CAPACITY_KWH, MAX_CAPACITY_KWH);
  const charge = percentage(soc);
  const floor = effectiveFloorSoc(backupReserve, dischargeLimit);
  if (capacity == null || charge == null || floor == null) {
    return {
      capacityKwh: capacity,
      storedEnergyKwh: capacity != null && charge != null ? capacity * charge / 100 : null,
      usableEnergyKwh: null,
      effectiveFloorSoc: floor,
    };
  }
  return {
    capacityKwh: capacity,
    storedEnergyKwh: capacity * charge / 100,
    usableEnergyKwh: capacity * Math.max(0, charge - floor) / 100,
    effectiveFloorSoc: floor,
  };
}

function efficiencyPercent(value) {
  return boundedNumber(
    value,
    MIN_EFFICIENCY_PERCENT,
    MAX_EFFICIENCY_PERCENT,
    DEFAULT_EFFICIENCY_PERCENT,
  );
}

function calculateRuntimeMinutes({
  usableEnergyKwh,
  batteryPowerW,
  efficiency = DEFAULT_EFFICIENCY_PERCENT,
}) {
  const energy = finite(usableEnergyKwh);
  const power = finite(batteryPowerW);
  const efficiencyValue = efficiencyPercent(efficiency);
  if (energy == null || energy < 0 || power == null || power >= -MIN_DISCHARGE_POWER_W) return null;
  const minutes = energy * 1000 * (efficiencyValue / 100) / Math.abs(power) * 60;
  return Number.isFinite(minutes) && minutes >= 0 && minutes <= MAX_RUNTIME_MINUTES ? minutes : null;
}

function reportedRuntimeMinutes(value) {
  const minutes = finite(value);
  return minutes != null && minutes >= 0 && minutes <= MAX_RUNTIME_MINUTES ? minutes : null;
}

function selectRuntime({
  usableEnergyKwh,
  batteryPowerW,
  efficiency = DEFAULT_EFFICIENCY_PERCENT,
  reportedMinutes,
}) {
  const calculated = calculateRuntimeMinutes({ usableEnergyKwh, batteryPowerW, efficiency });
  if (calculated != null) return { minutes: calculated, source: 'calculated' };
  const reported = reportedRuntimeMinutes(reportedMinutes);
  if (reported != null) return { minutes: reported, source: 'device_reported' };
  return { minutes: null, source: null };
}

function pickDevice(homey, query) {
  let devices = [];
  let foundDriver = false;
  for (const driverId of ['stream']) {
    try {
      const driver = homey.drivers.getDriver(driverId);
      foundDriver = true;
      devices.push(...driver.getDevices());
    } catch (e) {
      // A build or fixture may not contain both aggregate transports.
    }
  }
  if (!foundDriver) return { error: 'no_driver' };
  if (!devices.length) return { error: 'no_device' };
  if (query.deviceId) {
    const selected = devices.find((device) => device.getId() === query.deviceId);
    if (selected) return { device: selected };
    return { error: 'device_not_found' };
  }
  const idx = Math.min(devices.length - 1, Math.max(0, (parseInt(query.index, 10) || 1) - 1));
  return { device: devices[idx] };
}

function streamData(homey, query = {}) {
  const picked = pickDevice(homey, query);
  if (picked.error) return { ok: false, reason: picked.error };
  const d = picked.device;
  const grid = cap(d, 'measure_power.grid');
  const battery = cap(d, 'measure_power');
  const solar = cap(d, 'measure_power.pv');
  const home = cap(d, 'measure_power.load');
  const soc = cap(d, 'measure_battery');
  const backupReserve = cap(d, 'backup_reserve_soc');
  const dischargeLimit = cap(d, 'discharge_limit');
  const dischargeRemaining = cap(d, 'discharge_remaining');
  const energy = calculateEnergy({
    capacityKwh: setting(d, 'installed_capacity_kwh'),
    soc,
    backupReserve,
    dischargeLimit,
  });
  const efficiency = efficiencyPercent(setting(d, 'discharge_efficiency_percent'));
  const runtime = selectRuntime({
    usableEnergyKwh: energy.usableEnergyKwh,
    batteryPowerW: battery,
    efficiency,
    reportedMinutes: dischargeRemaining,
  });

  return {
    ok: true,
    name: d.getName(),
    available: d.getAvailable(),
    grid,
    gridImport: grid == null ? null : Math.max(0, grid),
    gridExport: grid == null ? null : Math.max(0, -grid),
    solar,
    home,
    battery,
    batteryCharge: battery == null ? null : Math.max(0, battery),
    batteryDischarge: battery == null ? null : Math.max(0, -battery),
    soc,
    state: textCap(d, 'battery_charging_state'),
    mode: textCap(d, 'operating_mode'),
    feedIn: d.getCapabilityValue('feed_in_control') === true,
    backupReserve,
    chargeLimit: cap(d, 'charge_limit'),
    dischargeLimit,
    chargeRemaining: cap(d, 'charge_remaining'),
    dischargeRemaining,
    ...energy,
    dischargeEfficiencyPercent: efficiency,
    timeToEmpty: runtime.minutes,
    timeToEmptySource: runtime.source,
    solarToday: cap(d, 'energy_solar_today'),
    consumptionToday: cap(d, 'energy_consumption_today'),
    gridImportToday: cap(d, 'energy_grid_import_today'),
    gridExportToday: cap(d, 'energy_grid_export_today'),
    savingsToday: cap(d, 'energy_savings_today'),
    co2Today: cap(d, 'co2_today'),
    independence: cap(d, 'energy_independence'),
    solarForecastToday: cap(d, 'solar_forecast_today'),
    solarForecastTomorrow: cap(d, 'solar_forecast_tomorrow'),
    priceNow: cap(d, 'tariff_price_now'),
    forecastTarget: settingNumber(query.target, null),
  };
}

module.exports = {
  DEFAULT_EFFICIENCY_PERCENT,
  MAX_RUNTIME_MINUTES,
  MIN_DISCHARGE_POWER_W,
  calculateEnergy,
  calculateRuntimeMinutes,
  effectiveFloorSoc,
  selectRuntime,
  streamData,
};
