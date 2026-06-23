'use strict';

import { BaseEcoFlowDevice } from '../../lib/BaseEcoFlowDevice';
import { mapStreamQuota } from '../../lib/streamMapping';

/**
 * A single physical STREAM inverter/battery unit: per-unit battery %, health and
 * its own grid feed. Per-unit telemetry (soc/f32ShowSoc, soh, cycles, temp)
 * arrives over MQTT; the REST snapshot only carries the unit's grid feed.
 */
module.exports = class StreamUnitDevice extends BaseEcoFlowDevice {
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
