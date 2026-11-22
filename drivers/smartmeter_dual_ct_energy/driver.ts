import Homey from 'homey';
import { registerAppAuthRepair } from '../../lib/appAuthRepair';
import { registerDualCtEnergyPairing } from '../../lib/dualCtEnergyPairing';

module.exports = class DualCtEnergyDriver extends Homey.Driver {
  async onPair(session: any): Promise<void> {
    registerDualCtEnergyPairing(this, session);
  }

  async onRepair(session: any, device: any): Promise<void> {
    registerAppAuthRepair(this, session, device);
  }
};
