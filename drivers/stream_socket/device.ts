'use strict';

import { BaseEcoFlowDevice } from '../../lib/BaseEcoFlowDevice';
import { StreamCmd } from '../../lib/streamProtocol';
import { toFiniteNumber } from '../../lib/quota';

/** Parse a relay on/off field, treating empty/absent values as unknown. */
function parseRelay(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  const n = toFiniteNumber(v);
  return n === undefined ? undefined : n !== 0;
}

/** A single AC outlet of a STREAM unit, as a Homey smart-plug device. */
module.exports = class StreamSocketDevice extends BaseEcoFlowDevice {
  private outlet = 1;
  private relayKey = 'relay2Onoff';
  private powerKey = 'powGetSchuko1';

  protected getReadSn(): string {
    return this.getData().sn;
  }

  protected async onReady(): Promise<void> {
    this.outlet = (this.getData().outlet as number) || 1;
    this.relayKey = this.outlet === 2 ? 'relay3Onoff' : 'relay2Onoff';
    this.powerKey = this.outlet === 2 ? 'powGetSchuko2' : 'powGetSchuko1';

    this.registerCapabilityListener('onoff', async (on: boolean) => {
      // Per-unit relays are reported per unit, so socket control targets the
      // unit's own SN (not the system main SN). Verify on hardware for members.
      const cmd = this.outlet === 2 ? StreamCmd.ac2(this.getReadSn(), on) : StreamCmd.ac1(this.getReadSn(), on);
      await this.client.setQuota(cmd);
      this.homey.setTimeout(() => this.poll().catch((e) => this.error('post-set poll', e)), 1500);
    });
  }

  async applyQuota(quota: Record<string, any>): Promise<void> {
    const on = parseRelay(quota[this.relayKey]);
    if (on !== undefined && this.getCapabilityValue('onoff') !== on) {
      await this.setCapabilityValue('onoff', on).catch((e) => this.error('onoff', e));
    }
    const power = toFiniteNumber(quota[this.powerKey]);
    if (power !== undefined && this.getCapabilityValue('measure_power') !== power) {
      await this.setCapabilityValue('measure_power', power).catch((e) => this.error('measure_power', e));
    }
  }
};
