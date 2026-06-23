'use strict';

import Homey from 'homey';
import { registerCredentialHandlers, clientFromSettings } from '../../lib/pairing';
import { collectStreamUnits, groupByMainSn, systemName } from '../../lib/streamPairing';

/**
 * Per Homey's Energy rules, a STREAM system's solar generation must be its own
 * `solarpanel` device. One solar device is created per STREAM system (main SN).
 */
module.exports = class StreamSolarDriver extends Homey.Driver {
  async onInit(): Promise<void> {
    this.log('STREAM Solar driver initialised');
  }

  async onPair(session: any): Promise<void> {
    registerCredentialHandlers(this, session);

    session.setHandler('list_devices', async () => {
      const client = clientFromSettings(this);
      const units = await collectStreamUnits(client);
      const results: any[] = [];
      for (const [mainSn, groupUnits] of groupByMainSn(units)) {
        results.push({ name: `${systemName(groupUnits, mainSn)} Solar`, data: { sn: mainSn }, store: { mainSn } });
      }
      return results;
    });
  }
};
