'use strict';

import Homey from 'homey';
import { EcoFlowClient } from '../../lib/EcoFlowClient';
import { classifyDevice } from '../../lib/ecoflowDevices';
import { EcoFlowDevice } from '../../lib/types';

/**
 * Per Homey's Energy rules, a STREAM system's solar generation must be its own
 * `solarpanel` device. One solar device is created per STREAM system (main SN),
 * reading the aggregated solar power from that main SN.
 */
module.exports = class StreamSolarDriver extends Homey.Driver {
  async onInit(): Promise<void> {
    this.log('STREAM Solar driver initialised');
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

      const units: EcoFlowDevice[] = [];
      for (const d of devices) {
        let role = classifyDevice(d);
        if (role === 'other') {
          try {
            role = classifyDevice(d, await client.getQuotaAll(d.sn));
          } catch (e) {
            this.error('classify probe failed', d.sn, e);
          }
        }
        if (role === 'stream_unit') units.push(d);
      }

      const mains = new Map<string, EcoFlowDevice[]>();
      for (const d of units) {
        let mainSn = d.sn;
        try {
          mainSn = await client.getMainSn(d.sn);
        } catch (e) {
          this.error('getMainSn failed, using device SN', e);
        }
        const g = mains.get(mainSn);
        if (g) g.push(d);
        else mains.set(mainSn, [d]);
      }

      const results: any[] = [];
      for (const [mainSn, groupUnits] of mains) {
        const mainDev = devices.find((x) => x.sn === mainSn);
        const base = mainDev?.deviceName || groupUnits[0].deviceName || 'EcoFlow STREAM';
        results.push({ name: `${base} Solar`, data: { sn: mainSn }, store: { mainSn } });
      }
      return results;
    });
  }
};
