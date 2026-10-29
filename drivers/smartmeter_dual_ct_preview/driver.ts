import Homey from 'homey';
import { registerAppAuthRepair } from '../../lib/appAuthRepair';
import { registerDualCtPreviewPairing } from '../../lib/dualCtPreviewPairing';

module.exports = class DualCtPreviewDriver extends Homey.Driver {
  async onPair(session: any): Promise<void> {
    registerDualCtPreviewPairing(this, session);
  }

  async onRepair(session: any, device: any): Promise<void> {
    registerAppAuthRepair(this, session, device);
  }
};
