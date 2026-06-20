'use strict';

import Homey from 'homey';
import { EcoFlowClient } from '../../lib/EcoFlowClient';
import { looksLikeSmartMeter } from '../../lib/smartMeterMapping';

module.exports = class SmartMeterDriver extends Homey.Driver {
  async onInit(): Promise<void> {
    this.log('Smart Meter driver initialised');
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
      const results: any[] = [];
      for (const d of devices) {
        try {
          const quota = await client.getQuotaAll(d.sn);
          if (looksLikeSmartMeter(quota)) {
            results.push({ name: d.deviceName || 'EcoFlow Smart Meter', data: { sn: d.sn } });
          }
        } catch (e) {
          this.error('smart meter probe failed', e);
        }
      }
      return results;
    });
  }
};
