'use strict';

import Homey from 'homey';
import { EcoFlowClient } from '../../lib/EcoFlowClient';

/** STREAM/BKW serial numbers start with "BK". */
function isStreamSerial(sn: string): boolean {
  return /^BK/i.test(sn);
}

module.exports = class StreamDriver extends Homey.Driver {
  async onInit(): Promise<void> {
    this.registerFlowCards();
    this.log('STREAM driver initialised');
  }

  private registerFlowCards(): void {
    const flow = this.homey.flow;

    // Conditions
    flow.getConditionCard('operating_mode_is').registerRunListener(
      (args: any) => args.device.getCapabilityValue('operating_mode') === args.mode,
    );
    flow.getConditionCard('feed_in_enabled').registerRunListener(
      (args: any) => args.device.getCapabilityValue('feed_in_control') === true,
    );

    // Actions
    flow.getActionCard('set_operating_mode').registerRunListener(
      (args: any) => args.device.flowSetOperatingMode(args.mode),
    );
    flow.getActionCard('set_backup_reserve').registerRunListener(
      (args: any) => args.device.flowSetBackupReserve(args.level),
    );
    flow.getActionCard('set_feed_in').registerRunListener(
      (args: any) => args.device.flowSetFeedIn(args.state === 'on'),
    );
    flow.getActionCard('set_ac_output').registerRunListener(
      (args: any) => args.device.flowSetAc(args.output, args.state === 'on'),
    );

    // Trigger arg-matching for the battery threshold card
    flow.getDeviceTriggerCard('battery_level_crossed').registerRunListener((args: any, state: any) => {
      const up = state.prevSoc < args.level && state.soc >= args.level;
      const down = state.prevSoc > args.level && state.soc <= args.level;
      return (args.direction === 'above' && up) || (args.direction === 'below' && down);
    });
  }

  async onPair(session: any): Promise<void> {
    let creds: { accessKey: string; secretKey: string; host?: string } = { accessKey: '', secretKey: '' };

    session.setHandler('login', async (data: { accessKey: string; secretKey: string; host?: string }) => {
      const client = new EcoFlowClient({ accessKey: data.accessKey, secretKey: data.secretKey, host: data.host });
      // Throws if the credentials are invalid.
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
      const streams = devices.filter((d) => isStreamSerial(d.sn));

      const seen = new Set<string>();
      const results: any[] = [];
      for (const d of streams) {
        let mainSn = d.sn;
        try {
          mainSn = await client.getMainSn(d.sn);
        } catch (e) {
          this.error('getMainSn failed, using device SN', e);
        }
        // Collapse a multi-device system into a single Homey device (the main SN).
        if (seen.has(mainSn)) continue;
        seen.add(mainSn);
        results.push({
          name: d.deviceName || `EcoFlow STREAM`,
          data: { sn: mainSn },
          store: { mainSn, memberSn: d.sn },
        });
      }
      return results;
    });
  }
};
