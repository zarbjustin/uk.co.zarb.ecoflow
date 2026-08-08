'use strict';

import Homey from 'homey';
import { streamAc5000Devices } from '../../lib/appDevices';
import { registerAppAuthHandlers } from '../../lib/appAuthPairing';

/**
 * EXPERIMENTAL — STREAM AC 5000 (ES22) driver.
 *
 * Discovery runs against EcoFlow's app API because an ES22 answers API code
 * 1006 to every Developer/Open API quota call. Only ES22 serials are listed
 * here; every other product stays on the supported Developer-API drivers.
 */
module.exports = class StreamAc5000Driver extends Homey.Driver {
  async onInit(): Promise<void> {
    this.log('STREAM AC 5000 driver initialised (experimental, monitoring only)');
  }

  async onPair(session: any): Promise<void> {
    const appAuth = registerAppAuthHandlers(this, session);

    session.setHandler('list_devices', async () => {
      // The account signed in during this session is used before it is stored:
      // nothing is persisted until the user actually adds one of these devices.
      const client = appAuth.getClient();
      if (!client) throw new Error('No EcoFlow account is configured for the experimental STREAM AC 5000 flow.');
      const devices = streamAc5000Devices(await client.getDeviceList());
      return devices.map((d) => ({
        name: d.name,
        data: { sn: d.sn },
      }));
    });
  }
};
