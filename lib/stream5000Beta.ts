'use strict';

/**
 * STREAM 5000 support currently relies on EcoFlow's private app connection.
 * Keep the opt-in key and checks in one place so every present and future
 * 5000-family pairing path applies the same beta policy.
 */
export const STREAM_5000_BETA_ENABLED_SETTING = 'stream5000BetaEnabled';

export const STREAM_5000_BETA_DISABLED_MESSAGE = 'STREAM 5000 beta access is disabled. Enable it in the EcoFlow app settings before pairing.';

export function isStream5000BetaEnabled(homey: any): boolean {
  return homey?.settings?.get(STREAM_5000_BETA_ENABLED_SETTING) === true;
}

export function requireStream5000BetaAccess(homey: any): void {
  if (!isStream5000BetaEnabled(homey)) throw new Error(STREAM_5000_BETA_DISABLED_MESSAGE);
}
