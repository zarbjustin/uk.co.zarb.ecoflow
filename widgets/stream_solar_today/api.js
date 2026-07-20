'use strict';

/**
 * Widget backend: today's solar yield plus live PV, per-string breakdown and
 * (when the history feed populates them) CO2 avoided and energy independence.
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
  async getSolar({ homey, query }) {
    const d = resolveDevice(homey, query);
    if (!d) return { ok: false, reason: 'no_device' };
    const strings = ['measure_power.pv1', 'measure_power.pv2', 'measure_power.pv3', 'measure_power.pv4']
      .filter((c) => d.hasCapability(c))
      .map((c) => num(d, c));
    return {
      ok: true,
      name: d.getName(),
      available: d.getAvailable(),
      solarToday: num(d, 'energy_solar_today'),
      pv: num(d, 'measure_power.pv'),
      strings,
      co2: d.hasCapability('co2_today') ? num(d, 'co2_today') : null,
      independence: d.hasCapability('energy_independence') ? num(d, 'energy_independence') : null,
    };
  },
};
