import { STREAM_5000_DRIVER_IDS } from './stream5000Models';

/** Shared app credentials belong to all consumers, not just a battery family. */
export function hasOtherAppAuthDevices(homey: any, current: any): boolean {
  // Original physical STREAM monitors can also use app telemetry for PV3/4.
  for (const id of [...STREAM_5000_DRIVER_IDS, 'stream_unit', 'smartmeter_dual_ct_preview', 'smartmeter_dual_ct_energy']) {
    let driver: any;
    try {
      driver = homey.drivers.getDriver(id);
    } catch {
      continue;
    }
    if (!driver) continue;
    try {
      const devices = driver.getDevices();
      if (!Array.isArray(devices)) return true; // Unknown ownership: retain shared credentials.
      for (const device of devices) {
        if (device === current) continue;
        try {
          if (device.getData?.().sn) return true;
        } catch {
          return true;
        }
      }
    } catch {
      return true;
    } // Existing but unreadable driver: do not remove its credentials.
  }
  return false;
}
