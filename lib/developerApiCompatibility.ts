'use strict';

import { isSupportedStream5000Sn } from './stream5000Models';

export const ES22_WRONG_DRIVER_MESSAGE_KEY = 'errors.es22_wrong_driver';
export const ES22_WRONG_DRIVER_FALLBACK = 'This STREAM 5000-series device was added in the wrong place. '
  + 'Use STREAM 5000 Series Unit for monitoring through the EcoFlow app connection. '
  + 'Home Battery (5000) Energy pairing has a separate opt-in in the Homey integration settings. '
  + 'Check existing Flows and history before replacing a device.';
export const DEVELOPER_API_UNSUPPORTED_MESSAGE_KEY = 'errors.developer_api_unsupported_device';
export const DEVELOPER_API_UNSUPPORTED_FALLBACK = 'This EcoFlow device is not supported through the Developer API. Delete it and add it again using its dedicated EcoFlow device type.';

export class DeveloperApiQuarantineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeveloperApiQuarantineError';
  }
}

/** Message key when a serial must never use the supported Developer API path. */
export function developerApiQuarantineMessageKey(sn: string | undefined): string | null {
  // Keep the historic ES22 localization key so existing installations retain
  // their recovery message; it now covers both admitted app-auth models.
  return isSupportedStream5000Sn(sn) ? ES22_WRONG_DRIVER_MESSAGE_KEY : null;
}
