'use strict';

import Homey from 'homey';
import { registerAppAuthRepair } from '../../lib/appAuthRepair';
import { registerCredentialHandlers, clientFromSettings } from '../../lib/pairing';
import { collectStreamUnits } from '../../lib/streamPairing';
import { UNIT_ALERT_CARDS } from '../../lib/streamUnitAlerts';
import { streamModelFromSn } from '../../lib/streamModels';

module.exports = class StreamUnitDriver extends Homey.Driver {
  async onInit(): Promise<void> {
    for (const card of Object.values(UNIT_ALERT_CARDS)) {
      this.homey.flow.getDeviceTriggerCard(card).registerRunListener((args, state) => args.device?.matchesUnitAlert(card, args, state) ?? false);
    }
    this.log('STREAM Unit driver initialised');
  }

  async onPair(session: any): Promise<void> {
    registerCredentialHandlers(this, session);

    session.setHandler('list_devices', async () => {
      const client = clientFromSettings(this);
      // Each physical STREAM inverter/battery unit becomes its own device.
      const units = await collectStreamUnits(client);
      return units.map((u) => {
        const model = streamModelFromSn(u.device.sn);
        return {
          name: u.device.deviceName || model.model,
          data: { sn: u.device.sn },
          store: { mainSn: u.mainSn },
          ...(model.icon ? { icon: model.icon } : {}),
        };
      });
    });
  }

  async onRepair(session: any, device: any): Promise<void> {
    registerAppAuthRepair(this, session, device);
  }
};
