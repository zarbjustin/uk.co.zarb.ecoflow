import Homey from 'homey';
import { appAccountBinding, registerAppAuthHandlers } from '../../lib/appAuthPairing';
import { registerAppAuthRepair } from '../../lib/appAuthRepair';
import { isSolarUnit } from '../../lib/stream5000Solar';

module.exports = class Stream5000SolarDriver extends Homey.Driver {
  async onPair(session: any): Promise<void> {
    let listed = new Set<string>();
    let binding = '';
    let listedClient: object | null = null;
    let revision = 0;
    const paired = () => new Set(this.getDevices().map((device) => device.getData().sn));
    const expired = () => new Error(this.homey.__('solar5000.selection'));
    const auth = registerAppAuthHandlers(this, session, {
      beforeAdd: (candidate) => {
        const sn = candidate?.data?.sn;
        if (Object.keys(candidate?.data || {}).length !== 1 || !listed.has(sn) || paired().has(sn)
          || Object.keys(candidate?.store || {}).length !== 1 || candidate?.store?.solarAccountBinding !== binding || auth.getClient() !== listedClient) throw expired();
        listed.delete(sn);
      },
    });
    session.setHandler('list_devices', async () => {
      const token = ++revision;
      listed.clear(); listedClient = null;
      const client = auth.getClient();
      if (!client) throw expired();
      const account = appAccountBinding(await client.getSession());
      const inventory = await client.getDeviceList();
      if (token !== revision || client !== auth.getClient()) throw expired();
      const existing = paired();
      const units = inventory.filter((device) => !device.shared && isSolarUnit(device.sn) && !existing.has(device.sn));
      listed = new Set(units.map((device) => device.sn)); binding = account; listedClient = client;
      return units.map((device) => ({
        name: `STREAM 5000 Solar · ${device.sn.slice(-4)}`,
        data: { sn: device.sn },
        store: { solarAccountBinding: account },
      }));
    });
  }

  async onRepair(session: any, device: any): Promise<void> {
    registerAppAuthRepair(this, session, device);
  }
};
