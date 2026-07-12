'use strict';

import { BaseEcoFlowDevice } from '../../lib/BaseEcoFlowDevice';
import { perPvWatts, solarPowerWatts } from '../../lib/streamMapping';
import { integratePositivePower } from '../../lib/energyIntegration';
import { collectStreamUnits } from '../../lib/streamPairing';
import { EnergyCheckpoint } from '../../lib/EnergyCheckpoint';

/**
 * STREAM solar generation as a Homey `solarpanel` device. `measure_power` is the
 * total PV power (positive when generating); cumulative generated energy
 * (`meter_power`) is integrated locally since the REST API exposes no lifetime
 * solar counter.
 */
module.exports = class StreamSolarDevice extends BaseEcoFlowDevice {
  private generatedWh = 0;
  private lastTs = 0;
  private attributionTimer: NodeJS.Timeout | null = null;
  private energyCheckpoint!: EnergyCheckpoint;

  protected getReadSn(): string {
    return (this.getStoreValue('mainSn') as string) || this.getData().sn;
  }

  protected async onReady(): Promise<void> {
    for (let i = 1; i <= 4; i += 1) {
      const cap = `measure_power.pv${i}`;
      if (this.hasCapability(cap)) {
        await this.removeCapability(cap).catch((e) => this.error(`remove ${cap}`, e));
      }
    }
    this.generatedWh = (this.getStoreValue('generatedWh') as number) || 0;
    this.energyCheckpoint = new EnergyCheckpoint(this.homey, () => this.setStoreValue('generatedWh', this.generatedWh));
    await this.setCapabilityValue('meter_power', this.generatedWh / 1000).catch(() => {});
    await this.refreshAttributionSettings().catch((e) => this.error('refresh PV attribution', e));
    this.attributionTimer = this.homey.setInterval(() => {
      this.refreshAttributionSettings().catch((e) => this.error('refresh PV attribution', e));
    }, 30 * 60 * 1000);
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
          this.energyCheckpoint.mark();
          await this.setCapabilityValue('meter_power', this.generatedWh / 1000).catch(() => {});
        }
      }
    }
  }

  protected async onTeardown(): Promise<void> {
    if (this.attributionTimer) this.homey.clearInterval(this.attributionTimer);
    await this.energyCheckpoint?.flush();
  }

  private async refreshAttributionSettings(): Promise<void> {
    const mainSn = this.getReadSn();
    const units = (await collectStreamUnits(this.client)).filter((u) => u.mainSn === mainSn);
    const lines = units.map((u, idx) => {
      const name = u.device.deviceName || `STREAM Unit ${idx + 1}`;
      const pv: string[] = [];
      for (let i = 1; i <= 4; i += 1) {
        const watts = perPvWatts(u.quota, i);
        if (watts !== undefined) pv.push(`PV${i} ${Math.round(watts)} W`);
      }
      return `${name}: ${pv.length ? pv.join(', ') : 'no PV input reported'}`;
    });
    await this.setSettings({
      aggregation_source: `Whole STREAM system (${units.length || 1} unit${units.length === 1 ? '' : 's'})`,
      pv_attribution: lines.length ? lines.join('\n') : 'No STREAM units found for this system yet.',
    }).catch((e) => this.error('set PV attribution settings', e));
  }
};
