'use strict';

function finite(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function settingNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cap(device, id) {
  return finite(device.getCapabilityValue(id));
}

function textCap(device, id) {
  const value = device.getCapabilityValue(id);
  return value == null ? null : String(value);
}

function pickDevice(homey, query) {
  let devices = [];
  try {
    devices = homey.drivers.getDriver('stream').getDevices();
  } catch (e) {
    return { error: 'no_driver' };
  }
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
    soc: cap(d, 'measure_battery'),
    state: textCap(d, 'battery_charging_state'),
    mode: textCap(d, 'operating_mode'),
    feedIn: d.getCapabilityValue('feed_in_control') === true,
    backupReserve: cap(d, 'backup_reserve_soc'),
    chargeLimit: cap(d, 'charge_limit'),
    dischargeLimit: cap(d, 'discharge_limit'),
    chargeRemaining: cap(d, 'charge_remaining'),
    dischargeRemaining: cap(d, 'discharge_remaining'),
    solarToday: cap(d, 'energy_solar_today'),
    consumptionToday: cap(d, 'energy_consumption_today'),
    gridImportToday: cap(d, 'energy_grid_import_today'),
    gridExportToday: cap(d, 'energy_grid_export_today'),
    savingsToday: cap(d, 'energy_savings_today'),
    co2Today: cap(d, 'co2_today'),
    independence: cap(d, 'energy_independence'),
    solarForecastToday: cap(d, 'solar_forecast_today'),
    solarForecastTomorrow: cap(d, 'solar_forecast_tomorrow'),
    forecastTarget: settingNumber(query.target, null),
  };
}

module.exports = { streamData };
