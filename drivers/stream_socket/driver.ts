'use strict';

import Homey from 'homey';
import { registerCredentialHandlers, clientFromSettings } from '../../lib/pairing';
import { collectStreamUnits } from '../../lib/streamPairing';

/**
 * Each physical AC outlet (Schuko socket) on a STREAM AC Pro / Ultra X unit is
 * exposed as its own Homey smart-plug (`socket`) device. Socket 1 maps to relay2
 * (cfgRelay2Onoff) + powGetSchuko1, socket 2 to relay3 + powGetSchuko2.
 */
module.exports = class StreamSocketDriver extends Homey.Driver {
  async onInit(): Promise<void> {
    this.log('STREAM Socket driver initialised');
  }

  async onPair(session: any): Promise<void> {
    registerCredentialHandlers(this, session);

    session.setHandler('list_devices', async () => {
      const client = clientFromSettings(this);
      const units = await collectStreamUnits(client);
      const results: any[] = [];
      for (const u of units) {
        const base = u.device.deviceName || 'EcoFlow STREAM';
        // Only surface sockets the unit actually reports.
        if (u.quota.relay2Onoff !== undefined) {
          results.push({ name: `${base} – Socket 1`, data: { sn: u.device.sn, outlet: 1 }, store: { mainSn: u.mainSn } });
        }
        if (u.quota.relay3Onoff !== undefined) {
          results.push({ name: `${base} – Socket 2`, data: { sn: u.device.sn, outlet: 2 }, store: { mainSn: u.mainSn } });
        }
      }
      return results;
    });
  }
};
