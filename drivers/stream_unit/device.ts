'use strict';

import { BaseEcoFlowDevice } from '../../lib/BaseEcoFlowDevice';
import { mapStreamQuota } from '../../lib/streamMapping';
import { streamModelFromSn } from '../../lib/streamModels';

/**
 * A single physical STREAM inverter/battery unit: per-unit battery %, health and
 * its own grid feed. Per-unit telemetry (soc/f32ShowSoc, soh, cycles, temp)
 * arrives over MQTT; the REST snapshot only carries the unit's grid feed.
 *
 * The device is tailored to its specific model (detected from the serial number):
 * AC-coupled units (e.g. STREAM AC Pro) drop the solar (PV) tiles they can never
 * report, and every unit's Settings page describes its exact product.
 */
module.exports = class StreamUnitDevice extends BaseEcoFlowDevice {
  protected async onReady(): Promise<void> {
    const sn = this.getData().sn as string;
    const spec = streamModelFromSn(sn);

    for (const cap of ['battery_charging_state', 'measure_power']) {
      if (!this.hasCapability(cap)) {
        await this.addCapability(cap).catch((e) => this.error(`add ${cap}`, e));
      }
    }

    // Tailor the solar tiles to the model: AC-coupled units (e.g. STREAM AC Pro)
    // have no PV input, so remove the misleading solar capabilities entirely;
    // solar units keep only the PV string inputs their model actually has.
    await this.tailorSolarCapabilities(spec.acCoupled ? 0 : spec.solarInputs);

    await this.refreshInfoSettings(sn).catch((e) => this.error('refresh info settings', e));
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

  /** Populate the read-only model/serial/role settings shown on the device page. */
  private async refreshInfoSettings(sn: string): Promise<void> {
    const spec = streamModelFromSn(sn);
    let role = 'Member unit';
    try {
      const mainSn = (this.getStoreValue('mainSn') as string) || (await this.client.getMainSn(sn));
      role = mainSn === sn ? 'System main unit' : 'Member unit';
    } catch (e) {
      this.error('resolve system role', e);
    }
    await this.setSettings({
      model: spec.model,
      serial_number: sn,
      system_role: role,
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
