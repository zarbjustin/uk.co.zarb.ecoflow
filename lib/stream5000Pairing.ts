'use strict';

import { AppDevice, stream5000Devices } from './appDevices';
import { registerAppAuthHandlers } from './appAuthPairing';
import {
  isStream5000BetaEnabled,
  requireStream5000BetaAccess,
} from './stream5000Beta';
import {
  STREAM_5000_UNIT_DRIVER_IDS,
  stream5000ModelFromSn,
  Stream5000ModelSpec,
} from './stream5000Models';

export interface Stream5000PairingOptions {
  /** Optional compatibility filter for a deprecated model-specific driver. */
  selectDevices?: (devices: AppDevice[]) => AppDevice[];
  noAccountMessage?: string;
  /** Driver IDs which represent the same pairing role and must not duplicate a serial. */
  duplicateDriverIds?: readonly string[];
  /** Optional aggregate-oriented device naming. */
  deviceName?: (device: AppDevice, model: Stream5000ModelSpec) => string;
}

/**
 * Serial numbers already paired in the requested 5000-family role. Homey
 * scopes identity to a driver, so this cross-driver check prevents duplicate
 * monitors across the active and deprecated unit drivers while keeping the
 * aggregate namespace independent.
 */
export function pairedStream5000Serials(
  driver: any,
  driverIds: readonly string[] = STREAM_5000_UNIT_DRIVER_IDS,
): Set<string> {
  const serials = new Set<string>();
  const visited = new Set<any>();
  const collect = (familyDriver: any) => {
    if (!familyDriver || visited.has(familyDriver)) return;
    visited.add(familyDriver);
    let devices: any[] = [];
    try {
      devices = typeof familyDriver.getDevices === 'function' ? familyDriver.getDevices() : [];
    } catch {
      return;
    }
    for (const device of devices) {
      try {
        const sn = String(device?.getData?.().sn || '').trim();
        if (sn) serials.add(sn);
      } catch {
        // One malformed device must not prevent the remaining account devices
        // from being discovered during pairing.
      }
    }
  };

  collect(driver);
  for (const driverId of driverIds) {
    try {
      collect(driver?.homey?.drivers?.getDriver(driverId));
    } catch {
      // The compatibility driver can be absent in a development fixture.
    }
  }
  return serials;
}

/**
 * Register the common app-auth pairing flow for a STREAM 5000-family driver.
 * Each returned unit records the model and adapter chosen by the verified
 * registry, but only the immutable serial number is used as Homey's identity.
 */
export function registerStream5000Pairing(
  driver: any,
  session: any,
  options: Stream5000PairingOptions = {},
): void {
  const appAuth = registerAppAuthHandlers(driver, session);
  const selectDevices = options.selectDevices || stream5000Devices;
  const duplicateDriverIds = options.duplicateDriverIds || STREAM_5000_UNIT_DRIVER_IDS;

  session.setHandler('check_stream_5000_beta_access', async () =>
    isStream5000BetaEnabled(driver?.homey));

  session.setHandler('list_devices', async () => {
    // Pairing is the only gated operation. Already-paired devices continue to
    // run if the owner later disables beta access in Settings.
    requireStream5000BetaAccess(driver?.homey);
    const client = appAuth.getClient();
    if (!client) {
      throw new Error(options.noAccountMessage || 'No EcoFlow account is configured for STREAM 5000 Series pairing.');
    }
    const pairedSerials = pairedStream5000Serials(driver, duplicateDriverIds);
    const devices = selectDevices(await client.getDeviceList())
      .filter((device) => !pairedSerials.has(device.sn));
    return devices.map((device) => {
      const model = stream5000ModelFromSn(device.sn);
      if (!model) throw new Error(`No verified STREAM 5000 model for serial prefix ${device.sn.slice(0, 4)}`);
      return {
        name: options.deviceName ? options.deviceName(device, model) : device.name,
        data: { sn: device.sn },
        store: {
          stream5000ModelId: model.id,
          stream5000TelemetryAdapter: model.telemetryAdapter,
        },
      };
    });
  });
}
