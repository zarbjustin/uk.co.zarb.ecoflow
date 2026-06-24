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
      const groups = Array.from(groupByMainSn(units));
      for (const [mainSn, groupUnits] of groups) {
        const suffix = groups.length > 1 ? ` (${systemName(groupUnits, mainSn)})` : '';
        results.push({ name: `STREAM Solar System${suffix}`, data: { sn: mainSn }, store: { mainSn } });
      }
      return results;
    });
  }
};
