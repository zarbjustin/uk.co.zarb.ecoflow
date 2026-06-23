'use strict';

import Homey from 'homey';
import { classifyDevice } from '../../lib/ecoflowDevices';
import { EcoFlowDevice } from '../../lib/types';
import { registerCredentialHandlers, clientFromSettings } from '../../lib/pairing';

module.exports = class StreamDriver extends Homey.Driver {
  async onInit(): Promise<void> {
    this.registerFlowCards();
    this.log('STREAM driver initialised');
  }

  private registerFlowCards(): void {
    const { flow } = this.homey;

    // Conditions
    flow.getConditionCard('operating_mode_is').registerRunListener(
      (args: any) => args.device.getCapabilityValue('operating_mode') === args.mode,
    );
    flow.getConditionCard('feed_in_enabled').registerRunListener(
      (args: any) => args.device.getCapabilityValue('feed_in_control') === true,
    );
    flow.getConditionCard('is_charging').registerRunListener((args: any) => args.device.isCharging());
    flow.getConditionCard('is_exporting').registerRunListener((args: any) => args.device.isExporting());
    flow.getConditionCard('solar_power_above').registerRunListener(
      (args: any) => (args.device.getCapabilityValue('measure_power.pv') as number) > args.watts,
    );

    // Actions
    flow.getActionCard('refresh_now').registerRunListener((args: any) => args.device.flowRefresh());
    flow.getActionCard('set_operating_mode').registerRunListener(
      (args: any) => args.device.flowSetOperatingMode(args.mode),
    );
    flow.getActionCard('set_backup_reserve').registerRunListener(
      (args: any) => args.device.flowSetBackupReserve(args.level),
    );
    flow.getActionCard('set_feed_in').registerRunListener(
      (args: any) => args.device.flowSetFeedIn(args.state === 'on'),
    );
    flow.getActionCard('set_charge_limit').registerRunListener(
      (args: any) => args.device.flowSetChargeLimit(args.level),
    );
    flow.getActionCard('set_discharge_limit').registerRunListener(
      (args: any) => args.device.flowSetDischargeLimit(args.level),
    );

    // Trigger arg-matching for the battery threshold card
    flow.getDeviceTriggerCard('battery_level_crossed').registerRunListener((args: any, state: any) => {
      const up = state.prevSoc < args.level && state.soc >= args.level;
      const down = state.prevSoc > args.level && state.soc <= args.level;
      return (args.direction === 'above' && up) || (args.direction === 'below' && down);
    });
  }

  async onPair(session: any): Promise<void> {
    registerCredentialHandlers(this, session);

    session.setHandler('list_devices', async () => {
      const client = clientFromSettings(this);

      const devices = await client.getDeviceList();

      // Keep only controllable STREAM units (Ultra/Pro/AC/AC Pro/Max/Ultra X).
      // The Smart Meter and Microinverter are handled by their own driver / are
      // not controllable, so they must not represent a STREAM system. For any
      // device the prefix/name can't classify, probe its quota to catch unknown
      // STREAM model prefixes.
      const units: EcoFlowDevice[] = [];
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
        if (role === 'stream_unit') units.push(d);
      }

      // A multi-unit STREAM installation is exposed by the API as one "system"
      // addressed by its main SN. Group the units by main SN and surface a
      // single system device per group, named after its main unit.
      const groups = new Map<string, EcoFlowDevice[]>();
      for (const d of units) {
        let mainSn = d.sn;
        try {
          mainSn = await client.getMainSn(d.sn);
        } catch (e) {
          this.error('getMainSn failed, using device SN', e);
        }
        const g = groups.get(mainSn);
        if (g) g.push(d);
        else groups.set(mainSn, [d]);
      }

      const results: any[] = [];
      for (const [mainSn, groupUnits] of groups) {
        const mainDev = devices.find((x) => x.sn === mainSn);
        const name = mainDev?.deviceName || groupUnits[0].deviceName || 'EcoFlow STREAM';
        results.push({ name, data: { sn: mainSn }, store: { mainSn } });
      }
      return results;
    });
  }
};
