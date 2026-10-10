'use strict';

import { BaseEcoFlowDevice, QuotaSampleContext } from '../../lib/BaseEcoFlowDevice';
import { METER_DETAIL_FRESH_MS, METER_FRESH_MS, SmartMeterTelemetry } from '../../lib/smartMeterTelemetry';
import { accumulateEnergy, splitGridPower } from '../../lib/smartMeterMapping';
import { toFiniteNumber } from '../../lib/quota';
import { EnergyCheckpoint } from '../../lib/EnergyCheckpoint';

/** Default titles for per-phase capabilities added dynamically. */
const DYNAMIC_TITLES: Record<string, string> = {
  'measure_power.l1': 'Power L1',
  'measure_power.l2': 'Power L2',
  'measure_power.l3': 'Power L3',
  'measure_voltage.l1': 'Voltage L1',
  'measure_voltage.l2': 'Voltage L2',
  'measure_voltage.l3': 'Voltage L3',
  'measure_current.l1': 'Current L1',
  'measure_current.l2': 'Current L2',
  'measure_current.l3': 'Current L3',
  power_factor: 'Power factor',
  'measure_power.home_load': 'Home load',
};

module.exports = class SmartMeterDevice extends BaseEcoFlowDevice {
  private meterSource: 'grid' | 'load' = 'grid';
  private importWh = 0;
  private exportWh = 0;
  private lastTs = 0;
  private pendingCaps = new Set<string>();
  private energyCheckpoint!: EnergyCheckpoint;
  private telemetry = new SmartMeterTelemetry();
  private detailTimer: NodeJS.Timeout | null = null;
  private powerSource: 'mqtt' | 'rest' | null = null;
  private lastLoadAt = 0;

  private static readonly LIVE_POWER_CAPS = [
    'measure_power',
    'smartmeter_power_grid',
    'smartmeter_power_import',
    'smartmeter_power_export',
  ];

  private static readonly LEGACY_LIVE_POWER_CAPS = [
    'measure_power.grid_import',
    'measure_power.grid_export',
  ];

  protected getReadSn(): string {
    // When the meter is part of a STREAM system its own SN is empty, so read the
    // resolved source SN (the system main) where powGetSysGrid/Load live.
    return (this.getStoreValue('sourceSn') as string) || this.getData().sn;
  }

  protected getRealtimeSn(): string {
    return this.getData().sn;
  }

  getMeterDiagnostics(): Record<string, unknown> {
    return this.telemetry.snapshot();
  }

  gridPowerAbove(direction: string, watts: number): boolean {
    const grid = this.telemetry.freshGrid();
    // Throw rather than false: an inverted stale condition must not pass.
    if (grid === null) throw new Error('Fresh grid power unavailable. Check the Smart Meter connection.');
    if (!['import', 'export'].includes(direction) || !Number.isFinite(watts) || watts < 0) throw new Error('Invalid grid threshold.');
    return (direction === 'import' ? grid : -grid) > watts;
  }

  protected async onReady(): Promise<void> {
    this.telemetry = new SmartMeterTelemetry();
    this.lastTs = 0;
    this.powerSource = null;
    this.lastLoadAt = 0;
    this.meterSource = (this.getSetting('meter_source') as 'grid' | 'load') || 'grid';
    this.importWh = (this.getStoreValue('importWh') as number) || 0;
    this.exportWh = (this.getStoreValue('exportWh') as number) || 0;
    this.energyCheckpoint = new EnergyCheckpoint(this.homey, async () => {
      await this.setStoreValue('importWh', this.importWh);
      await this.setStoreValue('exportWh', this.exportWh);
    });
    await this.ensureCapabilities(SmartMeterDevice.LIVE_POWER_CAPS);
    await this.removeCapabilities(SmartMeterDevice.LEGACY_LIVE_POWER_CAPS);
    await this.setCapabilityValue('meter_power.imported', this.importWh / 1000).catch(() => {});
    await this.setCapabilityValue('meter_power.exported', this.exportWh / 1000).catch(() => {});
    await this.applyMeterSourceTitle();
    this.detailTimer = this.homey.setInterval(() => {
      this.queueDeviceWork(async () => {
        for (const cap of this.telemetry.expired()) {
          if (this.hasCapability(cap)) await this.setCapabilityValue(cap, null).catch(() => {});
        }
        if (this.telemetry.freshGrid() === null) {
          for (const cap of SmartMeterDevice.LIVE_POWER_CAPS) {
            if (this.hasCapability(cap)) await this.setCapabilityValue(cap, null).catch(() => {});
          }
        }
        if (this.hasCapability('measure_power.home_load')
          && (this.lastLoadAt <= 0 || Date.now() < this.lastLoadAt || Date.now() - this.lastLoadAt > METER_DETAIL_FRESH_MS)) {
          await this.setCapabilityValue('measure_power.home_load', null).catch(() => {});
        }
      }).catch((e) => this.error('meter freshness', e));
    }, 30000);
  }

  async applyQuota(quota: Record<string, any>, context: QuotaSampleContext = { source: 'rest', receivedAt: Date.now() }): Promise<void> {
    if (!Number.isFinite(context.receivedAt) || context.receivedAt <= 0 || context.receivedAt > Date.now()
      || Date.now() - context.receivedAt > METER_DETAIL_FRESH_MS) return;
    const values = this.telemetry.observe(quota, context);

    const gridW = typeof values.measure_power === 'number' ? values.measure_power : undefined;
    const loadW = toFiniteNumber(quota.powGetSysLoad);
    // Homey Energy's native power and cumulative meters always describe grid.
    // The optional home-load capability is a separate installation reading.
    const power = gridW;
    if (this.meterSource === 'load' && context.source === 'rest' && loadW !== undefined && loadW >= 0
      && context.receivedAt >= this.lastLoadAt) {
      values['measure_power.home_load'] = loadW;
      this.lastLoadAt = context.receivedAt;
    }

    const split = splitGridPower(gridW);
    if (split) {
      if (this.getCapabilityValue('smartmeter_power_import') !== split.importW) {
        await this.setCapabilityValue('smartmeter_power_import', split.importW).catch(() => {});
      }
      if (this.getCapabilityValue('smartmeter_power_export') !== split.exportW) {
        await this.setCapabilityValue('smartmeter_power_export', split.exportW).catch(() => {});
      }
    }

    if (typeof power === 'number' && this.getCapabilityValue('smartmeter_power_grid') !== power) {
      await this.setCapabilityValue('smartmeter_power_grid', power).catch((e) => this.error('smartmeter_power_grid', e));
    }

    if (typeof power === 'number') {
      values['measure_power'] = power;
    }

    if (typeof gridW === 'number') {
      const now = context.receivedAt;
      // Switching sources anchors a new interval; never fill an unseen gap.
      if (this.powerSource !== context.source) this.lastTs = 0;
      this.powerSource = context.source;
      const dtMs = this.lastTs > 0 ? now - this.lastTs : 0;
      this.lastTs = now;
      if (dtMs > 0 && dtMs <= METER_FRESH_MS) {
        const next = accumulateEnergy({ importWh: this.importWh, exportWh: this.exportWh }, gridW, dtMs);
        if (next.importWh !== this.importWh || next.exportWh !== this.exportWh) {
          this.importWh = next.importWh;
          this.exportWh = next.exportWh;
          this.energyCheckpoint.mark();
          await this.setCapabilityValue('meter_power.imported', this.importWh / 1000).catch(() => {});
          await this.setCapabilityValue('meter_power.exported', this.exportWh / 1000).catch(() => {});
        }
      }
    }

    for (const [cap, value] of Object.entries(values)) {
      await this.ensureCapability(cap);
      if (this.getCapabilityValue(cap) === value) continue;
      await this.setCapabilityValue(cap, value).catch((e) => this.error(`setCapabilityValue ${cap}`, e));
    }
  }

  protected async onTeardown(): Promise<void> {
    if (this.detailTimer) this.homey.clearInterval(this.detailTimer);
    this.detailTimer = null;
    await this.energyCheckpoint?.flush();
  }

  protected async onSettingsChanged(newSettings: any, changedKeys: string[]): Promise<void> {
    if (changedKeys.includes('meter_source')) {
      this.meterSource = (newSettings.meter_source as 'grid' | 'load') || 'grid';
      await this.applyMeterSourceTitle();
      this.poll().catch((e) => this.error('poll failed', e));
    }
  }

  private async applyMeterSourceTitle(): Promise<void> {
    const title = { en: 'Grid power', de: 'Netzleistung', nl: 'Netvermogen' };
    await this.setCapabilityOptions('measure_power', { title }).catch(() => {});
    await this.setCapabilityOptions('smartmeter_power_grid', { title }).catch(() => {});
    if (this.meterSource !== 'load' && this.hasCapability('measure_power.home_load')) {
      this.lastLoadAt = 0;
      await this.setCapabilityValue('measure_power.home_load', null).catch(() => {});
    }
  }

  private async ensureCapabilities(caps: string[]): Promise<void> {
    for (const cap of caps) {
      if (!this.hasCapability(cap)) {
        await this.addCapability(cap).catch((e) => this.error(`add ${cap}`, e));
      }
    }
  }

  private async removeCapabilities(caps: string[]): Promise<void> {
    for (const cap of caps) {
      if (this.hasCapability(cap)) {
        await this.removeCapability(cap).catch((e) => this.error(`remove ${cap}`, e));
      }
    }
  }

  /** Add an optional (per-phase) capability the first time data for it arrives. */
  private async ensureCapability(cap: string): Promise<void> {
    if (this.hasCapability(cap) || this.pendingCaps.has(cap)) return;
    if (!(cap in DYNAMIC_TITLES)) return;
    this.pendingCaps.add(cap);
    try {
      await this.addCapability(cap);
      await this.setCapabilityOptions(cap, { title: { en: DYNAMIC_TITLES[cap] } });
    } catch (e) {
      this.error(`addCapability ${cap}`, e);
    } finally {
      this.pendingCaps.delete(cap);
    }
  }
};
