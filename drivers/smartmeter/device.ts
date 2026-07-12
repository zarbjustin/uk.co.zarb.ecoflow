'use strict';

import { BaseEcoFlowDevice } from '../../lib/BaseEcoFlowDevice';
import { mapSmartMeterQuota, accumulateEnergy, splitGridPower } from '../../lib/smartMeterMapping';
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
};

module.exports = class SmartMeterDevice extends BaseEcoFlowDevice {
  private meterSource: 'grid' | 'load' = 'grid';
  private importWh = 0;
  private exportWh = 0;
  private lastTs = 0;
  private pendingCaps = new Set<string>();
  private energyCheckpoint!: EnergyCheckpoint;

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

  protected async onReady(): Promise<void> {
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
  }

  async applyQuota(quota: Record<string, any>): Promise<void> {
    const values = mapSmartMeterQuota(quota);

    const gridW = toFiniteNumber(quota.powGetSysGrid) ?? toFiniteNumber(quota.gridConnectionPower);
    const loadW = toFiniteNumber(quota.powGetSysLoad);
    // The live tile shows either grid power or home load; the cumulative meters
    // ALWAYS track grid import/export, so switching the display mode can never
    // corrupt the (monotonic) energy totals.
    const power = this.meterSource === 'load' ? loadW : gridW;

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
      const now = Date.now();
      const dtMs = this.lastTs > 0 ? now - this.lastTs : 0;
      this.lastTs = now;
      if (dtMs > 0) {
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
    const title = this.meterSource === 'load' ? 'Home load' : 'Grid power';
    await this.setCapabilityOptions('measure_power', { title: { en: title } }).catch(() => {});
    await this.setCapabilityOptions('smartmeter_power_grid', { title: { en: title } }).catch(() => {});
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
