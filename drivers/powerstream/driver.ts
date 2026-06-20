'use strict';

import Homey from 'homey';
import { EcoFlowClient } from '../../lib/EcoFlowClient';

/** PowerStream serial numbers start with "HW51". */
function isPowerStreamSerial(sn: string): boolean {
  return /^HW51/i.test(sn);
}

module.exports = class PowerStreamDriver extends Homey.Driver {
  async onInit(): Promise<void> {
    this.log('PowerStream driver initialised');
  }

  async onPair(session: any): Promise<void> {
    let creds: { accessKey: string; secretKey: string; host?: string } = { accessKey: '', secretKey: '' };

    session.setHandler('login', async (data: { accessKey: string; secretKey: string; host?: string }) => {
      const client = new EcoFlowClient({ accessKey: data.accessKey, secretKey: data.secretKey, host: data.host });
      await client.getDeviceList();
      creds = data;
      this.homey.settings.set('accessKey', data.accessKey);
      this.homey.settings.set('secretKey', data.secretKey);
      if (data.host) this.homey.settings.set('host', data.host);
      return true;
    });

    session.setHandler('list_devices', async () => {
      const accessKey = creds.accessKey || (this.homey.settings.get('accessKey') as string);
      const secretKey = creds.secretKey || (this.homey.settings.get('secretKey') as string);
      const host = creds.host || (this.homey.settings.get('host') as string);
      const client = new EcoFlowClient({ accessKey, secretKey, host });

      const devices = await client.getDeviceList();
      return devices
        .filter((d) => isPowerStreamSerial(d.sn))
        .map((d) => ({ name: d.deviceName || 'EcoFlow PowerStream', data: { sn: d.sn } }));
    });
  }
};
