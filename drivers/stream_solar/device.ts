'use strict';

import { BaseEcoFlowDevice, QuotaSampleContext } from '../../lib/BaseEcoFlowDevice';
import { perPvWatts, solarPowerWatts } from '../../lib/streamMapping';
import { integratePositivePower } from '../../lib/energyIntegration';
import { collectStreamUnits } from '../../lib/streamPairing';
import { EnergyCheckpoint } from '../../lib/EnergyCheckpoint';
import { STREAM_LIVE_TTL_MS } from '../../lib/StreamLiveReadings';

function validTotal(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function sourceSn(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : undefined;
}

/**
 * STREAM solar generation as a Homey `solarpanel` device. `measure_power` is the
 * total PV power (positive when generating); cumulative generated energy
 * (`meter_power`) is integrated locally since the REST API exposes no lifetime
 * solar counter.
 */
module.exports = class StreamSolarDevice extends BaseEcoFlowDevice {
  private generatedWh = 0;
  private lastTs = 0;
  private lastReceiptTs = 0;
  private attributionTimer: NodeJS.Timeout | null = null;
  private attributionPending = false;
  private energyCheckpoint?: EnergyCheckpoint;
  private energySourceSn: string | undefined;
  private energyKnown = false;
  private energyReadOnly = false;

  protected getReadSn(): string {
    return sourceSn(this.getStoreValue('mainSn')) || this.getData().sn;
  }

  protected requiredLiveReadings(): readonly string[] {
    return ['measure_power'];
  }

  protected async onReady(): Promise<void> {
    await this.queueDeviceWork(async () => {
      await this.startLiveReadings(['measure_power']);
      if (this.isShuttingDown()) return;
      await this.energyCheckpoint?.close();
      this.lastTs = 0;
      this.lastReceiptTs = 0;
      this.energyKnown = false;
      this.generatedWh = 0;
      this.energySourceSn = sourceSn(this.getData().sn);
      const mainSn = this.getStoreValue('mainSn');
      const state = this.getStoreValue('solarEnergyState');
      const legacy = this.getStoreValue('generatedWh');
      const projection = this.getCapabilityValue('meter_power');
      const projectedWh = validTotal(projection) ? projection * 1000 : undefined;
      // Legacy totals and their projection belong to the immutable paired source,
      // not a newly selected reporter. Unknown formats must survive untouched.
      this.energyReadOnly = !this.energySourceSn
        || sourceSn(this.getReadSn()) !== this.energySourceSn
        || (mainSn != null && !sourceSn(mainSn))
        || (validTotal(projection) && !validTotal(projectedWh))
        || (state != null && (state.version !== 1 || sourceSn(state.sourceSn) !== this.energySourceSn))
        || (state != null && !validTotal(state.generatedWh) && !validTotal(projectedWh))
        || (legacy != null && typeof legacy === 'object');
      if (!this.energyReadOnly) {
        // Once present, the coherent source-bound record supersedes its
        // compatibility mirror, including after a partially failed write.
        const totals = (state == null ? [legacy] : [state.generatedWh]).filter(validTotal);
        const stored = totals.length ? Math.max(...totals) : undefined;
        // A native one-Wh rounded display is not evidence that a precise
        // checkpoint is behind. Recover genuinely newer projections only.
        if (validTotal(projectedWh) && (stored === undefined || projection !== Math.round(stored) / 1000)) {
          totals.push(projectedWh);
        }
        if (totals.length) {
          this.generatedWh = Math.max(...totals);
          this.energyKnown = true;
        } else if (legacy != null || state != null || projection != null) {
          this.energyReadOnly = true;
        }
      }
      if (this.energyReadOnly) this.error('Solar source/checkpoint requires reconciliation; preserving existing counters.');
      const boundSource = this.energySourceSn;
      this.energyCheckpoint = new EnergyCheckpoint(this.homey, async () => {
        if (this.energyReadOnly || !this.energyKnown) return;
        const currentState = this.getStoreValue('solarEnergyState');
        const currentLegacy = this.getStoreValue('generatedWh');
        if ((currentState != null && (currentState.version !== 1 || sourceSn(currentState.sourceSn) !== boundSource))
          || (currentLegacy != null && typeof currentLegacy === 'object')) {
          throw new Error('Solar checkpoint ownership changed; preserving unsupported state.');
        }
        const { generatedWh } = this;
        await this.setStoreValue('solarEnergyState', { version: 1, sourceSn: boundSource, generatedWh });
        await this.setStoreValue('generatedWh', generatedWh);
      });
      for (let i = 1; i <= 4; i += 1) {
        const cap = `measure_power.pv${i}`;
        if (this.hasCapability(cap)) {
          await this.removeCapability(cap).catch((e) => this.error(`remove ${cap}`, e));
        }
      }
      if (this.energyKnown) {
        this.energyCheckpoint.mark();
        await this.projectEnergy();
      }
      // Startup and timer work share Base's drain, including already-started SDK writes.
      await this.refreshAttributionSettings().catch((e) => this.error('refresh PV attribution', e));
      if (this.isShuttingDown()) return;
      this.attributionTimer = this.homey.setInterval(() => {
        if (this.attributionPending) return;
        this.attributionPending = true;
        this.queueDeviceWork(() => this.refreshAttributionSettings())
          .catch((e) => this.error('refresh PV attribution', e))
          .finally(() => {
            this.attributionPending = false;
          });
      }, 30 * 60 * 1000);
    });
  }

  async applyQuota(quota: Record<string, any>, context?: QuotaSampleContext): Promise<void> {
    if (context?.accountingDiscontinuity) this.lastTs = 0;
    if (!this.energySourceSn
      || sourceSn(this.getReadSn()) !== this.energySourceSn
      || (context?.sourceSn !== undefined && sourceSn(context.sourceSn) !== this.energySourceSn)) {
      this.lastTs = 0;
      return;
    }
    const raw = solarPowerWatts(quota);
    if (raw !== undefined) {
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
      const dtMs = this.lastTs > 0 && now - this.lastTs <= STREAM_LIVE_TTL_MS ? now - this.lastTs : 0;
      this.lastTs = now;
      const power = Math.max(0, raw); // solar must be non-negative when generating
      if (this.energyReadOnly) {
        this.lastTs = 0;
        await this.applyLiveReading('measure_power', power, now);
        return;
      }
      const wasKnown = this.energyKnown;
      this.energyKnown = true;
      const next = integratePositivePower(this.generatedWh, power, dtMs);
      if (validTotal(next) && next !== this.generatedWh) {
        this.generatedWh = next;
        this.energyCheckpoint?.mark();
      }
      if (!wasKnown) this.energyCheckpoint?.mark();
      await this.applyLiveReading('measure_power', power, now);
      await this.projectEnergy();
    }
  }

  private async projectEnergy(): Promise<void> {
    const projection = this.getCapabilityValue('meter_power');
    const total = this.generatedWh / 1000;
    const next = validTotal(projection) ? Math.max(projection, total) : total;
    if (projection !== next) {
      await this.setCapabilityValue('meter_power', next).catch((e) => this.error('meter_power', e));
    }
  }

  protected async onTeardown(): Promise<void> {
    this.stopLiveReadings();
    if (this.attributionTimer) this.homey.clearInterval(this.attributionTimer);
    this.attributionTimer = null;
    this.lastTs = 0;
    this.lastReceiptTs = 0;
    await this.energyCheckpoint?.close();
  }

  private async refreshAttributionSettings(): Promise<void> {
    const generation = this.lifecycleGeneration;
    const mainSn = this.getReadSn();
    const units = (await collectStreamUnits(this.client)).filter((u) => u.mainSn === mainSn);
    if (this.isShuttingDown() || generation !== this.lifecycleGeneration || mainSn !== this.getReadSn()) return;
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
