'use strict';

import { BaseEcoFlowDevice, QuotaSampleContext } from '../../lib/BaseEcoFlowDevice';
import { mapStreamQuota } from '../../lib/streamMapping';
import { streamModelFromSn, streamAcOutletCount } from '../../lib/streamModels';
import { OperatingMode } from '../../lib/streamProtocol';
import { executeStreamControl, readStreamControlState, StreamControlIntent } from '../../lib/streamControls';
import { EcoFlowAppApi, getApp } from '../../lib/appApi';
import { AppFrameHandler } from '../../lib/EcoFlowAppMqtt';
import { BK_PV_CAPS, BkPvReceipts, decodeBkPvDiagnostics } from '../../lib/streamBkPvDiagnostics';
import { migrateReadingTitle, STREAM_UNIT_GRID_TITLE } from '../../lib/streamReadingScopes';
import { StreamUnitComparison } from '../../lib/streamDiagnosticChecks';
import { decodeStreamLimits, StreamLimitObservations } from '../../lib/streamLimitDiagnostics';
import { decodeBkBatteryPower } from '../../lib/streamBkBatteryTelemetry';

type ControlWait = () => void;

/**
 * A single physical STREAM inverter/battery unit. The device is tailored to its
 * exact model and its role in the system (detected from the serial number):
 *
 *  - Units show their own reported battery, health, temperature and grid-port
 *    readings. Socket controls are tailored to the documented model matrix.
 *    Aggregate battery power is not substituted for missing per-unit power.
 *  - Solar models (e.g. STREAM Ultra X) show their PV inputs; AC-coupled models
 *    (e.g. STREAM AC Pro) drop the solar tiles they can never report.
 *  - The system MAIN unit additionally exposes the whole-home controls and
 *    flow tiles (operating mode, backup reserve, charge/discharge limits, grid
 *    feed-in, house consumption and the house power split) — these are
 *    system-wide and read 0 on member units, so they are hidden there.
 *
 * Per-unit telemetry (soc/f32ShowSoc, soh, cycles, temp) arrives over MQTT; the
 * REST snapshot only carries the unit's grid feed and relay state.
 */
module.exports = class StreamUnitDevice extends BaseEcoFlowDevice {
  private mainSn = '';
  private unitComparison = new StreamUnitComparison();
  private controlGeneration = 0;
  private readonly controlWaits = new Map<NodeJS.Timeout, ControlWait>();
  private pvReceipts = new BkPvReceipts();
  private pvTimer: NodeJS.Timeout | null = null;
  private pvApp?: EcoFlowAppApi;
  private pvHandler?: AppFrameHandler;
  private pvSn = '';
  private pvChain: Promise<void> = Promise.resolve();
  private limitObservations = new StreamLimitObservations();

  getLimitDiagnostics(): Record<string, unknown> {
    return this.limitObservations.snapshot();
  }

  getReadingDiagnostics(): Record<string, unknown> {
    return { ...this.pvReceipts.snapshot(Date.now()), ...this.getRemainingTimeFreshness(), ...this.getLiveReadingFreshness() };
  }

  private async startPvDiagnostics(sn: string): Promise<void> {
    const generation = this.controlGeneration;
    const active = () => generation === this.controlGeneration && !this.isShuttingDown();
    this.pvReceipts = new BkPvReceipts();
    this.limitObservations = new StreamLimitObservations();
    for (const cap of BK_PV_CAPS) {
      if (!active()) return;
      if (this.hasCapability(cap)) {
        const port = cap.includes('pv3') ? 3 : 4;
        if (!/^(BK11|BK12|BK61)/i.test(sn) || port > streamModelFromSn(sn).solarInputs) {
          await this.removeCapability(cap);
        } else await this.setCapabilityValue(cap, null);
      }
    }
    if (!active() || !/^(BK11|BK12|BK31|BK41|BK51|BK61)[A-Z0-9]+$/i.test(sn)) return;
    const expire = async () => {
      for (const cap of this.pvReceipts.expired(Date.now())) {
        if (!active()) return;
        if (this.hasCapability(cap)) await this.setCapabilityValue(cap, null);
        this.pvReceipts.forget(cap);
      }
    };
    let app: EcoFlowAppApi;
    try {
      app = getApp(this.homey);
    } catch {
      return;
    }
    if (!app?.subscribeAppRealtime) return;
    const handler: AppFrameHandler = (payload, topic) => {
      if (!active() || !(topic === `/app/device/property/${sn}`
        || (/^\/app\/[^/]+\/[^/]+\/thing\/property\/get_reply$/.test(topic)
          && topic.split('/')[3] === sn))) return;
      const at = Date.now();
      const values = decodeBkPvDiagnostics(payload, sn);
      // Cached get replies are not evidence of a fresh limit observation.
      const limits = topic === `/app/device/property/${sn}` ? decodeStreamLimits(payload, sn) : {};
      const batteryPower = topic === `/app/device/property/${sn}` ? decodeBkBatteryPower(payload, sn) : undefined;
      this.pvChain = this.pvChain.then(async () => {
        if (!active()) return;
        this.limitObservations.observe(limits, at, 'app_property');
        if (batteryPower !== undefined) {
          await this.queueDeviceWork(async () => {
            if (!active()) return;
            const applied = await this.applyLiveReading('stream_unit_power_battery_flow', batteryPower, at);
            if (!active()) return;
            if (applied) {
              // Positive charging, negative discharging; DC pack power, not AC grid watts.
              let state = 'idle';
              if (batteryPower > 5) state = 'charging';
              if (batteryPower < -5) state = 'discharging';
              await this.applyLiveReading('battery_charging_state', state, at);
              await this.applyRemainingTimePower(batteryPower, at);
            } else {
              await this.applyLiveReading('battery_charging_state', null, at);
              await this.applyRemainingTimePower(null, at);
            }
          });
        }
        for (const [cap, value] of Object.entries(values)) {
          if (!active() || !this.pvReceipts.observe(cap, at, Date.now())) continue;
          if (!this.hasCapability(cap)) await this.addCapability(cap);
          if (!active()) return;
          await this.setCapabilityValue(cap, value);
        }
        await expire();
      }).catch(() => { /* Optional diagnostics must not disrupt the official quota path. */ });
    };
    this.pvApp = app; this.pvSn = sn; this.pvHandler = handler;
    let subscribed = false;
    try {
      subscribed = await app.subscribeAppRealtime(sn, handler);
    } catch { /* REST-only remains usable. */ }
    if (!active() || !subscribed) {
      app.unsubscribeAppRealtime(sn, handler);
      if (this.pvHandler === handler) this.pvHandler = undefined;
      return;
    }
    this.pvTimer = this.homey.setInterval(() => {
      this.pvChain = this.pvChain.then(expire).catch(() => {});
    }, 60000);
  }

  /** Whole-home controls + flow tiles, meaningful only on the system main unit. */
  private static readonly SYSTEM_CAPS = [
    'operating_mode',
    'backup_reserve_soc',
    'charge_limit',
    'discharge_limit',
    'feed_in_control',
    'measure_power.load',
    'stream_unit_power_from_solar',
    'stream_unit_power_from_battery',
    'stream_unit_power_from_grid',
  ];

  private static readonly LEGACY_SYSTEM_CAPS = [
    'measure_power.from_pv',
    'measure_power.from_battery',
    'measure_power.from_grid',
  ];

  /** Candidate socket tiles, filtered by the model's supported outlet count. */
  private static readonly AC_CAPS = [
    'onoff.ac1',
    'onoff.ac2',
    'stream_unit_power_ac1',
    'stream_unit_power_ac2',
  ];

  private static readonly LEGACY_AC_POWER_CAPS = [
    'measure_power.schuko1',
    'measure_power.schuko2',
  ];

  private static readonly POWER_CAP_MAP: Record<string, string> = {
    'measure_power.pv': 'stream_unit_power_solar',
    'measure_power.pv1': 'stream_unit_power_pv1',
    'measure_power.pv2': 'stream_unit_power_pv2',
    'measure_power.pv3': 'stream_unit_power_pv3',
    'measure_power.pv4': 'stream_unit_power_pv4',
    'measure_power.schuko1': 'stream_unit_power_ac1',
    'measure_power.schuko2': 'stream_unit_power_ac2',
    'measure_power.from_pv': 'stream_unit_power_from_solar',
    'measure_power.from_battery': 'stream_unit_power_from_battery',
    'measure_power.from_grid': 'stream_unit_power_from_grid',
    measure_power: 'stream_unit_power_battery_flow',
    'measure_power.grid': 'stream_unit_power_grid',
  };

  protected async onReady(): Promise<void> {
    this.unitComparison = new StreamUnitComparison();
    this.controlGeneration += 1;
    await this.startRemainingTime('unit');
    const sn = this.getData().sn as string;
    const spec = streamModelFromSn(sn);
    this.mainSn = (this.getStoreValue('mainSn') as string) || sn;
    let roleResolved = !!this.getStoreValue('mainSn');
    try {
      if (this.mainSn === sn) {
        this.mainSn = await this.client.getMainSn(sn);
        roleResolved = true;
      }
    } catch (e) {
      this.mainSn = '';
      roleResolved = false;
      this.error('resolve main SN', e);
    }
    const isMain = roleResolved && this.mainSn === sn;

    // Base per-unit capabilities every unit should have.
    const outlets = streamAcOutletCount(sn);
    const acCaps = StreamUnitDevice.AC_CAPS.filter((cap) => (cap.endsWith('1') ? outlets >= 1 : outlets >= 2));
    await this.ensureCapabilities(['battery_charging_state', 'stream_unit_power_battery_flow', 'stream_unit_power_grid', ...acCaps]);
    await migrateReadingTitle(this, 'stream_unit_power_grid', STREAM_UNIT_GRID_TITLE, () => !this.isShuttingDown());
    await this.removeCapabilities(StreamUnitDevice.AC_CAPS.filter((cap) => !acCaps.includes(cap)));
    // Previous versions could copy aggregate battery power/state onto a unit.
    // Clear persisted values; only a fresh, paired BMS charge/discharge packet
    // may restore them. The aggregate and grid-port paths never populate them.
    await this.setCapabilityValue('stream_unit_power_battery_flow', null);
    await this.setCapabilityValue('battery_charging_state', null);
    await this.removeCapabilities(['measure_power', 'measure_power.grid', 'meter_power.charged', 'meter_power.discharged']);
    await this.removeCapabilities(StreamUnitDevice.LEGACY_AC_POWER_CAPS);

    // Solar tiles: solar models keep their PV inputs; AC-coupled models drop them.
    await this.tailorSolarCapabilities(spec.acCoupled ? 0 : spec.solarInputs);

    // Whole-home controls/tiles only on the system main unit.
    if (isMain) await this.ensureCapabilities(StreamUnitDevice.SYSTEM_CAPS);
    else await this.removeCapabilities(StreamUnitDevice.SYSTEM_CAPS);
    await this.removeCapabilities(StreamUnitDevice.LEGACY_SYSTEM_CAPS);
    await this.startLiveReadings('unit');

    this.registerControlListeners(isMain);
    await this.refreshInfoSettings(sn, isMain, roleResolved).catch((e) => this.error('refresh info settings', e));
    await this.startPvDiagnostics(sn).catch(() => {});
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

  /** Ensure solar generation + PV1..N; remove any beyond N and legacy tiles. */
  private async tailorSolarCapabilities(solarInputs: number): Promise<void> {
    if (solarInputs > 0) {
      await this.ensureCapabilities(['stream_unit_power_solar']);
    } else if (this.hasCapability('stream_unit_power_solar')) {
      await this.removeCapability('stream_unit_power_solar').catch((e) => this.error('remove stream_unit_power_solar', e));
    }
    if (this.hasCapability('measure_power.pv')) {
      await this.removeCapability('measure_power.pv').catch((e) => this.error('remove measure_power.pv', e));
    }
    for (let i = 1; i <= 4; i += 1) {
      const cap = `stream_unit_power_pv${i}`;
      const legacyCap = `measure_power.pv${i}`;
      if (i <= solarInputs) {
        await this.ensureCapabilities([cap]);
      } else if (this.hasCapability(cap)) {
        await this.removeCapability(cap).catch((e) => this.error(`remove ${cap}`, e));
      }
      if (this.hasCapability(legacyCap)) {
        await this.removeCapability(legacyCap).catch((e) => this.error(`remove ${legacyCap}`, e));
      }
    }
  }

  /**
   * Wire the controls. AC outputs switch the unit's OWN relays (per-unit); the
   * whole-home controls target the system main SN and are only present on the
   * main unit.
   */
  private registerControlListeners(isMain: boolean): void {
    if (this.hasCapability('onoff.ac1')) {
      this.registerCapabilityListener('onoff.ac1', async (v: boolean) => this.runControl({ kind: 'ac1', value: v }));
    }
    if (this.hasCapability('onoff.ac2')) {
      this.registerCapabilityListener('onoff.ac2', async (v: boolean) => this.runControl({ kind: 'ac2', value: v }));
    }
    if (!isMain) return;
    this.registerCapabilityListener('operating_mode', async (v: OperatingMode) => this.runControl({ kind: 'mode', value: v }));
    this.registerCapabilityListener('backup_reserve_soc', async (v: number) => this.runControl({ kind: 'reserve', value: v }));
    this.registerCapabilityListener('charge_limit', async (v: number) => this.runControl({ kind: 'charge', value: v }));
    this.registerCapabilityListener('discharge_limit', async (v: number) => this.runControl({ kind: 'discharge', value: v }));
    this.registerCapabilityListener('feed_in_control', async (v: boolean) => this.runControl({ kind: 'feed', value: v }));
  }

  /** Use the same fresh, serialized readback gate as the installation device. */
  private async runControl(intent: StreamControlIntent): Promise<void> {
    const socket = intent.kind === 'ac1' || intent.kind === 'ac2';
    if (socket && streamAcOutletCount(this.getReadSn()) < (intent.kind === 'ac1' ? 1 : 2)) {
      throw new Error('This STREAM model does not support that AC socket.');
    }
    const target = socket ? this.getReadSn() : this.mainSn;
    const generation = this.controlGeneration;
    const active = () => !this.isShuttingDown() && generation === this.controlGeneration
      && target === (socket ? this.getReadSn() : this.mainSn);
    await executeStreamControl(target, intent, {
      active,
      read: async () => readStreamControlState(await this.readControlQuota(
        target, socket ? [intent.kind === 'ac1' ? 'relay2Onoff' : 'relay3Onoff'] : undefined,
      )),
      write: (payload) => this.writeQuota(payload),
      wait: () => new Promise((resolve) => {
        const timer = this.homey.setTimeout(() => {
          this.controlWaits.delete(timer);
          resolve();
        }, 1500);
        this.controlWaits.set(timer, resolve);
      }),
      observed: async (state) => {
        for (const [key, value] of Object.entries(state)) {
          if (!active()) return;
          if (this.hasCapability(key)) await this.setCapabilityValue(key, value);
        }
      },
    });
  }

  protected async onTeardown(): Promise<void> {
    this.stopLiveReadings();
    this.stopRemainingTime();
    this.controlGeneration += 1;
    if (this.pvTimer) this.homey.clearInterval(this.pvTimer);
    this.pvTimer = null;
    if (this.pvHandler) this.pvApp?.unsubscribeAppRealtime(this.pvSn, this.pvHandler);
    this.pvHandler = undefined;
    await this.pvChain;
    this.pvReceipts = new BkPvReceipts();
    this.limitObservations = new StreamLimitObservations();
    this.unitComparison = new StreamUnitComparison();
    for (const [timer, resolve] of this.controlWaits) {
      this.homey.clearTimeout(timer);
      resolve();
    }
    this.controlWaits.clear();
  }

  /** Populate the read-only model/serial/role settings shown on the device page. */
  private async refreshInfoSettings(sn: string, isMain: boolean, roleResolved: boolean): Promise<void> {
    const spec = streamModelFromSn(sn);
    await this.setSettings({
      model: spec.model,
      serial_number: sn,
      // eslint-disable-next-line no-nested-ternary
      system_role: roleResolved ? (isMain ? 'System main unit' : 'Member unit') : 'Role unavailable — check connection',
      power_source: spec.energySource,
      ac_output: spec.acOutput,
    }).catch((e) => this.error('set info settings', e));
  }

  protected getReadSn(): string {
    return this.getData().sn;
  }

  protected handlesStatus(): boolean {
    return true;
  }

  async applyQuota(quota: Record<string, any>, context?: QuotaSampleContext): Promise<void> {
    this.limitObservations.observe(quota, context?.receivedAt ?? Date.now(), 'developer_quota');
    await this.applyRemainingTime(quota, context);
    const values = mapStreamQuota(quota, 'unit');
    delete values.charge_remaining;
    delete values.discharge_remaining;
    for (const [source, target] of Object.entries(StreamUnitDevice.POWER_CAP_MAP)) {
      const value = values[source];
      if (value !== undefined) values[target] = value;
      delete values[source];
    }
    // Self-heating is reported only by some firmwares; add the tile on demand so
    // it never shows blank on units that don't report it.
    if (values.self_heating !== undefined && !this.hasCapability('self_heating')) {
      await this.addCapability('self_heating').catch((e) => this.error('add self_heating', e));
    }
    for (const [cap, value] of Object.entries(values)) {
      if (!this.hasCapability(cap)) continue;
      try {
        if (this.isLiveReading(cap)) {
          const applied = await this.applyLiveReading(cap, value, context?.receivedAt ?? Date.now());
          if (!applied) {
            this.unitComparison.failed(cap); continue;
          }
        } else
          if (this.getCapabilityValue(cap) !== value) await this.setCapabilityValue(cap, value);
        this.unitComparison.observe(cap, value, context?.receivedAt ?? Date.now());
      } catch (e) {
        this.unitComparison.failed(cap);
        this.error(`setCapabilityValue ${cap}`, e);
      }
    }
    await this.expireLiveReadings();
  }

  getUnitCorrelationDiagnostics(): Record<string, unknown> {
    const readings = this.unitComparison.snapshot(Date.now());
    for (const [key, cap] of [['socPct', 'measure_battery'], ['gridPortW', 'stream_unit_power_grid']]) {
      if (readings[key] && this.getCapabilityValue(cap) !== readings[key].value) delete readings[key];
    }
    return readings;
  }
};
