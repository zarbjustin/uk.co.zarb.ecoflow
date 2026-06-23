'use strict';

import Homey from 'homey';
import { classifyDevice } from '../../lib/ecoflowDevices';
import { registerCredentialHandlers, clientFromSettings } from '../../lib/pairing';

module.exports = class SmartMeterDriver extends Homey.Driver {
  async onInit(): Promise<void> {
    this.log('Smart Meter driver initialised');
  }

  async onPair(session: any): Promise<void> {
    registerCredentialHandlers(this, session);

    session.setHandler('list_devices', async () => {
      const client = clientFromSettings(this);

      const devices = await client.getDeviceList();
      const results: any[] = [];
      for (const d of devices) {
        if (classifyDevice(d) !== 'smart_meter') continue;

        // When the meter is part of a STREAM system its own SN returns no data;
        // the whole-home grid reading lives on the STREAM main SN. Resolve the
        // source SN to read from (falls back to the meter's own SN if it is a
        // standalone meter that exposes per-phase telemetry directly).
        let sourceSn = d.sn;
        try {
          sourceSn = await client.getMainSn(d.sn);
        } catch (e) {
          this.error('getMainSn failed for meter, reading own SN', e);
        }
        results.push({
          name: d.deviceName || 'EcoFlow Smart Meter',
          data: { sn: d.sn },
          store: { sourceSn },
        });
      }
      return results;
    });
  }
};
