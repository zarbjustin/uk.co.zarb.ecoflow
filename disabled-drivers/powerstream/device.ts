'use strict';

import { BaseEcoFlowDevice } from '../../lib/BaseEcoFlowDevice';
import { mapPowerStreamQuota } from '../../lib/powerStreamMapping';
import { PsCmd } from '../../lib/powerStreamProtocol';

module.exports = class PowerStreamDevice extends BaseEcoFlowDevice {
  protected getReadSn(): string {
    return this.getData().sn;
  }

  protected async onReady(): Promise<void> {
    const sn = this.getReadSn();
    this.registerCapabilityListener('output_target_power', async (v: number) => this.send(PsCmd.outputWatts(sn, v)));
    this.registerCapabilityListener('supply_priority', async (v: string) => this.send(PsCmd.supplyPriority(sn, v === 'power_storage')));
    this.registerCapabilityListener('led_brightness', async (v: number) => this.send(PsCmd.brightness(sn, v)));
    this.registerCapabilityListener('ps_charge_limit', async (v: number) => this.send(PsCmd.chargeLimit(sn, v)));
    this.registerCapabilityListener('ps_discharge_limit', async (v: number) => this.send(PsCmd.dischargeLimit(sn, v)));
  }

  private async send(payload: Record<string, any>): Promise<void> {
    await this.client.setQuota(payload);
    this.homey.setTimeout(() => this.poll().catch((e) => this.error('post-set poll', e)), 1500);
  }

  async applyQuota(quota: Record<string, any>): Promise<void> {
    const values = mapPowerStreamQuota(quota);
    for (const [cap, value] of Object.entries(values)) {
      if (!this.hasCapability(cap)) continue;
      if (this.getCapabilityValue(cap) === value) continue;
      await this.setCapabilityValue(cap, value).catch((e) => this.error(`setCapabilityValue ${cap}`, e));
    }
  }
};
