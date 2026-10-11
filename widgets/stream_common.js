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

function cap(device, id, diagnostics) {
  try {
    if (diagnostics === null || diagnostics?.[id]?.stale === true) return null;
  } catch { return null; }
  return finite(device.getCapabilityValue(id));
}

function textCap(device, id, diagnostics) {
  try {
    if (diagnostics === null || diagnostics?.[id]?.stale === true) return null;
  } catch { return null; }
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
  for (const driverId of ['stream', 'stream_5000_system']) {
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
  let diagnostics;
  try { diagnostics = d.getReadingDiagnostics?.(); } catch { diagnostics = null; }
  const read = id => cap(d, id, diagnostics);
  const text = id => textCap(d, id, diagnostics);
  const grid = read('measure_power.grid');
  const battery = read('measure_power');
  const solar = read('measure_power.pv');
  const home = read('measure_power.load');
  const soc = read('measure_battery');
  const is5000 = typeof d.getConfigurationDiagnostics === 'function';
  let monitoring;
  try { monitoring = d.getMonitoringTrialDiagnostics?.(); } catch { monitoring = { enabled: true }; }
  const monitoringTrial = monitoring?.enabled === true;
  const monitoringGuarded = monitoringTrial || monitoring?.rollbackAwaitingFreshOriginal === true;
  let configuration;
  try { configuration = d.getConfigurationDiagnostics?.(); } catch { /* Unknown, no private errors. */ }
  const reported = (key) => {
    const entry = configuration?.source === 'captured_app_protocol' ? configuration.values?.[key] : null;
    return entry?.stale === false ? entry.value : null;
  };
  const backupReserve = monitoringGuarded ? null
    : is5000 ? percentage(finite(reported('backupReservePct'))) : read('backup_reserve_soc');
  const dischargeLimit = monitoringGuarded ? null
    : is5000 ? percentage(finite(reported('minDischargeSocPct'))) : read('discharge_limit');
  const reserveEnabled = reported('backupReserveEnabled');
  let reserveForEstimate = backupReserve;
  if (is5000 && reserveEnabled === false) reserveForEstimate = 0;
  if (is5000 && reserveEnabled !== true && reserveEnabled !== false) reserveForEstimate = null;
  // Original-source control limits are not validated for the combined reporter.
  const floorKnown = !monitoringGuarded && (!is5000 || (reserveForEstimate != null && dischargeLimit != null));
  const dischargeRemaining = read('discharge_remaining');
  const energy = calculateEnergy({
    capacityKwh: setting(d, 'installed_capacity_kwh'),
    soc,
    backupReserve: floorKnown ? reserveForEstimate : null,
    dischargeLimit: floorKnown ? dischargeLimit : null,
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
    monitoringTrial,
    monitoringGuarded,
    controlsAvailable: !monitoringGuarded && !is5000 && d.getAvailable() !== false,
    readingScope: monitoringTrial ? 'selected_system_trial' : monitoringGuarded ? 'rollback_wait' : 'paired_installation',
    accountingScope: monitoringGuarded ? 'original_source_unverified_combined_scope' : 'paired_source',
    grid,
    gridImport: grid == null ? null : Math.max(0, grid),
    gridExport: grid == null ? null : Math.max(0, -grid),
    solar,
    home,
    battery,
    batteryCharge: battery == null ? null : Math.max(0, battery),
    batteryDischarge: battery == null ? null : Math.max(0, -battery),
    soc,
    state: text('battery_charging_state'),
    mode: monitoringGuarded ? null : is5000 ? (['self_powered', 'intelligent_plus', 'custom'].includes(reported('mode')) ? reported('mode') : null)
      : text('operating_mode'),
    feedIn: monitoringGuarded ? null : d.getCapabilityValue('feed_in_control') === true,
    backupReserve,
    chargeLimit: monitoringGuarded ? null : is5000 ? percentage(finite(reported('maxChargeSocPct'))) : read('charge_limit'),
    dischargeLimit,
    chargeRemaining: read('charge_remaining'),
    dischargeRemaining,
    ...energy,
    dischargeEfficiencyPercent: efficiency,
    timeToEmpty: runtime.minutes,
    timeToEmptySource: runtime.source,
    solarToday: read('energy_solar_today'),
    consumptionToday: read('energy_consumption_today'),
    gridImportToday: read('energy_grid_import_today'),
    gridExportToday: read('energy_grid_export_today'),
    savingsToday: read('energy_savings_today'),
    co2Today: read('co2_today'),
    independence: read('energy_independence'),
    solarForecastToday: read('solar_forecast_today'),
    solarForecastTomorrow: read('solar_forecast_tomorrow'),
    priceNow: read('tariff_price_now'),
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
