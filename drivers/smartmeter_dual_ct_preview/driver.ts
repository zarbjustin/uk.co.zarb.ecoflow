import Homey from 'homey';
import { registerDualCtPreviewPairing } from '../../lib/dualCtPreviewPairing';

module.exports = class DualCtPreviewDriver extends Homey.Driver {
  async onPair(session: any): Promise<void> {
    registerDualCtPreviewPairing(this, session);
  }
};
