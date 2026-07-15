'use strict';

import Homey from 'homey';
import { registerCredentialHandlers, clientFromSettings } from '../../lib/pairing';
import { collectStreamUnits } from '../../lib/streamPairing';
import { streamModelFromSn } from '../../lib/streamModels';

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
      return units.map((u) => {
        const model = streamModelFromSn(u.device.sn);
        return {
          name: u.device.deviceName || model.model,
          data: { sn: u.device.sn },
          store: { mainSn: u.mainSn },
          ...(model.icon ? { icon: model.icon } : {}),
        };
      });
    });
  }
};
