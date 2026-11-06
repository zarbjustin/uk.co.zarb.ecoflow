'use strict';

import { BaseEcoFlowDevice, QuotaSampleContext } from '../../lib/BaseEcoFlowDevice';
import { perPvWatts } from '../../lib/streamMapping';
import { integratePositivePower } from '../../lib/energyIntegration';
import { toFiniteNumber } from '../../lib/quota';
import { EnergyCheckpoint } from '../../lib/EnergyCheckpoint';
import { STREAM_LIVE_TTL_MS } from '../../lib/StreamLiveReadings';

function validTotal(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function sourceSn(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : undefined;
}

/**
 * STREAM Microinverter as a Homey solarpanel device. `measure_power` is the PV
 * generation (PV1+PV2); cumulative generated energy is integrated locally.
 */
module.exports = class StreamMicroDevice extends BaseEcoFlowDevice {
  private generatedWh = 0;
  private lastTs = 0;
  private lastReceiptTs = 0;
  private energyCheckpoint?: EnergyCheckpoint;
  private energySourceSn: string | undefined;
  private energyKnown = false;
  private energyReadOnly = false;

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

  protected requiredLiveReadings(): readonly string[] {
    return ['measure_power'];
  }

  protected async onReady(): Promise<void> {
    await this.queueDeviceWork(async () => {
      await this.energyCheckpoint?.close();
      this.lastTs = 0;
      this.lastReceiptTs = 0;
      this.generatedWh = 0;
      this.energyKnown = false;
      this.energySourceSn = sourceSn(this.getData().sn);
      const state = this.getStoreValue('microEnergyState');
      const legacy = this.getStoreValue('generatedWh');
      const projection = this.getCapabilityValue('meter_power');
      const projectedWh = validTotal(projection) ? projection * 1000 : undefined;
      this.energyReadOnly = !this.energySourceSn
        || (validTotal(projection) && !validTotal(projectedWh))
        || (state != null && (state.version !== 1 || sourceSn(state.sourceSn) !== this.energySourceSn))
        || (state != null && !validTotal(state.generatedWh) && !validTotal(projectedWh))
        || (legacy != null && typeof legacy === 'object');
      if (!this.energyReadOnly) {
        // A coherent source-bound record wins over a partially written legacy mirror.
        const totals = (state == null ? [legacy] : [state.generatedWh]).filter(validTotal);
        const stored = totals.length ? Math.max(...totals) : undefined;
        if (validTotal(projectedWh) && (stored === undefined || projection !== Math.round(stored) / 1000)) totals.push(projectedWh);
        if (totals.length) {
          this.generatedWh = Math.max(...totals);
          this.energyKnown = true;
        } else if (legacy != null || state != null || projection != null) this.energyReadOnly = true;
      }
      if (this.energyReadOnly) this.error('Microinverter source/checkpoint requires reconciliation; preserving existing counters.');
      const boundSource = this.energySourceSn;
      this.energyCheckpoint = new EnergyCheckpoint(this.homey, async () => {
        if (this.energyReadOnly || !this.energyKnown) return;
        const current = this.getStoreValue('microEnergyState');
        const mirror = this.getStoreValue('generatedWh');
        if ((current != null && (current.version !== 1 || sourceSn(current.sourceSn) !== boundSource))
          || (mirror != null && typeof mirror === 'object')) throw new Error('Microinverter checkpoint ownership changed; preserving unsupported state.');
        const { generatedWh } = this;
        await this.setStoreValue('microEnergyState', { version: 1, sourceSn: boundSource, generatedWh });
        await this.setStoreValue('generatedWh', generatedWh);
      });
      await this.ensureCapabilities(StreamMicroDevice.LIVE_POWER_CAPS);
      await this.startLiveReadings(StreamMicroDevice.LIVE_POWER_CAPS);
      if (this.energyKnown) {
        this.energyCheckpoint.mark();
        await this.projectEnergy();
      }
    });
  }

  async applyQuota(quota: Record<string, any>, context?: QuotaSampleContext): Promise<void> {
    if (context?.accountingDiscontinuity) this.lastTs = 0;
    if (sourceSn(this.getReadSn()) !== this.energySourceSn
      || (context?.sourceSn !== undefined && sourceSn(context.sourceSn) !== this.energySourceSn)) {
      this.lastTs = 0;
      return;
    }
    const pv1 = perPvWatts(quota, 1);
    const pv2 = perPvWatts(quota, 2);
    const completePv = pv1 !== undefined && pv2 !== undefined;
    // Anchor and account receipt time before any SDK await; live tile latency is not energy time.
    if (pv1 !== undefined || pv2 !== undefined) {
      const wallNow = Date.now();
      const now = context?.receivedAt ?? wallNow;
      if (!Number.isFinite(now) || now <= 0 || now > wallNow) {
        this.lastTs = 0;
        return;
      }
      if (this.lastReceiptTs > wallNow) {
        this.lastReceiptTs = 0;
        this.lastTs = 0;
      }
      if (now <= this.lastReceiptTs) return;
      this.lastReceiptTs = now;
      if (!completePv) this.lastTs = 0;
      else if (!this.energyReadOnly) {
        const dtMs = this.lastTs > 0 && now - this.lastTs <= STREAM_LIVE_TTL_MS ? now - this.lastTs : 0;
        this.lastTs = now;
        const wasKnown = this.energyKnown;
        this.energyKnown = true;
        const next = integratePositivePower(this.generatedWh, Math.max(0, pv1 + pv2), dtMs);
        if (validTotal(next) && next !== this.generatedWh) {
          this.generatedWh = next;
          this.energyCheckpoint?.mark();
        }
        if (!wasKnown) this.energyCheckpoint?.mark();
      }
    }
    const at = context?.receivedAt ?? Date.now();
    for (const [value, caps] of [
      [pv1, ['stream_micro_power_pv1', 'measure_power.pv1']],
      [pv2, ['stream_micro_power_pv2', 'measure_power.pv2']],
    ] as const) {
      if (value !== undefined) for (const cap of caps) await this.applyLiveReading(cap, value, at);
    }

    const grid = toFiniteNumber(quota.gridConnectionPower);
    if (grid !== undefined) {
      await this.applyLiveReading('stream_micro_power_grid_feed', grid, at);
      await this.applyLiveReading('measure_power.grid', grid, at);
    }

    if (pv1 !== undefined || pv2 !== undefined) {
      const power = completePv ? Math.max(0, pv1 + pv2) : null;
      await this.applyLiveReading('stream_micro_power_solar', power, at);
      await this.applyLiveReading('measure_power', power, at);
      if (!this.energyReadOnly && this.energyKnown) await this.projectEnergy();
    }
  }

  protected async onTeardown(): Promise<void> {
    this.stopLiveReadings();
    this.lastTs = 0;
    this.lastReceiptTs = 0;
    await this.energyCheckpoint?.close();
  }

  private async projectEnergy(): Promise<void> {
    const projection = this.getCapabilityValue('meter_power');
    const total = this.generatedWh / 1000;
    const next = validTotal(projection) ? Math.max(projection, total) : total;
    if (projection !== next) await this.setCapabilityValue('meter_power', next).catch((e) => this.error('meter_power', e));
  }

  private async ensureCapabilities(caps: string[]): Promise<void> {
    for (const cap of caps) {
      if (!this.hasCapability(cap)) {
        await this.addCapability(cap).catch((e) => this.error(`add ${cap}`, e));
      }
    }
  }

};
