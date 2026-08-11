'use strict';

import { stream5000Devices } from './appDevices';
import type { AppDevice } from './appDevices';
import { registerAppAuthHandlers } from './appAuthPairing';
import {
  STREAM_5000_SYSTEM_DRIVER_IDS,
  STREAM_5000_DRIVER_IDS,
  STREAM_5000_UNIT_DRIVER_IDS,
  isSupportedStream5000Sn,
  stream5000ModelFromSn,
} from './stream5000Models';
import type { Stream5000ModelSpec } from './stream5000Models';
import { STREAM_5000_HOME_BATTERY_CAPABILITIES } from './stream5000Roles';

export interface Stream5000PairingOptions {
  /** Optional compatibility filter for a deprecated model-specific driver. */
  selectDevices?: (devices: AppDevice[]) => AppDevice[];
  noAccountMessage?: string;
  /** Driver IDs which represent the same pairing role and must not duplicate a serial. */
  duplicateDriverIds?: readonly string[];
  /** Optional aggregate-oriented device naming. */
  deviceName?: (device: AppDevice, model: Stream5000ModelSpec) => string;
  /** Capabilities that override the driver defaults for this pairing role. */
  capabilities?: readonly string[];
  /** Persisted semantic role, independent of the public driver name. */
  role?: 'home_battery' | 'physical_unit';
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
        if (isSupportedStream5000Sn(sn)) serials.add(sn);
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

/** Number of verified app-connected family identities across current and compatibility drivers. */
export function pairedStream5000FamilyCount(driver: any): number {
  return pairedStream5000Serials(driver, STREAM_5000_DRIVER_IDS).size;
}

/**
 * Convert app-account discovery results into Homey pairing records. Keeping
 * this pure makes it reusable by both the unified Home Battery driver and the
 * optional physical-unit driver without registering competing session handlers.
 */
export function stream5000PairingDevices(
  driver: any,
  devices: AppDevice[],
  options: Stream5000PairingOptions = {},
): any[] {
  const selectDevices = options.selectDevices || stream5000Devices;
  const duplicateDriverIds = options.duplicateDriverIds || STREAM_5000_UNIT_DRIVER_IDS;
  const pairedSerials = pairedStream5000Serials(driver, duplicateDriverIds);
  return selectDevices(devices)
    .filter((device) => !pairedSerials.has(device.sn))
    .map((device) => {
      const model = stream5000ModelFromSn(device.sn);
      if (!model) throw new Error(`No verified STREAM 5000 model for serial prefix ${device.sn.slice(0, 4)}`);
      return {
        name: options.deviceName ? options.deviceName(device, model) : device.name,
        data: { sn: device.sn },
        store: {
          streamProfile: 'stream_5000',
          stream5000Role: options.role || 'physical_unit',
          stream5000ModelId: model.id,
          stream5000TelemetryAdapter: model.telemetryAdapter,
        },
        ...(options.capabilities ? { capabilities: [...options.capabilities] } : {}),
      };
    });
}

/** Pairing defaults for a 5000 installation represented by STREAM Home Battery. */
export function stream5000HomeBatteryPairingOptions(): Stream5000PairingOptions {
  return {
    duplicateDriverIds: STREAM_5000_SYSTEM_DRIVER_IDS,
    capabilities: STREAM_5000_HOME_BATTERY_CAPABILITIES,
    deviceName: () => 'STREAM Home Battery',
    role: 'home_battery',
  };
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
  session.setHandler('list_devices', async () => {
    const client = appAuth.getClient();
    if (!client) {
      throw new Error(options.noAccountMessage || 'No EcoFlow account is configured for STREAM 5000 Series pairing.');
    }
    return stream5000PairingDevices(driver, await client.getDeviceList(), options);
  });
}
