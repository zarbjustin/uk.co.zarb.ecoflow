'use strict';

import { isStreamAc5000Sn } from './deviceIdentity';

export const ES22_WRONG_DRIVER_MESSAGE_KEY = 'errors.es22_wrong_driver';
export const ES22_WRONG_DRIVER_FALLBACK = 'This STREAM AC 5000 was added in the wrong place. Enable STREAM 5000 beta pairing in the app settings, then delete this device and add it again as STREAM Home Battery (5000 Beta).';
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
  return isStreamAc5000Sn(sn) ? ES22_WRONG_DRIVER_MESSAGE_KEY : null;
}
