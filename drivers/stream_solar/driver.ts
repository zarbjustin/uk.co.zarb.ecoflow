'use strict';

import Homey from 'homey';
import { classifyDevice } from '../../lib/ecoflowDevices';
import { EcoFlowDevice } from '../../lib/types';
import { registerCredentialHandlers, clientFromSettings } from '../../lib/pairing';

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
    registerCredentialHandlers(this, session);

    session.setHandler('list_devices', async () => {
      const client = clientFromSettings(this);

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
