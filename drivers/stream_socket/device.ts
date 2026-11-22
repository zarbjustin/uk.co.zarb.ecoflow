'use strict';

import { BaseEcoFlowDevice, QuotaSampleContext } from '../../lib/BaseEcoFlowDevice';
import { StreamCmd } from '../../lib/streamProtocol';
import { toFiniteNumber } from '../../lib/quota';

/** A single AC outlet of a STREAM unit, as a Homey smart-plug device. */
module.exports = class StreamSocketDevice extends BaseEcoFlowDevice {
  private outlet = 1;
  private relayKey = 'relay2Onoff';
  private powerKey = 'powGetSchuko1';

  protected getReadSn(): string {
    return this.getData().sn;
  }

  protected requiredLiveReadings(): readonly string[] {
    return ['measure_power', 'onoff'];
  }

  protected async onReady(): Promise<void> {
    const generation = this.lifecycleGeneration;
    await this.queueDeviceWork(async () => {
      this.outlet = (this.getData().outlet as number) || 1;
      this.relayKey = this.outlet === 2 ? 'relay3Onoff' : 'relay2Onoff';
      this.powerKey = this.outlet === 2 ? 'powGetSchuko2' : 'powGetSchuko1';
      await this.startLiveReadings(['measure_power', 'onoff']);
      if (this.isShuttingDown() || generation !== this.lifecycleGeneration) return;

      this.registerCapabilityListener('onoff', async (on: boolean) => {
        // Per-unit relays are reported per unit, so socket control targets the
        // unit's own SN (not the system main SN). Verify on hardware for members.
        const cmd = this.outlet === 2 ? StreamCmd.ac2(this.getReadSn(), on) : StreamCmd.ac1(this.getReadSn(), on);
        await this.writeQuota(cmd);
        this.homey.setTimeout(() => this.poll().catch((e) => this.error('post-set poll', e)), 1500);
      });
    });
  }

  async applyQuota(quota: Record<string, any>, context?: QuotaSampleContext): Promise<void> {
    if (context?.sourceSn !== undefined && context.sourceSn !== this.getReadSn()) return;
    const at = context?.receivedAt ?? Date.now();
    const relay = quota[this.relayKey];
    const numericRelay = toFiniteNumber(relay);
    if (typeof relay === 'boolean' || numericRelay === 0 || numericRelay === 1) {
      const on = typeof relay === 'boolean' ? relay : numericRelay === 1;
      await this.applyLiveReading('onoff', on, at);
    }
    const power = toFiniteNumber(quota[this.powerKey]);
    if (power !== undefined) await this.applyLiveReading('measure_power', power, at);
  }

  protected async onTeardown(): Promise<void> {
    this.stopLiveReadings();
  }
};
