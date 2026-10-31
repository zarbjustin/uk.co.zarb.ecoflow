'use strict';

import { createHash } from 'crypto';
import { hasOtherAppAuthDevices } from './appAuthConsumers';
import { AppAuthTransport, EcoFlowAppAuthClient } from './EcoFlowAppAuthClient';

/**
 * App-auth account handling for STREAM 5000-family drivers and the explicit
 * read-only Dual CT preview. Device admission remains each driver's responsibility.
 *
 * Mirrors `lib/pairing.ts` (the supported Developer-API flow) but keeps its
 * credentials under separate settings keys so the two paths never mix and the
 * Developer-API behaviour of every other driver is untouched.
 *
 * Credential handling rules enforced here:
 *  - the password is only ever written to Homey app settings (encrypted at rest
 *    on the Homey) and read back to build a client;
 *  - it is only written for an actual device Add or explicit confirmed repair, so a cancelled
 *    pairing, an empty device list or a later failure never leaves an EcoFlow
 *    account behind on the Homey;
 *  - it is never copied into device data/store, never logged and never included
 *    in an error message;
 *  - device stores never contain account secrets.
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

const savedClients = new WeakMap<object, { key: string; client: EcoFlowAppAuthClient }>();

/** Remove the stored EcoFlow account. Called when the last family device goes. */
export function clearSavedAppAuthCreds(homey: any): void {
  savedClients.delete(homey);
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
  if (!email || !password) {
    savedClients.delete(homey);
    return null;
  }
  // One saved-account session per Homey: periodic inventory checks must not
  // create independent login streams alongside the shared MQTT connection.
  const key = createHash('sha256').update(JSON.stringify([email, password, host])).digest('hex');
  const cached = savedClients.get(homey);
  if (cached?.key === key) return cached.client;
  const client = new EcoFlowAppAuthClient({
    email, password, host, log,
  });
  savedClients.set(homey, { key, client });
  return client;
}

/** Handle on the credentials of one pairing session. */
export interface AppAuthPairingSession {
  /** Client for discovery: this session's sign-in, else the saved account. */
  getClient(): EcoFlowAppAuthClient | null;
  /** Persist this session's account for an actual Add or separately confirmed repair. */
  commit(): void;
  /** Drop anything uncommitted and clean up an account that gained no device. */
  dispose(): void;
}

export interface RegisterAppAuthOptions {
  /** Role-specific admission check before committing credentials for a new device. */
  beforeAdd?: () => void;
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
  let loginGeneration = 0;

  const controller: AppAuthPairingSession = {
    getClient() {
      if (disposed) return null;
      if (pending) return pending.client;
      return appAuthClientFromSettings(driver.homey, log);
    },

    commit() {
      if (disposed || committed || !pending) return;
      const { email, password, host } = pending.creds;
      // Homey emits settings events even for unchanged values. Existing
      // telemetry consumers stop on account changes, so a same-account pairing
      // must not interrupt their shared subscription.
      for (const [key, value] of [
        [APP_AUTH_EMAIL_SETTING, email],
        [APP_AUTH_PASSWORD_SETTING, password],
        [APP_AUTH_HOST_SETTING, host],
      ]) {
        if (driver.homey.settings.get(key) !== value) driver.homey.settings.set(key, value);
      }
      committed = true;
      log('EcoFlow app account stored after confirmed pairing or repair');
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      loginGeneration++;
      // Never persisted: dropping the in-memory copy is the whole cleanup.
      pending = null;
      // An account that was already there belongs to an earlier pairing.
      if (!committed || hadSavedCreds) return;
      // Stored for a device that then failed to be created: take it back out.
      scheduleOn(driver.homey, () => {
        if (pairedDeviceCount(driver) !== 0 || hasOtherAppAuthDevices(driver.homey, null)) return;
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
    if (disposed) throw new Error('Sign-in session closed.');
    const operation = ++loginGeneration; pending = null;
    const email = (data?.email || '').trim();
    const password = data?.password || '';
    if (!email || !password) throw new Error('Email address and password are required.');
    const client = new EcoFlowAppAuthClient({
      email, password, host: data?.host, log, transport: options.transport,
    });
    // Throws if EcoFlow rejects the account; the message never echoes the input.
    const sessionInfo = await client.getSession(true);
    if (disposed || operation !== loginGeneration) throw new Error('Sign-in session changed.');
    // Held in memory only — nothing is written until an actual Add or confirmed repair.
    pending = { creds: { email, password, host: sessionInfo.host }, client };
    return true;
  });

  session.setHandler('add_device', async () => {
    options.beforeAdd?.();
    controller.commit();
  });

  session.setHandler('disconnect', async () => {
    controller.dispose();
  });

  return controller;
}

/** Private revision only; never include credentials or this digest in support exports. */
export function appAuthCredentialsRevision(homey: any): string {
  return createHash('sha256').update(JSON.stringify([APP_AUTH_EMAIL_SETTING, APP_AUTH_PASSWORD_SETTING, APP_AUTH_HOST_SETTING]
    .map((key) => homey.settings.get(key)))).digest('hex');
}
