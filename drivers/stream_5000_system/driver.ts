'use strict';

import Homey from 'homey';
import { registerStream5000Pairing } from '../../lib/stream5000Pairing';
import { STREAM_5000_SYSTEM_DRIVER_IDS } from '../../lib/stream5000Models';

module.exports = class Stream5000SystemDriver extends Homey.Driver {
  async onInit(): Promise<void> {
    this.log('STREAM 5000 installation Home Battery driver initialised (monitoring only)');
  }

  async onPair(session: any): Promise<void> {
    registerStream5000Pairing(this, session, {
      duplicateDriverIds: STREAM_5000_SYSTEM_DRIVER_IDS,
      deviceName: (device) => `STREAM Home Battery (${device.name})`,
      noAccountMessage: 'No EcoFlow account is configured for STREAM 5000 Home Battery pairing.',
    });
  }
};
