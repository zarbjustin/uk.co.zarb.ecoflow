'use strict';

/**
 * Widget backend: live grid direction (import/export) with today's imported and
 * exported energy and the grid feed-in state, read from the STREAM system device.
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
  async getGrid({ homey, query }) {
    const d = resolveDevice(homey, query);
    if (!d) return { ok: false, reason: 'no_device' };
    return {
      ok: true,
      name: d.getName(),
      available: d.getAvailable(),
      grid: num(d, 'measure_power.grid'), // + import / - export (W)
      importToday: d.hasCapability('energy_grid_import_today') ? num(d, 'energy_grid_import_today') : null,
      exportToday: d.hasCapability('energy_grid_export_today') ? num(d, 'energy_grid_export_today') : null,
      feedIn: typeof d.getCapabilityValue('feed_in_control') === 'boolean' ? d.getCapabilityValue('feed_in_control') : null,
    };
  },
};
