'use strict';

import Homey from 'homey';
import { EcoFlowClient } from '../../lib/EcoFlowClient';
import { classifyDevice } from '../../lib/ecoflowDevices';

module.exports = class StreamUnitDriver extends Homey.Driver {
  async onInit(): Promise<void> {
    this.log('STREAM Unit driver initialised');
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

      // Each physical STREAM inverter/battery unit becomes its own device,
      // addressed by its own SN. The Smart Meter / Microinverter are excluded.
      const results: any[] = [];
      for (const d of devices) {
        let role = classifyDevice(d);
        if (role === 'other') {
          try {
            const quota = await client.getQuotaAll(d.sn);
            role = classifyDevice(d, quota);
          } catch (e) {
            this.error('classify probe failed', d.sn, e);
          }
        }
        if (role !== 'stream_unit') continue;

        let mainSn = d.sn;
        try {
          mainSn = await client.getMainSn(d.sn);
        } catch (e) {
          this.error('getMainSn failed, using device SN', e);
        }
        results.push({
          name: d.deviceName || 'EcoFlow STREAM Unit',
          data: { sn: d.sn },
          store: { mainSn },
        });
      }
      return results;
    });
  }
};
