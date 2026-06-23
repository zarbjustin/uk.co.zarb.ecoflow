'use strict';

import { BaseEcoFlowDevice } from '../../lib/BaseEcoFlowDevice';
import { perPvWatts } from '../../lib/streamMapping';
import { integratePositivePower } from '../../lib/energyIntegration';
import { toFiniteNumber } from '../../lib/quota';

/**
 * STREAM Microinverter as a Homey solarpanel device. `measure_power` is the PV
 * generation (PV1+PV2); cumulative generated energy is integrated locally.
 */
module.exports = class StreamMicroDevice extends BaseEcoFlowDevice {
  private generatedWh = 0;
  private lastTs = 0;

  protected getReadSn(): string {
    return this.getData().sn;
  }

  protected async onReady(): Promise<void> {
    this.generatedWh = (this.getStoreValue('generatedWh') as number) || 0;
    await this.setCapabilityValue('meter_power', this.generatedWh / 1000).catch(() => {});
  }

  async applyQuota(quota: Record<string, any>): Promise<void> {
    const pv1 = perPvWatts(quota, 1);
    const pv2 = perPvWatts(quota, 2);
    if (pv1 !== undefined && this.getCapabilityValue('measure_power.pv1') !== pv1) {
      await this.setCapabilityValue('measure_power.pv1', pv1).catch(() => {});
    }
    if (pv2 !== undefined && this.getCapabilityValue('measure_power.pv2') !== pv2) {
      await this.setCapabilityValue('measure_power.pv2', pv2).catch(() => {});
    }

    const grid = toFiniteNumber(quota.gridConnectionPower);
    if (grid !== undefined && this.getCapabilityValue('measure_power.grid') !== grid) {
      await this.setCapabilityValue('measure_power.grid', grid).catch(() => {});
    }

    if (pv1 !== undefined || pv2 !== undefined) {
      const power = Math.max(0, (pv1 || 0) + (pv2 || 0));
      if (this.getCapabilityValue('measure_power') !== power) {
        await this.setCapabilityValue('measure_power', power).catch((e) => this.error('measure_power', e));
      }
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
  }
};
