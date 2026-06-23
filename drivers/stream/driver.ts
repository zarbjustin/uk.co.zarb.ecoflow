'use strict';

import Homey from 'homey';
import { registerCredentialHandlers, clientFromSettings } from '../../lib/pairing';
import { collectStreamUnits, groupByMainSn, systemName } from '../../lib/streamPairing';

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
      const units = await collectStreamUnits(client);
      // A multi-unit STREAM installation is one "system" addressed by its main
      // SN; surface a single system device per group, named after its main unit.
      const results: any[] = [];
      for (const [mainSn, groupUnits] of groupByMainSn(units)) {
        results.push({ name: systemName(groupUnits, mainSn), data: { sn: mainSn }, store: { mainSn } });
      }
      return results;
    });
  }
};
