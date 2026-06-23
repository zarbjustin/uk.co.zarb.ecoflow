'use strict';

import Homey from 'homey';
import { classifyDevice } from '../../lib/ecoflowDevices';
import { registerCredentialHandlers, clientFromSettings } from '../../lib/pairing';

module.exports = class StreamUnitDriver extends Homey.Driver {
  async onInit(): Promise<void> {
    this.log('STREAM Unit driver initialised');
  }

  async onPair(session: any): Promise<void> {
    registerCredentialHandlers(this, session);

    session.setHandler('list_devices', async () => {
      const client = clientFromSettings(this);

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
