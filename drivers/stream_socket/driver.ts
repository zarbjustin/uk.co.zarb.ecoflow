'use strict';

import Homey from 'homey';
import { classifyDevice } from '../../lib/ecoflowDevices';
import { registerCredentialHandlers, clientFromSettings } from '../../lib/pairing';

/**
 * Each physical AC outlet (Schuko socket) on a STREAM AC Pro / Ultra X unit is
 * exposed as its own Homey smart-plug (`socket`) device, with on/off control and
 * live power. Socket 1 maps to relay2 (cfgRelay2Onoff) + powGetSchuko1, socket 2
 * to relay3 (cfgRelay3Onoff) + powGetSchuko2.
 */
module.exports = class StreamSocketDriver extends Homey.Driver {
  async onInit(): Promise<void> {
    this.log('STREAM Socket driver initialised');
  }

  async onPair(session: any): Promise<void> {
    registerCredentialHandlers(this, session);

    session.setHandler('list_devices', async () => {
      const client = clientFromSettings(this);
      const devices = await client.getDeviceList();

      const results: any[] = [];
      for (const d of devices) {
        let role = classifyDevice(d);
        let quota: Record<string, any> = {};
        try {
          quota = await client.getQuotaAll(d.sn);
        } catch (e) {
          this.error('quota probe failed', d.sn, e);
        }
        if (role === 'other') role = classifyDevice(d, quota);
        if (role !== 'stream_unit') continue;

        let mainSn = d.sn;
        try {
          mainSn = await client.getMainSn(d.sn);
        } catch (e) {
          this.error('getMainSn failed', e);
        }

        // Only surface sockets the unit actually reports.
        const base = d.deviceName || 'EcoFlow STREAM';
        if (quota.relay2Onoff !== undefined) {
          results.push({ name: `${base} – Socket 1`, data: { sn: d.sn, outlet: 1 }, store: { mainSn } });
        }
        if (quota.relay3Onoff !== undefined) {
          results.push({ name: `${base} – Socket 2`, data: { sn: d.sn, outlet: 2 }, store: { mainSn } });
        }
      }
      return results;
    });
  }
};
