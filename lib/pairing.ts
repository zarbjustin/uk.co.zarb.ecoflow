'use strict';

import { EcoFlowClient } from './EcoFlowClient';

export interface Creds {
  accessKey: string;
  secretKey: string;
  host?: string;
}

/** Read the account credentials saved once in the app settings. */
export function getSavedCreds(homey: any): Creds {
  return {
    accessKey: homey.settings.get('accessKey') as string,
    secretKey: homey.settings.get('secretKey') as string,
    host: homey.settings.get('host') as string | undefined,
  };
}

export function hasSavedCreds(homey: any): boolean {
  const { accessKey, secretKey } = getSavedCreds(homey);
  return Boolean(accessKey && secretKey);
}

/**
 * Register the shared "configure-once" pairing handlers on a driver's pair
 * session. The EcoFlow account keys are entered (and validated) only the first
 * time; afterwards every driver's pairing skips straight to the device list
 * using the saved credentials.
 *
 * - `check_credentials` → the credentials view auto-forwards to `list_devices`
 *   when keys already exist.
 * - `login` → validates the keys against the API and saves them to app settings.
 */
export function registerCredentialHandlers(driver: any, session: any): void {
  session.setHandler('check_credentials', async () => hasSavedCreds(driver.homey));

  session.setHandler('login', async (data: Creds) => {
    const client = new EcoFlowClient({ accessKey: data.accessKey, secretKey: data.secretKey, host: data.host });
    // Throws if the credentials are invalid.
    await client.getDeviceList();
    driver.homey.settings.set('accessKey', data.accessKey);
    driver.homey.settings.set('secretKey', data.secretKey);
    if (data.host) driver.homey.settings.set('host', data.host);
    return true;
  });
}

/** Build an API client from the saved account credentials. */
export function clientFromSettings(driver: any): EcoFlowClient {
  const { accessKey, secretKey, host } = getSavedCreds(driver.homey);
  return new EcoFlowClient({ accessKey, secretKey, host });
}
