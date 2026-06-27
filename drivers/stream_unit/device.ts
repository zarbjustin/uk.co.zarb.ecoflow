'use strict';

import { BaseEcoFlowDevice } from '../../lib/BaseEcoFlowDevice';
import { mapStreamQuota } from '../../lib/streamMapping';
import { streamModelFromSn } from '../../lib/streamModels';
import { StreamCmd, OperatingMode } from '../../lib/streamProtocol';

/**
 * A single physical STREAM inverter/battery unit. The device is tailored to its
 * exact model and its role in the system (detected from the serial number):
 *
 *  - Every unit shows its own battery, health, temperature, grid feed and AC
 *    outputs (AC1/AC2), and can switch those AC outputs (per-unit relays).
 *  - Solar models (e.g. STREAM Ultra X) show their PV inputs; AC-coupled models
 *    (e.g. STREAM AC Pro) drop the solar tiles they can never report.
 *  - The system MAIN unit additionally exposes the whole-home controls and
 *    flow tiles (operating mode, backup reserve, charge/discharge limits, grid
 *    feed-in, house consumption and the house power split) — these are
 *    system-wide and read 0 on member units, so they are hidden there.
 *
 * Per-unit telemetry (soc/f32ShowSoc, soh, cycles, temp) arrives over MQTT; the
 * REST snapshot only carries the unit's grid feed and relay state.
 */
module.exports = class StreamUnitDevice extends BaseEcoFlowDevice {
  private mainSn = '';

  /** Whole-home controls + flow tiles, meaningful only on the system main unit. */
  private static readonly SYSTEM_CAPS = [
    'operating_mode',
    'backup_reserve_soc',
    'charge_limit',
    'discharge_limit',
    'feed_in_control',
    'measure_power.load',
    'stream_unit_power_from_solar',
    'stream_unit_power_from_battery',
    'stream_unit_power_from_grid',
  ];

  private static readonly LEGACY_SYSTEM_CAPS = [
    'measure_power.from_pv',
    'measure_power.from_battery',
    'measure_power.from_grid',
  ];

  /** AC outputs every STREAM unit has and can switch on its own. */
  private static readonly AC_CAPS = [
    'onoff.ac1',
    'onoff.ac2',
    'stream_unit_power_ac1',
    'stream_unit_power_ac2',
  ];

  private static readonly LEGACY_AC_POWER_CAPS = [
    'measure_power.schuko1',
    'measure_power.schuko2',
  ];

  private static readonly POWER_CAP_MAP: Record<string, string> = {
    'measure_power.pv': 'stream_unit_power_solar',
    'measure_power.pv1': 'stream_unit_power_pv1',
    'measure_power.pv2': 'stream_unit_power_pv2',
    'measure_power.pv3': 'stream_unit_power_pv3',
    'measure_power.pv4': 'stream_unit_power_pv4',
    'measure_power.schuko1': 'stream_unit_power_ac1',
    'measure_power.schuko2': 'stream_unit_power_ac2',
    'measure_power.from_pv': 'stream_unit_power_from_solar',
    'measure_power.from_battery': 'stream_unit_power_from_battery',
    'measure_power.from_grid': 'stream_unit_power_from_grid',
    measure_power: 'stream_unit_power_battery_flow',
    'measure_power.grid': 'stream_unit_power_grid',
  };

  protected async onReady(): Promise<void> {
    const sn = this.getData().sn as string;
    const spec = streamModelFromSn(sn);
    this.mainSn = (this.getStoreValue('mainSn') as string) || sn;
    try {
      if (this.mainSn === sn) this.mainSn = await this.client.getMainSn(sn);
    } catch (e) {
      this.error('resolve main SN', e);
    }
    const isMain = this.mainSn === sn;

    // Base per-unit capabilities every unit should have.
    await this.ensureCapabilities(['battery_charging_state', 'stream_unit_power_battery_flow', 'stream_unit_power_grid', ...StreamUnitDevice.AC_CAPS]);
    await this.removeCapabilities(['measure_power', 'measure_power.grid']);
    await this.removeCapabilities(StreamUnitDevice.LEGACY_AC_POWER_CAPS);

    // Solar tiles: solar models keep their PV inputs; AC-coupled models drop them.
    await this.tailorSolarCapabilities(spec.acCoupled ? 0 : spec.solarInputs);

    // Whole-home controls/tiles only on the system main unit.
    if (isMain) await this.ensureCapabilities(StreamUnitDevice.SYSTEM_CAPS);
    else await this.removeCapabilities(StreamUnitDevice.SYSTEM_CAPS);
    await this.removeCapabilities(StreamUnitDevice.LEGACY_SYSTEM_CAPS);

    this.registerControlListeners(isMain);
    await this.refreshInfoSettings(sn, isMain).catch((e) => this.error('refresh info settings', e));
  }

  private async ensureCapabilities(caps: string[]): Promise<void> {
    for (const cap of caps) {
      if (!this.hasCapability(cap)) {
        await this.addCapability(cap).catch((e) => this.error(`add ${cap}`, e));
      }
    }
  }

  private async removeCapabilities(caps: string[]): Promise<void> {
    for (const cap of caps) {
      if (this.hasCapability(cap)) {
        await this.removeCapability(cap).catch((e) => this.error(`remove ${cap}`, e));
      }
    }
  }

  /** Ensure solar generation + PV1..N; remove any beyond N and legacy tiles. */
  private async tailorSolarCapabilities(solarInputs: number): Promise<void> {
    if (solarInputs > 0) {
      await this.ensureCapabilities(['stream_unit_power_solar']);
    } else if (this.hasCapability('stream_unit_power_solar')) {
      await this.removeCapability('stream_unit_power_solar').catch((e) => this.error('remove stream_unit_power_solar', e));
    }
    if (this.hasCapability('measure_power.pv')) {
      await this.removeCapability('measure_power.pv').catch((e) => this.error('remove measure_power.pv', e));
    }
    for (let i = 1; i <= 4; i += 1) {
      const cap = `stream_unit_power_pv${i}`;
      const legacyCap = `measure_power.pv${i}`;
      if (i <= solarInputs) {
        await this.ensureCapabilities([cap]);
      } else if (this.hasCapability(cap)) {
        await this.removeCapability(cap).catch((e) => this.error(`remove ${cap}`, e));
      }
      if (this.hasCapability(legacyCap)) {
        await this.removeCapability(legacyCap).catch((e) => this.error(`remove ${legacyCap}`, e));
      }
    }
  }

  /**
   * Wire the controls. AC outputs switch the unit's OWN relays (per-unit); the
   * whole-home controls target the system main SN and are only present on the
   * main unit.
   */
  private registerControlListeners(isMain: boolean): void {
    if (this.hasCapability('onoff.ac1')) {
      this.registerCapabilityListener('onoff.ac1', async (v: boolean) => this.send(StreamCmd.ac1(this.getReadSn(), v)));
    }
    if (this.hasCapability('onoff.ac2')) {
      this.registerCapabilityListener('onoff.ac2', async (v: boolean) => this.send(StreamCmd.ac2(this.getReadSn(), v)));
    }
    if (!isMain) return;
    this.registerCapabilityListener('operating_mode', async (v: OperatingMode) => this.send(StreamCmd.operatingMode(this.mainSn, v)));
    this.registerCapabilityListener('backup_reserve_soc', async (v: number) => this.send(StreamCmd.backupReserve(this.mainSn, v)));
    this.registerCapabilityListener('charge_limit', async (v: number) => this.send(StreamCmd.chargeLimit(this.mainSn, v)));
    this.registerCapabilityListener('discharge_limit', async (v: number) => this.send(StreamCmd.dischargeLimit(this.mainSn, v)));
    this.registerCapabilityListener('feed_in_control', async (v: boolean) => this.send(StreamCmd.feedIn(this.mainSn, v)));
  }

  /** Send a STREAM set command and refresh state shortly after. */
  private async send(payload: Record<string, any>): Promise<void> {
    await this.client.setQuota(payload);
    this.homey.setTimeout(() => this.poll().catch((e) => this.error('post-set poll', e)), 1500);
  }

  /** Populate the read-only model/serial/role settings shown on the device page. */
  private async refreshInfoSettings(sn: string, isMain: boolean): Promise<void> {
    const spec = streamModelFromSn(sn);
    await this.setSettings({
      model: spec.model,
      serial_number: sn,
      system_role: isMain ? 'System main unit' : 'Member unit',
      power_source: spec.energySource,
      ac_output: spec.acOutput,
    }).catch((e) => this.error('set info settings', e));
  }

  protected getReadSn(): string {
    return this.getData().sn;
  }

  protected handlesStatus(): boolean {
    return true;
  }

  async applyQuota(quota: Record<string, any>): Promise<void> {
    const values = mapStreamQuota(quota, 'unit');
    for (const [source, target] of Object.entries(StreamUnitDevice.POWER_CAP_MAP)) {
      const value = values[source];
      if (value !== undefined) values[target] = value;
      delete values[source];
    }
    // Self-heating is reported only by some firmwares; add the tile on demand so
    // it never shows blank on units that don't report it.
    if (values.self_heating !== undefined && !this.hasCapability('self_heating')) {
      await this.addCapability('self_heating').catch((e) => this.error('add self_heating', e));
    }
    for (const [cap, value] of Object.entries(values)) {
      if (!this.hasCapability(cap)) continue;
      if (this.getCapabilityValue(cap) === value) continue;
      await this.setCapabilityValue(cap, value).catch((e) => this.error(`setCapabilityValue ${cap}`, e));
    }
  }
};
