'use strict';

import Homey from 'homey';
import {
  registerCredentialHandlers, clientFromSettings, hasSavedCreds,
} from '../../lib/pairing';
import { collectStreamUnits, groupByMainSn, householdBatteryName } from '../../lib/streamPairing';
import { aboveBelow } from '../../lib/thresholds';
import { registerAppAuthHandlers, hasSavedAppAuthCreds } from '../../lib/appAuthPairing';
import {
  stream5000HomeBatteryPairingOptions,
  pairedStream5000FamilyCount,
  stream5000PairingDevices,
} from '../../lib/stream5000Pairing';
import { streamHomeBatteryProfile } from '../../lib/stream5000Models';
import { Stream5000UnitDevice } from '../../lib/Stream5000UnitDevice';

const StreamDevice = require('./device');

type StreamPairingMode = 'developer_api' | 'app_connection';

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
    flow.getConditionCard('solar_power_below').registerRunListener(
      (args: any) => (args.device.getCapabilityValue('measure_power.pv') as number) < args.watts,
    );
    flow.getConditionCard('charging_from_solar').registerRunListener(
      (args: any) => args.device.isChargingFromSolar(),
    );
    flow.getConditionCard('solar_forecast_today').registerRunListener(
      (args: any) => aboveBelow(args.device.getCapabilityValue('solar_forecast_today'), args.direction, args.kwh),
    );
    flow.getConditionCard('solar_forecast_tomorrow').registerRunListener(
      (args: any) => aboveBelow(args.device.getCapabilityValue('solar_forecast_tomorrow'), args.direction, args.kwh),
    );
    flow.getConditionCard('electricity_price').registerRunListener(
      (args: any) => aboveBelow(args.device.getCapabilityValue('tariff_price_now'), args.direction, args.price),
    );
    flow.getConditionCard('electricity_price_negative').registerRunListener(
      (args: any) => args.device.priceIsNegative(),
    );
    flow.getConditionCard('battery_soc').registerRunListener(
      (args: any) => args.device.batterySocIs(args.direction, args.level),
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
    flow.getActionCard('prepare_for_cheap_import').registerRunListener(
      (args: any) => args.device.flowPrepareCheapImport(args.reserve),
    );
    flow.getActionCard('prepare_for_peak_export').registerRunListener(
      (args: any) => args.device.flowPreparePeakExport(args.reserve),
    );
    flow.getActionCard('release_for_export').registerRunListener(
      (args: any) => args.device.flowReleaseForExport(),
    );
    flow.getActionCard('set_electricity_price').registerRunListener(
      (args: any) => args.device.flowSetElectricityPrice(args.price),
    );

    // Trigger arg-matching for the battery threshold card
    flow.getDeviceTriggerCard('battery_level_crossed').registerRunListener((args: any, state: any) => {
      const up = state.prevSoc < args.level && state.soc >= args.level;
      const down = state.prevSoc > args.level && state.soc <= args.level;
      return (args.direction === 'above' && up) || (args.direction === 'below' && down);
    });

    // Grid import/export threshold-crossing triggers (fire only when rising through the arg).
    flow.getDeviceTriggerCard('grid_import_above').registerRunListener(
      (args: any, state: any) => state.prevPower < args.watts && state.power >= args.watts,
    );
    flow.getDeviceTriggerCard('grid_export_above').registerRunListener(
      (args: any, state: any) => state.prevPower < args.watts && state.power >= args.watts,
    );
  }

  /**
   * Homey supports multiple Device subclasses behind one stable driver ID.
   * The immutable serial prefix is sufficient to select the app-connected
   * 5000 runtime; every other STREAM Home Battery keeps the Developer-API
   * implementation that existing users already have.
   */
  onMapDeviceClass(device: any): any {
    const serial = String(device.getData?.().sn || '');
    const profile = String(device.getStoreValue?.('streamProfile') || '');
    return streamHomeBatteryProfile(serial, profile) === 'stream_5000'
      ? Stream5000UnitDevice
      : StreamDevice;
  }

  async onPair(session: any): Promise<void> {
    registerCredentialHandlers(this, session);
    const appAuth = registerAppAuthHandlers(this, session, {
      pairedDeviceCount: () => pairedStream5000FamilyCount(this),
    });
    let pairingMode: StreamPairingMode | undefined;

    session.setHandler('select_pairing_mode', async (data: { mode?: StreamPairingMode }) => {
      if (data?.mode !== 'developer_api' && data?.mode !== 'app_connection') {
        throw new Error('Choose a supported STREAM connection type.');
      }
      pairingMode = data.mode;
      return {
        hasCredentials: pairingMode === 'developer_api'
          ? hasSavedCreds(this.homey)
          : hasSavedAppAuthCreds(this.homey),
      };
    });

    session.setHandler('list_devices', async () => {
      if (pairingMode === 'app_connection') {
        const client = appAuth.getClient();
        if (!client) throw new Error('Sign in to the EcoFlow app account before pairing a STREAM 5000 installation.');
        const devices = await client.getDeviceList();
        const options = stream5000HomeBatteryPairingOptions();
        const verified = stream5000PairingDevices(this, devices, options);
        if (verified.length > 1) {
          return verified.map((device) => ({
            ...device,
            name: `STREAM Home Battery (${device.data.sn.slice(-4)})`,
          }));
        }
        return verified;
      }
      if (pairingMode !== 'developer_api') {
        throw new Error('Choose the STREAM generation before listing devices.');
      }
      const client = clientFromSettings(this);
      const units = await collectStreamUnits(client);
      // A multi-unit STREAM installation is one household battery addressed by
      // its main SN. Only add the physical main-unit name when multiple systems
      // need to be distinguished from each other.
      const results: any[] = [];
      const groups = groupByMainSn(units);
      for (const [mainSn, groupUnits] of groups) {
        results.push({
          name: householdBatteryName(groupUnits, mainSn, groups.size > 1),
          data: { sn: mainSn },
          store: { mainSn },
        });
      }
      return results;
    });
  }
};
