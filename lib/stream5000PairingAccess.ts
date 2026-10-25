'use strict';

import { STREAM_5000_SYSTEM_DRIVER_IDS, STREAM_5000_UNIT_DRIVER_IDS } from './stream5000Models';

// The old stream5000BetaEnabled value is deliberately neither read nor removed.
// Existing paired devices keep running, and rollback retains their old opt-in.
export const STREAM_5000_AGGREGATE_PAIRING_SETTING = 'stream5000AggregatePairingEnabled';
export const STREAM_5000_AGGREGATE_DISABLED_MESSAGE = 'STREAM 5000 Home Battery pairing is disabled. '
  + 'Enable the separate Home Battery (5000) Energy pairing opt-in in the Homey EcoFlow integration settings. '
  + 'Unit monitoring does not require this opt-in.';

export type Stream5000PairingRole = 'unit' | 'system';

/** Role comes from the real driver, never a browser-supplied role or serial. */
export function stream5000PairingRole(driverId: string): Stream5000PairingRole {
  if ((STREAM_5000_SYSTEM_DRIVER_IDS as readonly string[]).includes(driverId)) return 'system';
  if ((STREAM_5000_UNIT_DRIVER_IDS as readonly string[]).includes(driverId)) return 'unit';
  throw new Error('Unsupported STREAM 5000 pairing driver.');
}

export function isStream5000AggregatePairingEnabled(homey: any): boolean {
  return homey?.settings?.get(STREAM_5000_AGGREGATE_PAIRING_SETTING) === true;
}

/** New pairing only: not a runtime availability switch or Energy migration. */
export function requireStream5000PairingAccess(role: Stream5000PairingRole, homey: any): void {
  if (role === 'unit') return;
  if (role !== 'system') throw new Error('Unsupported STREAM 5000 pairing role.');
  if (!isStream5000AggregatePairingEnabled(homey)) throw new Error(STREAM_5000_AGGREGATE_DISABLED_MESSAGE);
}
