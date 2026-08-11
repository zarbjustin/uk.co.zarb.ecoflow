'use strict';

import Homey from 'homey';
import { streamAc5000Devices } from '../../lib/appDevices';
import { registerStream5000Pairing } from '../../lib/stream5000Pairing';

/**
 * Deprecated STREAM AC 5000 (ES22) compatibility driver.
 *
 * Discovery runs against EcoFlow's app API because an ES22 answers API code
 * 1006 to every Developer/Open API quota call. Only ES22 serials are listed
 * here. New pairing is handled by `stream_5000_unit`; existing test devices
 * retain this driver ID but use the same non-Energy physical-monitor role.
 */
module.exports = class StreamAc5000Driver extends Homey.Driver {
  async onInit(): Promise<void> {
    this.log('STREAM AC 5000 driver initialised (monitoring only)');
  }

  async onPair(session: any): Promise<void> {
    registerStream5000Pairing(this, session, {
      selectDevices: streamAc5000Devices,
      noAccountMessage: 'No EcoFlow account is configured for the STREAM AC 5000 pairing flow.',
    });
  }
};
