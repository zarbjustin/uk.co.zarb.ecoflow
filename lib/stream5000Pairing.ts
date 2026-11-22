'use strict';

import { AppDevice, stream5000Devices } from './appDevices';
import { registerAppAuthHandlers } from './appAuthPairing';
import { readStreamTopologyEvidence, TOPOLOGY_STALE_AFTER_MS } from './streamTopology';
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
        const sn = String(device?.getData?.().sn || '').trim().toUpperCase();
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

/** Fresh shared serials are overlap evidence, never proof that other candidates are disjoint. */
export function observedAggregateSerials(driver: any, inventoryMessage: string): Set<string> {
  const serials = new Set<string>();
  const visited = new Set<any>();
  const now = Date.now();
  const fresh = (at: unknown): at is number => typeof at === 'number' && Number.isFinite(at)
    && at > 0 && at <= now && now - at <= TOPOLOGY_STALE_AFTER_MS;
  const collect = (owner: any) => {
    if (!owner || visited.has(owner)) return;
    visited.add(owner);
    let devices: any[];
    try {
      devices = owner.getDevices();
      if (!Array.isArray(devices)) throw new Error('Unavailable inventory');
    } catch {
      throw new Error(inventoryMessage);
    }
    for (const device of devices) {
      let sn: string;
      try {
        sn = device.getData().sn.trim().toUpperCase();
        if (!sn) throw new Error('Unavailable identity');
      } catch {
        throw new Error(inventoryMessage);
      }
      serials.add(sn);
      try {
        const source = device.getAggregateSourceSn?.();
        if (source != null) {
          if (typeof source !== 'string' || !source.trim()) throw new Error('Unavailable source identity');
          serials.add(source.trim().toUpperCase());
        }
      } catch {
        throw new Error(inventoryMessage);
      }
      const evidence = readStreamTopologyEvidence(device);
      if (evidence?.addressSn === sn) {
        for (const peer of evidence.peers) if (fresh(peer.seenAt)) serials.add(peer.sn);
      }
      try {
        const resolved = device.getResolvedReporterEvidence?.();
        if (fresh(resolved?.receivedAt) && typeof resolved.sn === 'string'
          && typeof resolved.readSn === 'string' && typeof resolved.currentReadSn === 'string'
          && resolved.readSn.toUpperCase() === resolved.currentReadSn.toUpperCase()) {
          serials.add(resolved.sn.toUpperCase());
        }
      } catch { /* Missing reporter evidence leaves scope unknown; it is not disjointness. */ }
    }
  };
  collect(driver);
  for (const id of [...STREAM_5000_SYSTEM_DRIVER_IDS, 'stream']) {
    let owner: any;
    try {
      owner = driver?.homey?.drivers?.getDriver(id);
    } catch {
      throw new Error(inventoryMessage);
    }
    collect(owner);
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
  const message = (key: string, fallback: string) => {
    const path = `stream_5000_pairing.${key}`;
    const translated = driver?.homey?.__?.(path);
    return translated && translated !== path ? translated : fallback;
  };
  const inventoryMessage = () => message('inventory', 'Home Battery inventory could not be checked. Reopen pairing; existing devices are unchanged.');
  const listedSerials = new Set<string>();
  let listedClient: object | null = null;
  let listingEpoch = 0;
  let scopeConfirmed = false;
  const appAuth = registerAppAuthHandlers(driver, session, {
    beforeAdd: (candidate) => {
      requireAccess();
      if (role !== 'system') return;
      if (!scopeConfirmed) throw new Error(message('unconfirmed', 'Confirm that each selected Home Battery represents a separate installation.'));
      const sn = typeof candidate?.data?.sn === 'string' ? candidate.data.sn.trim().toUpperCase() : '';
      if (!listedSerials.has(sn) || !listedClient || appAuth.getClient() !== listedClient) {
        throw new Error(message('selection', 'Selection expired or was not discovered. Reopen the device list.'));
      }
      if (observedAggregateSerials(driver, inventoryMessage()).has(sn)) {
        throw new Error(message('overlap',
          'This selection already overlaps a Home Battery by paired address or fresh reported identity. '
          + 'Keep its history and Flows; add a physical monitor or review aggregate adoption.'));
      }
      listedSerials.delete(sn);
    },
  });
  const selectDevices = options.selectDevices || stream5000Devices;
  const duplicateDriverIds = options.duplicateDriverIds
    || (role === 'system' ? STREAM_5000_SYSTEM_DRIVER_IDS : STREAM_5000_UNIT_DRIVER_IDS);

  if (role === 'system') {
    session.setHandler('check_stream_5000_aggregate_access', async () => isStream5000AggregatePairingEnabled(driver?.homey));
    session.setHandler('confirm_stream_5000_installation_scope', async (confirmed: unknown) => {
      requireAccess();
      scopeConfirmed = confirmed === true;
      return scopeConfirmed;
    });
  }

  session.setHandler('list_devices', async () => {
    // Physical monitors need no opt-in. Only new aggregate pairing is gated.
    requireAccess();
    listedSerials.clear();
    listedClient = null;
    const epoch = ++listingEpoch;
    const client = appAuth.getClient();
    if (!client) {
      throw new Error(options.noAccountMessage || 'No EcoFlow account is configured for STREAM 5000 Series pairing.');
    }
    const observe = driver?.homey?.app?.beginStreamDiscoveryObservation?.();
    const accountDevices = await client.getDeviceList();
    // Revoking consent during an in-flight cloud read must not return a list.
    requireAccess();
    if (epoch !== listingEpoch || appAuth.getClient() !== client) {
      throw new Error(message('selection', 'Selection expired or was not discovered. Reopen the device list.'));
    }
    if (typeof observe === 'function') observe(accountDevices);
    const pairedSerials = role === 'system' ? observedAggregateSerials(driver, inventoryMessage())
      : pairedStream5000Serials(driver, duplicateDriverIds);
    const devices = selectDevices(accountDevices)
      .filter((device) => !pairedSerials.has(device.sn));
    const candidates = devices.map((device) => {
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
    for (const candidate of candidates) listedSerials.add(candidate.data.sn.toUpperCase());
    listedClient = client;
    return candidates;
  });
}
