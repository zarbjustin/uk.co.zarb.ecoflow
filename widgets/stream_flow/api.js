'use strict';

/**
 * Widget backend: returns the live EcoFlow-style power flow for a STREAM system,
 * read from the STREAM Battery (system) device's capabilities.
 */
module.exports = {
  async getFlow({ homey, query }) {
    let devices = [];
    try {
      devices = homey.drivers.getDriver('stream').getDevices();
    } catch (e) {
      return { ok: false, reason: 'no_driver' };
    }
    if (!devices.length) return { ok: false, reason: 'no_device' };

    const idx = Math.min(devices.length - 1, Math.max(0, (parseInt(query.index, 10) || 1) - 1));
    const d = devices[idx];

    const num = (cap) => {
      const v = d.getCapabilityValue(cap);
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    };

    return {
      ok: true,
      name: d.getName(),
      available: d.getAvailable(),
      grid: num('measure_power.grid'), // + import / - export (W)
      solar: num('measure_power.pv'), // W
      home: num('measure_power.load'), // W
      battery: num('measure_power'), // + charging / - discharging (W)
      soc: num('measure_battery'), // %
      state: d.getCapabilityValue('battery_charging_state') || null,
    };
  },
};
