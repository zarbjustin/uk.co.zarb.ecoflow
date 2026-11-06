'use strict';

import { BaseEcoFlowDevice, QuotaSampleContext } from '../../lib/BaseEcoFlowDevice';
import { METER_DETAIL_FRESH_MS, METER_FRESH_MS, SmartMeterTelemetry } from '../../lib/smartMeterTelemetry';
import { accumulateEnergy, splitGridPower } from '../../lib/smartMeterMapping';
import { toFiniteNumber } from '../../lib/quota';
import { EnergyCheckpoint } from '../../lib/EnergyCheckpoint';
import { migrateReadingTitle } from '../../lib/streamReadingScopes';

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
  private detailPending = false;
  private powerSource: 'mqtt' | 'rest' | null = null;
  private lastLoadAt = 0;
  private accountingReadOnly = false;

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
    return { ...this.telemetry.snapshot(), accountingStatus: this.accountingReadOnly ? 'read_only_unrecoverable_history' : 'active' };
  }

  gridPowerAbove(direction: string, watts: number): boolean {
    const grid = this.telemetry.freshGrid();
    // Throw rather than false: an inverted stale condition must not pass.
    if (grid === null) throw new Error('Fresh grid power unavailable. Check the Smart Meter connection.');
    if (!['import', 'export'].includes(direction) || !Number.isFinite(watts) || watts < 0) throw new Error('Invalid grid threshold.');
    return (direction === 'import' ? grid : -grid) > watts;
  }

  private restoreEnergyWh(storeKey: string, capability: string): number | null {
    const saved = this.getStoreValue(storeKey);
    const projected = this.getCapabilityValue(capability);
    // Unknown formats are not a new counter; preserve them even if a projection
    // exists. Malformed primitive history is recoverable only from a valid floor.
    if (saved !== null && typeof saved === 'object') return null;
    const savedWh = typeof saved === 'number' && Number.isFinite(saved) && saved >= 0 ? saved : null;
    const projectedWh = typeof projected === 'number' && Number.isFinite(projected)
      && projected >= 0 && Number.isFinite(projected * 1000) ? projected * 1000 : null;
    if (projected != null && projectedWh === null) return null;
    if (saved != null && savedWh === null && projectedWh === null) return null;
    if (savedWh !== null && projected === Math.round(savedWh) / 1000) return savedWh;
    return Math.max(savedWh ?? 0, projectedWh ?? 0);
  }

  protected async onReady(): Promise<void> {
    this.telemetry = new SmartMeterTelemetry();
    this.lastTs = 0;
    this.powerSource = null;
    this.lastLoadAt = 0;
    this.meterSource = (this.getSetting('meter_source') as 'grid' | 'load') || 'grid';
    const imported = this.restoreEnergyWh('importWh', 'meter_power.imported');
    const exported = this.restoreEnergyWh('exportWh', 'meter_power.exported');
    this.accountingReadOnly = imported === null || exported === null;
    this.importWh = imported ?? 0;
    this.exportWh = exported ?? 0;
    this.energyCheckpoint = new EnergyCheckpoint(this.homey, async () => {
      if (this.accountingReadOnly) return;
      await this.setStoreValue('importWh', this.importWh);
      await this.setStoreValue('exportWh', this.exportWh);
    });
    // An interrupted update can leave the coalesced store behind Homey's
    // already-published total. Persist the recovered floor without downtime fill.
    if (!this.accountingReadOnly && ((this.importWh > 0 && this.importWh !== this.getStoreValue('importWh'))
      || (this.exportWh > 0 && this.exportWh !== this.getStoreValue('exportWh')))) this.energyCheckpoint.mark();
    await this.ensureCapabilities(SmartMeterDevice.LIVE_POWER_CAPS);
    await this.removeCapabilities(SmartMeterDevice.LEGACY_LIVE_POWER_CAPS);
    if (!this.accountingReadOnly) {
      await this.projectEnergyCapabilities();
    }
    await this.applyMeterSourceTitle();
    this.detailTimer = this.homey.setInterval(() => {
      if (this.detailPending) return;
      this.detailPending = true;
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
      }).finally(() => {
        this.detailPending = false;
      }).catch((e) => this.error('meter freshness', e));
    }, 30000);
  }

  async applyQuota(quota: Record<string, any>, context: QuotaSampleContext = { source: 'rest', receivedAt: Date.now() }): Promise<void> {
    if (context.accountingDiscontinuity) this.lastTs = 0;
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
      if (!this.accountingReadOnly && dtMs > 0 && dtMs <= METER_FRESH_MS) {
        const next = accumulateEnergy({ importWh: this.importWh, exportWh: this.exportWh }, gridW, dtMs);
        if (next.importWh !== this.importWh || next.exportWh !== this.exportWh) {
          this.importWh = next.importWh;
          this.exportWh = next.exportWh;
          this.energyCheckpoint.mark();
          await this.projectEnergyCapabilities();
        }
      }
    }

    for (const [cap, value] of Object.entries(values)) {
      await this.ensureCapability(cap);
      if (this.getCapabilityValue(cap) === value) continue;
      await this.setCapabilityValue(cap, value).catch((e) => this.error(`setCapabilityValue ${cap}`, e));
    }
  }

  private async projectEnergyCapabilities(): Promise<void> {
    for (const [cap, wh] of [['meter_power.imported', this.importWh], ['meter_power.exported', this.exportWh]] as const) {
      const current = this.getCapabilityValue(cap);
      if (typeof current === 'number' && Number.isFinite(current) && current >= wh / 1000) continue;
      await this.setCapabilityValue(cap, wh / 1000).catch(() => {});
    }
  }

  protected async onTeardown(): Promise<void> {
    if (this.detailTimer) this.homey.clearInterval(this.detailTimer);
    this.detailTimer = null;
    await this.energyCheckpoint?.close();
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
    await migrateReadingTitle(this, 'measure_power', title);
    await migrateReadingTitle(this, 'smartmeter_power_grid', title);
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
