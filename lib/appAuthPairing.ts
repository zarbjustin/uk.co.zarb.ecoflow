'use strict';

import { AppAuthTransport, EcoFlowAppAuthClient } from './EcoFlowAppAuthClient';

/**
 * App-auth account handling for verified STREAM 5000-family drivers.
 *
 * Mirrors `lib/pairing.ts` (the supported Developer-API flow) but keeps its
 * credentials under separate settings keys so the two paths never mix and the
 * Developer-API behaviour of every other driver is untouched.
 *
 * Credential handling rules enforced here:
 *  - the password is only ever written to Homey app settings (encrypted at rest
 *    on the Homey) and read back to build a client;
 *  - it is only written once a device is actually being added, so a cancelled
 *    pairing, an empty device list or a later failure never leaves an EcoFlow
 *    account behind on the Homey;
 *  - it is never copied into device data/store, never logged and never included
 *    in an error message;
 *  - devices themselves store only the serial number they read.
 */

export const APP_AUTH_EMAIL_SETTING = 'appAuthEmail';
export const APP_AUTH_PASSWORD_SETTING = 'appAuthPassword';
export const APP_AUTH_HOST_SETTING = 'appAuthHost';

/** Grace period before the "added nothing after all" safety net runs. */
const ORPHAN_CLEANUP_DELAY_MS = 15000;

export interface AppAuthCredsInput {
  email: string;
  password: string;
  host?: string;
}

export interface SavedAppAuthCreds {
  email: string;
  password: string;
  host?: string;
}

export function getSavedAppAuthCreds(homey: any): SavedAppAuthCreds {
  return {
    email: (homey.settings.get(APP_AUTH_EMAIL_SETTING) as string) || '',
    password: (homey.settings.get(APP_AUTH_PASSWORD_SETTING) as string) || '',
    host: (homey.settings.get(APP_AUTH_HOST_SETTING) as string | undefined) || undefined,
  };
}

export function hasSavedAppAuthCreds(homey: any): boolean {
  const { email, password } = getSavedAppAuthCreds(homey);
  return Boolean(email && password);
}

/** Remove the stored EcoFlow account. Called when the last family device goes. */
export function clearSavedAppAuthCreds(homey: any): void {
  homey.settings.unset(APP_AUTH_EMAIL_SETTING);
  homey.settings.unset(APP_AUTH_PASSWORD_SETTING);
  homey.settings.unset(APP_AUTH_HOST_SETTING);
}

/** Build an app-auth client from the saved account, or null when unconfigured. */
export function appAuthClientFromSettings(
  homey: any,
  log?: (...args: any[]) => void,
): EcoFlowAppAuthClient | null {
  const { email, password, host } = getSavedAppAuthCreds(homey);
  if (!email || !password) return null;
  return new EcoFlowAppAuthClient({
    email, password, host, log,
  });
}

/** Handle on the credentials of one pairing session. */
export interface AppAuthPairingSession {
  /** Client for discovery: this session's sign-in, else the saved account. */
  getClient(): EcoFlowAppAuthClient | null;
  /** Persist this session's account. Called when a device is really added. */
  commit(): void;
  /** Drop anything uncommitted and clean up an account that gained no device. */
  dispose(): void;
}

export interface RegisterAppAuthOptions {
  /** Injectable transport, so the pairing flow can be tested without a network. */
  transport?: AppAuthTransport;
  /** Delay before the orphaned-account safety net runs. */
  cleanupDelayMs?: number;
}

/** Number of paired devices, or null when it cannot be determined. */
function pairedDeviceCount(driver: any): number | null {
  try {
    const devices = typeof driver.getDevices === 'function' ? driver.getDevices() : null;
    return Array.isArray(devices) ? devices.length : null;
  } catch {
    return null;
  }
}

function scheduleOn(homey: any, fn: () => void, ms: number): void {
  if (homey && typeof homey.setTimeout === 'function') {
    homey.setTimeout(fn, ms);
    return;
  }
  // No Homey timer available (non-Homey host): the check is cheap, run it now.
  fn();
}

/**
 * Register the pairing handlers for the app-auth monitoring flow.
 *
 * - `check_app_credentials` → the view skips the form when an account is known.
 * - `app_login` → validates the account against EcoFlow and holds it in memory.
 * - `add_device` → the user is adding a verified family unit, so store the account.
 * - `disconnect` → forget an unused account; remove it again if it was stored
 *   for a device that never materialised.
 *
 * The returned handle gives the driver the client to discover devices with,
 * before anything has been written to the Homey's settings.
 */
export function registerAppAuthHandlers(
  driver: any,
  session: any,
  options: RegisterAppAuthOptions = {},
): AppAuthPairingSession {
  const log = (...args: any[]) => {
    if (typeof driver.log === 'function') driver.log('[app-auth]', ...args);
  };
  const hadSavedCreds = hasSavedAppAuthCreds(driver.homey);
  const cleanupDelayMs = options.cleanupDelayMs ?? ORPHAN_CLEANUP_DELAY_MS;
  let pending: { creds: SavedAppAuthCreds; client: EcoFlowAppAuthClient } | null = null;
  let committed = false;
  let disposed = false;

  const controller: AppAuthPairingSession = {
    getClient() {
      if (pending) return pending.client;
      return appAuthClientFromSettings(driver.homey, log);
    },

    commit() {
      if (committed || !pending) return;
      const { email, password, host } = pending.creds;
      driver.homey.settings.set(APP_AUTH_EMAIL_SETTING, email);
      driver.homey.settings.set(APP_AUTH_PASSWORD_SETTING, password);
      driver.homey.settings.set(APP_AUTH_HOST_SETTING, host);
      committed = true;
      log('EcoFlow account stored for the STREAM 5000-family device being added');
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      // Never persisted: dropping the in-memory copy is the whole cleanup.
      pending = null;
      // An account that was already there belongs to an earlier pairing.
      if (!committed || hadSavedCreds) return;
      // Stored for a device that then failed to be created: take it back out.
      scheduleOn(driver.homey, () => {
        if (pairedDeviceCount(driver) !== 0) return;
        if (!hasSavedAppAuthCreds(driver.homey)) return;
        clearSavedAppAuthCreds(driver.homey);
        log('Pairing ended without a device — stored EcoFlow account removed');
      }, cleanupDelayMs);
    },
  };

  session.setHandler(
    'check_app_credentials',
    async () => Boolean(pending) || hasSavedAppAuthCreds(driver.homey),
  );

  session.setHandler('app_login', async (data: AppAuthCredsInput) => {
    const email = (data?.email || '').trim();
    const password = data?.password || '';
    if (!email || !password) throw new Error('Email address and password are required.');
    const client = new EcoFlowAppAuthClient({
      email, password, host: data?.host, log, transport: options.transport,
    });
    // Throws if EcoFlow rejects the account; the message never echoes the input.
    const sessionInfo = await client.getSession(true);
    // Held in memory only — nothing is written until a device is actually added.
    pending = { creds: { email, password, host: sessionInfo.host }, client };
    return true;
  });

  session.setHandler('add_device', async () => {
    controller.commit();
  });

  session.setHandler('disconnect', async () => {
    controller.dispose();
  });

  return controller;
}
