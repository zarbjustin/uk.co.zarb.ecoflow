'use strict';

import Homey from 'homey';
import { registerCredentialHandlers, clientFromSettings } from '../../lib/pairing';
import { classifyDevice } from '../../lib/ecoflowDevices';

/**
 * STREAM Microinverter (BK01) — a panels-to-grid microinverter with no battery.
 * It is its own single-device "system" and publishes PV1/PV2 + grid feed over
 * MQTT (its REST quota is empty), so it is surfaced as a solarpanel device.
 */
module.exports = class StreamMicroDriver extends Homey.Driver {
  async onInit(): Promise<void> {
    this.log('STREAM Microinverter driver initialised');
  }

  async onPair(session: any): Promise<void> {
    registerCredentialHandlers(this, session);

    session.setHandler('list_devices', async () => {
      const client = clientFromSettings(this);
      const devices = await client.getDeviceList();
      return devices
        .filter((d) => classifyDevice(d) === 'microinverter')
        .map((d) => ({ name: d.deviceName || 'EcoFlow STREAM Microinverter', data: { sn: d.sn } }));
    });
  }
};
