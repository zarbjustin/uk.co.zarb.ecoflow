'use strict';

import Homey from 'homey';
import { registerCredentialHandlers, clientFromSettings } from '../../lib/pairing';
import { collectStreamUnits } from '../../lib/streamPairing';

module.exports = class StreamUnitDriver extends Homey.Driver {
  async onInit(): Promise<void> {
    this.log('STREAM Unit driver initialised');
  }

  async onPair(session: any): Promise<void> {
    registerCredentialHandlers(this, session);

    session.setHandler('list_devices', async () => {
      const client = clientFromSettings(this);
      // Each physical STREAM inverter/battery unit becomes its own device.
      const units = await collectStreamUnits(client);
      return units.map((u) => ({
        name: u.device.deviceName || 'EcoFlow STREAM Unit',
        data: { sn: u.device.sn },
        store: { mainSn: u.mainSn },
      }));
    });
  }
};
