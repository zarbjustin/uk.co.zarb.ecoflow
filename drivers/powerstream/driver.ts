'use strict';

import Homey from 'homey';
import { registerCredentialHandlers, clientFromSettings } from '../../lib/pairing';

/** PowerStream serial numbers start with "HW51". */
function isPowerStreamSerial(sn: string): boolean {
  return /^HW51/i.test(sn);
}

module.exports = class PowerStreamDriver extends Homey.Driver {
  async onInit(): Promise<void> {
    this.log('PowerStream driver initialised');
  }

  async onPair(session: any): Promise<void> {
    registerCredentialHandlers(this, session);

    session.setHandler('list_devices', async () => {
      const client = clientFromSettings(this);

      const devices = await client.getDeviceList();
      return devices
        .filter((d) => isPowerStreamSerial(d.sn))
        .map((d) => ({ name: d.deviceName || 'EcoFlow PowerStream', data: { sn: d.sn } }));
    });
  }
};
