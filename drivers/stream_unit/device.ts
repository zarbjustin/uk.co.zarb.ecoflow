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
    'measure_power.from_pv',
    'measure_power.from_battery',
    'measure_power.from_grid',
  ];

  /** AC outputs every STREAM unit has and can switch on its own. */
  private static readonly AC_CAPS = [
    'onoff.ac1',
    'onoff.ac2',
    'measure_power.schuko1',
    'measure_power.schuko2',
  ];

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
    await this.ensureCapabilities(['battery_charging_state', 'measure_power', ...StreamUnitDevice.AC_CAPS]);

    // Solar tiles: solar models keep their PV inputs; AC-coupled models drop them.
    await this.tailorSolarCapabilities(spec.acCoupled ? 0 : spec.solarInputs);

    // Whole-home controls/tiles only on the system main unit.
    if (isMain) await this.ensureCapabilities(StreamUnitDevice.SYSTEM_CAPS);
    else await this.removeCapabilities(StreamUnitDevice.SYSTEM_CAPS);

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

  /** Keep `measure_power.pv` + `measure_power.pv1..N`; remove the rest. */
  private async tailorSolarCapabilities(solarInputs: number): Promise<void> {
    if (solarInputs <= 0 && this.hasCapability('measure_power.pv')) {
      await this.removeCapability('measure_power.pv').catch((e) => this.error('remove measure_power.pv', e));
    }
    for (let i = 1; i <= 4; i += 1) {
      const cap = `measure_power.pv${i}`;
      if (i > solarInputs && this.hasCapability(cap)) {
        await this.removeCapability(cap).catch((e) => this.error(`remove ${cap}`, e));
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
    for (const [cap, value] of Object.entries(values)) {
      if (!this.hasCapability(cap)) continue;
      if (this.getCapabilityValue(cap) === value) continue;
      await this.setCapabilityValue(cap, value).catch((e) => this.error(`setCapabilityValue ${cap}`, e));
    }
  }
};
