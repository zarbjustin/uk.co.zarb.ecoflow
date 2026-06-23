'use strict';

import { BaseEcoFlowDevice } from '../../lib/BaseEcoFlowDevice';
import { solarPowerWatts, perPvWatts } from '../../lib/streamMapping';
import { integratePositivePower } from '../../lib/energyIntegration';

/**
 * STREAM solar generation as a Homey `solarpanel` device. `measure_power` is the
 * total PV power (positive when generating); cumulative generated energy
 * (`meter_power`) is integrated locally since the REST API exposes no lifetime
 * solar counter.
 */
module.exports = class StreamSolarDevice extends BaseEcoFlowDevice {
  private generatedWh = 0;
  private lastTs = 0;

  protected getReadSn(): string {
    return (this.getStoreValue('mainSn') as string) || this.getData().sn;
  }

  protected async onReady(): Promise<void> {
    this.generatedWh = (this.getStoreValue('generatedWh') as number) || 0;
    await this.setCapabilityValue('meter_power', this.generatedWh / 1000).catch(() => {});
  }

  async applyQuota(quota: Record<string, any>): Promise<void> {
    const raw = solarPowerWatts(quota);
    if (raw !== undefined) {
      const power = Math.max(0, raw); // solar must be non-negative when generating
      if (this.getCapabilityValue('measure_power') !== power) {
        await this.setCapabilityValue('measure_power', power).catch((e) => this.error('measure_power', e));
      }
      // Capture the interval and re-anchor synchronously (before any await) to
      // avoid a concurrent poll+MQTT double-count.
      const now = Date.now();
      const dtMs = this.lastTs > 0 ? now - this.lastTs : 0;
      this.lastTs = now;
      if (dtMs > 0) {
        const next = integratePositivePower(this.generatedWh, power, dtMs);
        if (next !== this.generatedWh) {
          this.generatedWh = next;
          await this.setStoreValue('generatedWh', this.generatedWh).catch(() => {});
          await this.setCapabilityValue('meter_power', this.generatedWh / 1000).catch(() => {});
        }
      }
    }

    for (let i = 1; i <= 4; i += 1) {
      const cap = `measure_power.pv${i}`;
      if (!this.hasCapability(cap)) continue;
      const v = perPvWatts(quota, i);
      if (v !== undefined && this.getCapabilityValue(cap) !== v) {
        await this.setCapabilityValue(cap, v).catch((e) => this.error(cap, e));
      }
    }
  }
};
