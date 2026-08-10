'use strict';

import Homey from 'homey';
import { registerStream5000Pairing } from '../../lib/stream5000Pairing';

module.exports = class Stream5000UnitDriver extends Homey.Driver {
  async onInit(): Promise<void> {
    this.log('STREAM 5000 Series Unit driver initialised (monitoring only)');
  }

  async onPair(session: any): Promise<void> {
    registerStream5000Pairing(this, session);
  }
};
