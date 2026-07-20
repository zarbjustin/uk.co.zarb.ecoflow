'use strict';

/**
 * Widget backend: tariff-relevant control state — operating mode, backup reserve,
 * charge/discharge limits and feed-in — plus a state badge derived from the live
 * grid direction and control settings. Half-hourly prices come from the user's
 * Octopus integration (the EcoFlow open API exposes no tariff data), so this
 * widget never invents price figures.
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
  async getTariff({ homey, query }) {
    const d = resolveDevice(homey, query);
    if (!d) return { ok: false, reason: 'no_device' };
    return {
      ok: true,
      name: d.getName(),
      available: d.getAvailable(),
      mode: d.getCapabilityValue('operating_mode') || null,
      reserve: num(d, 'backup_reserve_soc'),
      chargeLimit: num(d, 'charge_limit'),
      dischargeLimit: num(d, 'discharge_limit'),
      feedIn: typeof d.getCapabilityValue('feed_in_control') === 'boolean' ? d.getCapabilityValue('feed_in_control') : null,
      grid: num(d, 'measure_power.grid'),
      soc: num(d, 'measure_battery'),
    };
  },
};
