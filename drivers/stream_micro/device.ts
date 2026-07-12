'use strict';

import { BaseEcoFlowDevice } from '../../lib/BaseEcoFlowDevice';
import { perPvWatts } from '../../lib/streamMapping';
import { integratePositivePower } from '../../lib/energyIntegration';
import { toFiniteNumber } from '../../lib/quota';
import { EnergyCheckpoint } from '../../lib/EnergyCheckpoint';

/**
 * STREAM Microinverter as a Homey solarpanel device. `measure_power` is the PV
 * generation (PV1+PV2); cumulative generated energy is integrated locally.
 */
module.exports = class StreamMicroDevice extends BaseEcoFlowDevice {
  private generatedWh = 0;
  private lastTs = 0;
  private energyCheckpoint!: EnergyCheckpoint;

  private static readonly LIVE_POWER_CAPS = [
    'measure_power',
    'stream_micro_power_solar',
    'measure_power.pv1',
    'stream_micro_power_pv1',
    'measure_power.pv2',
    'stream_micro_power_pv2',
    'measure_power.grid',
    'stream_micro_power_grid_feed',
  ];

  protected getReadSn(): string {
    return this.getData().sn;
  }

  protected async onReady(): Promise<void> {
    this.generatedWh = (this.getStoreValue('generatedWh') as number) || 0;
    this.energyCheckpoint = new EnergyCheckpoint(this.homey, () => this.setStoreValue('generatedWh', this.generatedWh));
    await this.ensureCapabilities(StreamMicroDevice.LIVE_POWER_CAPS);
    await this.setCapabilityValue('meter_power', this.generatedWh / 1000).catch(() => {});
  }

  async applyQuota(quota: Record<string, any>): Promise<void> {
    const pv1 = perPvWatts(quota, 1);
    const pv2 = perPvWatts(quota, 2);
    if (pv1 !== undefined && this.getCapabilityValue('stream_micro_power_pv1') !== pv1) {
      await this.setCapabilityValue('stream_micro_power_pv1', pv1).catch(() => {});
    }
    if (pv1 !== undefined && this.getCapabilityValue('measure_power.pv1') !== pv1) {
      await this.setCapabilityValue('measure_power.pv1', pv1).catch(() => {});
    }
    if (pv2 !== undefined && this.getCapabilityValue('stream_micro_power_pv2') !== pv2) {
      await this.setCapabilityValue('stream_micro_power_pv2', pv2).catch(() => {});
    }
    if (pv2 !== undefined && this.getCapabilityValue('measure_power.pv2') !== pv2) {
      await this.setCapabilityValue('measure_power.pv2', pv2).catch(() => {});
    }

    const grid = toFiniteNumber(quota.gridConnectionPower);
    if (grid !== undefined && this.getCapabilityValue('stream_micro_power_grid_feed') !== grid) {
      await this.setCapabilityValue('stream_micro_power_grid_feed', grid).catch(() => {});
    }
    if (grid !== undefined && this.getCapabilityValue('measure_power.grid') !== grid) {
      await this.setCapabilityValue('measure_power.grid', grid).catch(() => {});
    }

    if (pv1 !== undefined || pv2 !== undefined) {
      const power = Math.max(0, (pv1 || 0) + (pv2 || 0));
      if (this.getCapabilityValue('stream_micro_power_solar') !== power) {
        await this.setCapabilityValue('stream_micro_power_solar', power).catch((e) => this.error('stream_micro_power_solar', e));
      }
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
          this.energyCheckpoint.mark();
          await this.setCapabilityValue('meter_power', this.generatedWh / 1000).catch(() => {});
        }
      }
    }
  }

  protected async onTeardown(): Promise<void> {
    await this.energyCheckpoint?.flush();
  }

  private async ensureCapabilities(caps: string[]): Promise<void> {
    for (const cap of caps) {
      if (!this.hasCapability(cap)) {
        await this.addCapability(cap).catch((e) => this.error(`add ${cap}`, e));
      }
    }
  }

};
