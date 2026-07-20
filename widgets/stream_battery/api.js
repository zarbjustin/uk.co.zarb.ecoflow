'use strict';

/**
 * Widget backend: STREAM battery state of charge with the backup-reserve and
 * discharge-limit thresholds, charge state, time-to-full/empty and mode.
 */

function resolveDevice(homey, query) {
  let devices = [];
  try {
    devices = homey.drivers.getDriver('stream').getDevices();
  } catch (e) {
    return null;
  }
  if (!devices.length) return null;
  const id = query && query.id;
  if (id) {
    const match = devices.find((d) => {
      const data = typeof d.getData === 'function' ? d.getData() : null;
      return data && (data.id === id || data.sn === id || data.mainSn === id);
    });
    if (match) return match;
  }
  const idx = Math.min(devices.length - 1, Math.max(0, (parseInt(query && query.index, 10) || 1) - 1));
  return devices[idx];
}

function num(d, cap) {
  const v = d.getCapabilityValue(cap);
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

module.exports = {
  async getBattery({ homey, query }) {
    const d = resolveDevice(homey, query);
    if (!d) return { ok: false, reason: 'no_device' };
    return {
      ok: true,
      name: d.getName(),
      available: d.getAvailable(),
      soc: num(d, 'measure_battery'),
      reserve: num(d, 'backup_reserve_soc'),
      dischargeLimit: num(d, 'discharge_limit'),
      chargeLimit: num(d, 'charge_limit'),
      battery: num(d, 'measure_power'),
      state: d.getCapabilityValue('battery_charging_state') || null,
      chargeRemaining: num(d, 'charge_remaining'),
      dischargeRemaining: num(d, 'discharge_remaining'),
      mode: d.getCapabilityValue('operating_mode') || null,
      soh: num(d, 'battery_soh'),
    };
  },
};
