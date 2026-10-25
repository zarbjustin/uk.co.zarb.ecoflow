'use strict';

import { AppDevice, stream5000Devices } from './appDevices';
import { registerAppAuthHandlers } from './appAuthPairing';
import {
  isStream5000AggregatePairingEnabled,
  requireStream5000PairingAccess,
  stream5000PairingRole,
} from './stream5000PairingAccess';
import {
  STREAM_5000_UNIT_DRIVER_IDS,
  STREAM_5000_SYSTEM_DRIVER_IDS,
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
  const role = stream5000PairingRole(driver.id);
  const requireAccess = () => requireStream5000PairingAccess(role, driver?.homey);
  const appAuth = registerAppAuthHandlers(driver, session, { beforeAdd: requireAccess });
  const selectDevices = options.selectDevices || stream5000Devices;
  const duplicateDriverIds = options.duplicateDriverIds
    || (role === 'system' ? STREAM_5000_SYSTEM_DRIVER_IDS : STREAM_5000_UNIT_DRIVER_IDS);

  if (role === 'system') {
    session.setHandler('check_stream_5000_aggregate_access', async () => isStream5000AggregatePairingEnabled(driver?.homey));
  }

  session.setHandler('list_devices', async () => {
    // Physical monitors need no opt-in. Only new aggregate pairing is gated.
    requireAccess();
    const client = appAuth.getClient();
    if (!client) {
      throw new Error(options.noAccountMessage || 'No EcoFlow account is configured for STREAM 5000 Series pairing.');
    }
    const pairedSerials = pairedStream5000Serials(driver, duplicateDriverIds);
    const observe = driver?.homey?.app?.beginStreamDiscoveryObservation?.();
    const accountDevices = await client.getDeviceList();
    // Revoking consent during an in-flight cloud read must not return a list.
    requireAccess();
    if (typeof observe === 'function') observe(accountDevices);
    const devices = selectDevices(accountDevices)
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
