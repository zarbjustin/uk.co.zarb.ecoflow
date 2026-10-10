'use strict';

import Homey from 'homey';
import { StreamReporterObservations } from './streamReporterEvidence';
import { EcoFlowAppApi, getApp } from './appApi';
import { AppFrameHandler } from './EcoFlowAppMqtt';
import { clearSavedAppAuthCreds, hasSavedAppAuthCreds } from './appAuthPairing';
import {
  Stream5000CapabilityValues,
  Stream5000FrameDiagnostic,
  stream5000TelemetryAdapter,
  Stream5000TelemetryAdapter,
  Stream5000TopologyTracker,
} from './stream5000Adapters';
import { StreamTopologyEvidence } from './streamTopology';
import { STREAM_5000_DRIVER_IDS, stream5000ModelFromSn } from './stream5000Models';
import { stream5000PhysicalCapabilityValues } from './stream5000Roles';
import { EnergyAccountingDiagnostic, integrateTimedSignedPower, MAX_GAP_MS } from './energyIntegration';
import { EnergyCheckpoint } from './EnergyCheckpoint';
import { Stream5000ConfigurationTracker } from './stream5000Configuration';
import { Stream5000CapabilityCandidates } from './stream5000Capabilities';
import {
  STREAM_5000_CONFIGURATION_CAPABILITIES, STREAM_5000_LIVE_CAPABILITIES,
  Stream5000ReadingAges, stream5000ConfigurationValues,
} from './stream5000Readings';

/**
 * Shared monitoring lifecycle for verified STREAM 5000-family units.
 *
 * Read-only by design: this device subscribes to the app-auth MQTT feed and
 * never publishes. It also never polls the Developer/Open REST API: admitted
 * models require an app-auth telemetry adapter and remain read-only.
 *
 * Availability is therefore derived from the age of the last usable parsed
 * MQTT telemetry. Unknown frames alone cannot keep stale readings online, and
 * the unavailable state is applied at most once per transition.
 */

/** How often the data-age watchdog runs. */
const WATCHDOG_INTERVAL_MS = 60 * 1000;
/** Default age after which the device is reported unavailable. */
const DEFAULT_UNAVAILABLE_AFTER_MIN = 20;
/** Grace period after (re)start before a silent device is called unavailable. */
const STARTUP_GRACE_MS = 5 * 60 * 1000;
/** Retry cadence while the app-auth session cannot be established. */
const RESUBSCRIBE_INTERVAL_MS = 5 * 60 * 1000;
const DIAGNOSTIC_SUMMARY_EVERY_FRAMES = 100;
const MONITORING_ONLY_FALLBACK = 'Monitoring only · controls intentionally disabled';

const UNAVAILABLE_MESSAGE = 'No data from EcoFlow\'s app connection. Check the EcoFlow account in the app settings.';
const NOT_CONNECTED_MESSAGE = 'EcoFlow app connection unavailable — check or update your EcoFlow account in the app settings.';
const ENERGY_CAPABILITIES = ['meter_power.charged', 'meter_power.discharged'] as const;

export class Stream5000UnitDevice extends Homey.Device {
  private telemetryAdapter!: Stream5000TelemetryAdapter;
  private reporterObservations = new StreamReporterObservations();
  private frameHandler?: AppFrameHandler;
  private subscribedSn?: string;
  private realtimeApp?: EcoFlowAppApi;
  private lastFrameAt = 0;
  private lastTelemetryAt = 0;
  private startedAt = 0;
  private watchdog: NodeJS.Timeout | null = null;
  private resubscribeTimer: NodeJS.Timeout | null = null;
  private applyChain: Promise<void> = Promise.resolve();
  private lastValues: Stream5000CapabilityValues = {};
  private lastResubscribeAt = 0;
  private framesReceived = 0;
  private parsedFrames = 0;
  private unparsedFrames = 0;
  private bytesReceived = 0;
  private diagnosticCaptureNext = false;
  private subscriptionState: 'starting' | 'active' | 'waiting' | 'stopped' = 'starting';
  private subscriptionAttempts = 0;
  private resubscribeCount = 0;
  private sampleGate!: ReturnType<Stream5000TelemetryAdapter['createSampleGate']>;
  private readonly commandKeys = new Set<string>();
  private readonly commandStats = new Map<string, { frames: number; parsed: number; unparsed: number }>();
  private chargedWh = 0;
  private dischargedWh = 0;
  private lastEnergySampleAt = 0;
  private energyCheckpoint?: EnergyCheckpoint;
  private energySamples = 0;
  private ignoredEnergyGaps = 0;
  private topologyTracker?: Stream5000TopologyTracker;
  private configurationTracker?: Stream5000ConfigurationTracker;
  private readonly readingAges = new Stream5000ReadingAges();

  /** Aggregate devices contribute to Homey Energy; physical monitors override this. */
  protected isEnergyAggregate(): boolean {
    return true;
  }

  protected monitoringOnlyMessageKey(): string {
    return 'device.stream_5000_system.monitoring_only';
  }

  /** Translate protocol capabilities into the public capabilities for this device role. */
  protected capabilityValuesForRole(values: Stream5000CapabilityValues): Stream5000CapabilityValues {
    return values;
  }

  async onInit(): Promise<void> {
    this.reporterObservations = new StreamReporterObservations();
    this.subscriptionState = 'starting';
    this.startedAt = Date.now();
    this.diagnosticCaptureNext = Boolean(this.getSetting('diagnostic_capture_next'));
    const sn = this.getData().sn as string;
    const model = stream5000ModelFromSn(sn);
    if (!model) {
      await this.setUnavailable('This STREAM 5000-family model has not been verified by this app.');
      this.error(`Unsupported STREAM 5000 serial prefix: ${(sn || '').slice(0, 4) || 'missing'}`);
      return;
    }
    this.telemetryAdapter = stream5000TelemetryAdapter(model);
    this.configurationTracker = new Stream5000ConfigurationTracker(sn);
    this.topologyTracker = this.telemetryAdapter.createTopologyTracker(sn);
    const mapTelemetry = this.telemetryAdapter.createMapper(sn, this.isEnergyAggregate() ? 'system' : 'unit');
    this.sampleGate = this.telemetryAdapter.createSampleGate();
    if (this.isEnergyAggregate()) {
      this.chargedWh = this.storedEnergyWh('chargedWh');
      this.dischargedWh = this.storedEnergyWh('dischargedWh');
      this.energyCheckpoint = new EnergyCheckpoint(this.homey, () => this.persistEnergy());
      await this.initialiseEnergyCapabilities();
    } else {
      await this.initialisePhysicalUnitCapabilities();
    }
    for (const capability of Object.values(STREAM_5000_CONFIGURATION_CAPABILITIES)) {
      if (this.isStopped()) return;
      if (!this.hasCapability(capability)) {
        // eslint-disable-next-line no-await-in-loop
        await this.addCapability(capability);
      }
      // Clear persisted observations until this session actually reports them.
      // eslint-disable-next-line no-await-in-loop
      await this.setCapabilityValue(capability, null);
    }
    for (const capability of STREAM_5000_LIVE_CAPABILITIES) {
      if (this.isStopped()) return;
      if (this.hasCapability(capability)) {
        // eslint-disable-next-line no-await-in-loop
        await this.setCapabilityValue(capability, null);
      }
    }
    if (this.isStopped()) return;
    const messageKey = this.monitoringOnlyMessageKey();
    const localizedStatus = this.homey.__(messageKey);

    await this.setSettings({
      model: model.name,
      serial_number: sn,
      experimental_notice: localizedStatus && localizedStatus !== messageKey
        ? localizedStatus
        : MONITORING_ONLY_FALLBACK,
    }).catch(() => {});
    if (this.isStopped()) return;

    this.frameHandler = (payload, topic) => {
      if (this.subscriptionState === 'stopped') return;
      this.framesReceived += 1;
      this.bytesReceived += payload.length;
      this.lastFrameAt = Date.now();
      this.configurationTracker?.observe(payload, this.lastFrameAt);
      this.queueConfiguration().catch((e) => this.error('apply configuration observations', e?.message || e));
      const telemetry = this.telemetryAdapter.parse(payload, sn);
      const diagnostic = this.telemetryAdapter.describe(payload, sn, telemetry ? 0 : undefined);
      if (!telemetry) {
        this.unparsedFrames += 1;
        this.recordCommands(diagnostic, false);
        this.captureUnparsedFrame(diagnostic, topic);
        this.maybeLogDiagnosticSummary(topic);
        return;
      }
      this.parsedFrames += 1;
      const receivedAt = Date.now();
      if (!this.isEnergyAggregate()) {
        this.queueAccessories(this.telemetryAdapter.accessories(telemetry, sn), receivedAt)
          .catch((e) => this.error('apply accessory readings', e?.message || e));
      }
      this.topologyTracker?.observe(telemetry, receivedAt);
      this.reporterObservations.observe(telemetry, sn, receivedAt);
      const values = mapTelemetry(telemetry);
      const roleValues = this.capabilityValuesForRole(values);
      const usable = Object.entries(roleValues).some(([capability, value]) => value !== null && this.hasCapability(capability));
      if (usable) this.lastTelemetryAt = receivedAt;
      Object.assign(this.lastValues, values);
      this.recordCommands(diagnostic, true);
      this.captureRequestedSnapshot(diagnostic, topic);
      this.maybeLogDiagnosticSummary(topic);
      if (Object.keys(roleValues).some((capability) => this.hasCapability(capability))) {
        this.queueTelemetry(values, receivedAt, usable).catch((e) => this.error('apply telemetry', e?.message || e));
      }
    };

    await this.subscribe();
    if (this.isStopped()) return;
    this.watchdog = this.homey.setInterval(() => {
      this.checkAvailability().catch((e) => this.error('availability check', e?.message || e));
    }, WATCHDOG_INTERVAL_MS);

    this.log(`${model.name} ${sn.slice(0, 4)}… initialised (monitoring only)`);
  }

  private async subscribe(): Promise<void> {
    if (this.isStopped()) return;
    const sn = this.getData().sn as string;
    let subscribed = false;
    this.subscriptionState = 'starting';
    this.subscriptionAttempts += 1;
    const handler = this.frameHandler!;
    let app: EcoFlowAppApi | undefined;
    try {
      app = getApp(this.homey);
      this.realtimeApp = app;
      subscribed = await app.subscribeAppRealtime(sn, handler);
    } catch (e: any) {
      if (this.isStopped()) return;
      this.error('app-auth subscribe failed', e?.message || 'unknown error');
    }
    if (this.isStopped()) {
      if (subscribed) app?.unsubscribeAppRealtime(sn, handler);
      return;
    }
    if (subscribed) {
      this.subscribedSn = sn;
      this.subscriptionState = 'active';
      this.log(`[diag] ${this.telemetryAdapter.diagnosticLabel} subscription state=active attempts=${this.subscriptionAttempts} reconnects=${this.resubscribeCount}`);
      if (this.resubscribeTimer) {
        this.homey.clearInterval(this.resubscribeTimer);
        this.resubscribeTimer = null;
      }
      return;
    }
    this.subscriptionState = 'waiting';
    await this.setOffline(NOT_CONNECTED_MESSAGE);
    if (this.isStopped()) return;
    if (!this.resubscribeTimer) {
      this.resubscribeTimer = this.homey.setInterval(() => {
        if (this.subscribedSn) return;
        this.subscribe().catch((e) => this.error('resubscribe', e?.message || e));
      }, RESUBSCRIBE_INTERVAL_MS);
    }
  }

  private isStopped(): boolean {
    return this.subscriptionState === 'stopped';
  }

  private queueTelemetry(values: Stream5000CapabilityValues, receivedAt: number, usable: boolean): Promise<void> {
    const run = async () => {
      if (this.isStopped()) return;
      await this.applyTelemetry(values, receivedAt);
      if (usable) await this.setOnline();
    };
    this.applyChain = this.applyChain.then(run, run);
    return this.applyChain;
  }

  private async applyTelemetry(values: Stream5000CapabilityValues, receivedAt: number): Promise<void> {
    if (this.isStopped()) return;
    const roleValues = this.capabilityValuesForRole(values);
    this.readingAges.observe(Object.fromEntries(Object.entries(roleValues).filter(([key]) => this.hasCapability(key))), receivedAt);
    for (const [capability, value] of Object.entries(roleValues)) {
      if (!this.hasCapability(capability)) continue;
      if (this.lastValues[capability] === value && this.getCapabilityValue(capability) === value) continue;
      this.lastValues[capability] = value;
      await this.setCapabilityValue(capability, value).catch((e) => this.error(capability, e));
    }
    const batteryPowerW = values.measure_power;
    if (this.isEnergyAggregate() && typeof batteryPowerW === 'number') {
      await this.updateEnergy(batteryPowerW, receivedAt);
    }
  }

  private queueConfiguration(): Promise<void> {
    const run = async () => {
      if (this.isStopped()) return;
      const values = stream5000ConfigurationValues(this.configurationTracker?.snapshot());
      for (const [capability, value] of Object.entries(values)) {
        if (this.isStopped()) return;
        if (this.hasCapability(capability) && this.getCapabilityValue(capability) !== value) {
          // eslint-disable-next-line no-await-in-loop
          await this.setCapabilityValue(capability, value);
        }
      }
    };
    this.applyChain = this.applyChain.then(run, run);
    return this.applyChain;
  }

  /** Observed accessories only, physical monitor only, no solar/grid kWh source. */
  private queueAccessories(candidates: Stream5000CapabilityCandidates, receivedAt: number): Promise<void> {
    const values: Stream5000CapabilityValues = {};
    if (candidates.acSocketW !== undefined) values.stream_5000_socket_power = candidates.acSocketW;
    if (candidates.directPv?.totalW !== undefined) values.stream_5000_direct_pv = candidates.directPv.totalW;
    for (const index of [1, 2, 3, 4] as const) {
      const value = candidates.directPv?.[`string${index}W`];
      if (value !== undefined) values[`stream_unit_power_pv${index}`] = value;
    }
    // Inferred solarNodeW deliberately stays out of production meters/tiles.
    const run = async () => {
      if (this.isStopped()) return;
      for (const [capability, value] of Object.entries(values)) {
        if (this.isStopped()) return;
        if (!this.hasCapability(capability)) {
          if (value === 0) continue; // Zero alone does not establish that an accessory is installed.
          // eslint-disable-next-line no-await-in-loop
          await this.addCapability(capability);
        }
        // eslint-disable-next-line no-await-in-loop
        if (this.getCapabilityValue(capability) !== value) await this.setCapabilityValue(capability, value);
      }
      this.readingAges.observe(Object.fromEntries(Object.entries(values).filter(([key]) => this.hasCapability(key))), receivedAt);
    };
    this.applyChain = this.applyChain.then(run, run);
    return this.applyChain;
  }

  getReadingDiagnostics(): Record<string, unknown> {
    return this.readingAges.snapshot(Date.now(), this.unavailableAfterMs());
  }

  getSystemReporterDiagnostics(): Record<string, unknown> {
    return this.reporterObservations.snapshot(Date.now());
  }

  getConnectionDiagnostics(): Record<string, unknown> {
    const now = Date.now();
    const age = (at: number) => (at > 0 && at <= now ? Math.floor((now - at) / 1000) : null);
    return {
      subscriptionState: this.subscriptionState, // Registered subscription, not proof the remote socket is alive.
      frameAgeSec: age(this.lastFrameAt),
      telemetryAgeSec: age(this.lastTelemetryAt),
      subscriptionAttempts: this.subscriptionAttempts,
      reconnectCount: this.resubscribeCount,
    };
  }

  /** Missing/stale configuration throws: returning false would pass an inverted Flow. */
  async configurationModeIs(mode: string): Promise<boolean> {
    if (!['self_powered', 'intelligent_plus', 'custom'].includes(mode)) throw new Error('Invalid STREAM mode');
    const observed = stream5000ConfigurationValues(this.configurationTracker?.snapshot()).stream_5000_mode;
    if (observed === null) throw new Error('Fresh STREAM operating mode is unavailable');
    return observed === mode;
  }

  async configurationReserveEnabled(): Promise<boolean> {
    const snapshot = this.configurationTracker?.snapshot() as any;
    const entry = snapshot?.values?.backupReserveEnabled;
    if (entry?.stale !== false || typeof entry.value !== 'boolean') throw new Error('Fresh STREAM backup reserve state is unavailable');
    return entry.value;
  }

  private storedEnergyWh(key: string): number {
    const value = this.getStoreValue(key);
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
  }

  /** Add the meters defensively so devices paired with an older manifest migrate in place. */
  private async initialiseEnergyCapabilities(): Promise<void> {
    for (const capability of ENERGY_CAPABILITIES) {
      if (!this.hasCapability(capability)) {
        await this.addCapability(capability).catch((e) => this.error(`add ${capability}`, e));
      }
    }
    if (this.hasCapability('meter_power.charged')) {
      await this.setCapabilityValue('meter_power.charged', this.chargedWh / 1000).catch(() => {});
    }
    if (this.hasCapability('meter_power.discharged')) {
      await this.setCapabilityValue('meter_power.discharged', this.dischargedWh / 1000).catch(() => {});
    }
  }

  /** Keep all standard Energy capabilities off optional physical-unit monitors. */
  private async initialisePhysicalUnitCapabilities(): Promise<void> {
    if (!this.hasCapability('stream_unit_power_battery_flow')) {
      await this.addCapability('stream_unit_power_battery_flow')
        .catch((e) => this.error('add stream_unit_power_battery_flow', e));
    }
    for (const capability of ['measure_power', ...ENERGY_CAPABILITIES]) {
      if (this.hasCapability(capability)) {
        // eslint-disable-next-line no-await-in-loop
        await this.removeCapability(capability).catch((e) => this.error(`remove ${capability}`, e));
      }
    }
  }

  private async updateEnergy(batteryPowerW: number, sampleAt: number): Promise<void> {
    this.energySamples += 1;
    if (this.lastEnergySampleAt > 0
      && sampleAt - this.lastEnergySampleAt > Math.min(MAX_GAP_MS, this.unavailableAfterMs())) {
      this.ignoredEnergyGaps += 1;
      this.lastEnergySampleAt = 0; // Re-anchor, never backfill power that was already considered stale.
    }
    const next = integrateTimedSignedPower({
      posWh: this.chargedWh,
      negWh: this.dischargedWh,
      lastSampleAt: this.lastEnergySampleAt,
    }, batteryPowerW, sampleAt);
    this.lastEnergySampleAt = next.lastSampleAt;
    if (next.posWh === this.chargedWh && next.negWh === this.dischargedWh) return;
    this.chargedWh = next.posWh;
    this.dischargedWh = next.negWh;
    this.energyCheckpoint?.mark();
    if (this.hasCapability('meter_power.charged')) {
      await this.setCapabilityValue('meter_power.charged', this.chargedWh / 1000).catch(() => {});
    }
    if (this.hasCapability('meter_power.discharged')) {
      await this.setCapabilityValue('meter_power.discharged', this.dischargedWh / 1000).catch(() => {});
    }
  }

  private async persistEnergy(): Promise<void> {
    const { chargedWh } = this;
    const { dischargedWh } = this;
    await this.setStoreValue('chargedWh', chargedWh);
    await this.setStoreValue('dischargedWh', dischargedWh);
  }

  /** Private session evidence; supportSnapshot projects it without identifiers. */
  getTopologyEvidence(): StreamTopologyEvidence | null {
    return this.topologyTracker?.evidence() ?? null;
  }

  getConfigurationDiagnostics(): Record<string, unknown> | null {
    return this.configurationTracker?.snapshot() ?? null;
  }

  getEnergyDiagnostics(): EnergyAccountingDiagnostic | null {
    if (!this.isEnergyAggregate()) return null;
    return {
      source: this.lastEnergySampleAt > 0 ? 'integrated_power' : 'waiting',
      samples: this.energySamples,
      skippedSamples: 0,
      ignoredGaps: this.ignoredEnergyGaps,
      counterResets: 0,
      chargedCounterSeen: false,
      dischargedCounterSeen: false,
      lastSampleAgeSec: this.lastEnergySampleAt > 0 ? Math.max(0, Math.round((Date.now() - this.lastEnergySampleAt) / 1000)) : null,
      chargedKWh: this.chargedWh / 1000,
      dischargedKWh: this.dischargedWh / 1000,
      checkpoint: this.energyCheckpoint?.diagnostics(),
    };
  }

  private recordCommands(diagnostic: Stream5000FrameDiagnostic, parsed: boolean): void {
    const commands = diagnostic.commands.length > 0 ? diagnostic.commands : ['none'];
    for (const command of commands) {
      this.commandKeys.add(command);
      const current = this.commandStats.get(command) || { frames: 0, parsed: 0, unparsed: 0 };
      current.frames += 1;
      if (parsed) current.parsed += 1;
      else current.unparsed += 1;
      this.commandStats.set(command, current);
    }
  }

  private captureUnparsedFrame(diagnostic: Stream5000FrameDiagnostic, topic: string): void {
    const shape = this.telemetryAdapter.frameShape(diagnostic);
    if (!this.sampleGate.shouldCapture(diagnostic)) return;
    this.log(
      `[diag] ${this.telemetryAdapter.diagnosticLabel} unparsed frame shape=${shape} topic=${this.telemetryAdapter.topicKind(topic)} bytes=${diagnostic.bytes} `
          + `sha256=${diagnostic.sha256} commands=${diagnostic.commands.join(',') || 'none'} `
          + `truncated=${diagnostic.truncated} sample=${diagnostic.sampleBase64}`,
    );
  }

  private captureRequestedSnapshot(diagnostic: Stream5000FrameDiagnostic, topic: string): void {
    const command = this.telemetryAdapter.requestedSnapshotCommand;
    if (!this.diagnosticCaptureNext || !command || !diagnostic.commands.includes(command)) return;
    this.diagnosticCaptureNext = false;
    this.log(
      `[diag] ${this.telemetryAdapter.diagnosticLabel} requested snapshot topic=${this.telemetryAdapter.topicKind(topic)} `
      + `values=${this.telemetryAdapter.formatSnapshot(this.lastValues)} configuration=${JSON.stringify(this.getConfigurationDiagnostics())}`,
    );
    this.setSettings({ diagnostic_capture_next: false }).catch(() => {});
  }

  private maybeLogDiagnosticSummary(topic: string): void {
    if (this.framesReceived !== 1 && this.framesReceived % DIAGNOSTIC_SUMMARY_EVERY_FRAMES !== 0) return;
    const now = Date.now();
    const frameAgeSec = this.lastFrameAt > 0 ? Math.round((now - this.lastFrameAt) / 1000) : -1;
    const telemetryAgeSec = this.lastTelemetryAt > 0 ? Math.round((now - this.lastTelemetryAt) / 1000) : -1;
    const commandStats = [...this.commandStats.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([command, count]) => `${command}:${count.frames}/${count.parsed}/${count.unparsed}`)
      .join(',') || 'none';
    this.log(
      `[diag] ${this.telemetryAdapter.diagnosticLabel} telemetry frames=${this.framesReceived} parsed=${this.parsedFrames} `
      + `unparsed=${this.unparsedFrames} bytes=${this.bytesReceived} topic=${this.telemetryAdapter.topicKind(topic)} `
      + `subscription=${this.subscriptionState} frame_age_s=${frameAgeSec} telemetry_age_s=${telemetryAgeSec} `
      + `command_frames=${commandStats} values=${this.telemetryAdapter.formatSnapshot(this.lastValues)}`,
    );
  }

  private async checkAvailability(): Promise<void> {
    await this.queueConfiguration();
    const expire = async () => {
      if (this.isStopped()) return;
      for (const capability of this.readingAges.expired(Date.now(), this.unavailableAfterMs())) {
        if (this.hasCapability(capability) && this.getCapabilityValue(capability) !== null) {
          // eslint-disable-next-line no-await-in-loop
          await this.setCapabilityValue(capability, null);
          this.lastValues[capability] = null;
        }
      }
    };
    this.applyChain = this.applyChain.then(expire, expire);
    await this.applyChain;
    if (this.isStopped()) return;
    const limitMs = this.unavailableAfterMs();
    const reference = this.lastTelemetryAt || this.startedAt;
    const age = Date.now() - reference;
    if (this.lastTelemetryAt === 0 && Date.now() - this.startedAt < STARTUP_GRACE_MS) return;
    if (age <= limitMs) return;
    await this.setOffline(UNAVAILABLE_MESSAGE);
    // A subscribed-but-silent device usually means the WSS session died or the
    // stored account changed. Rebuild the subscription (which rebuilds the
    // session with fresh credentials) rather than staying silently stale.
    if (Date.now() - this.lastResubscribeAt < RESUBSCRIBE_INTERVAL_MS) return;
    this.lastResubscribeAt = Date.now();
    await this.resubscribe();
  }

  private async resubscribe(): Promise<void> {
    if (this.isStopped()) return;
    this.resubscribeCount += 1;
    if (this.subscribedSn && this.frameHandler) {
      this.realtimeApp?.unsubscribeAppRealtime(this.subscribedSn, this.frameHandler);
      this.subscribedSn = undefined;
    }
    await this.subscribe();
  }

  async onSettings({ newSettings, changedKeys }: { newSettings: any; changedKeys: string[] }): Promise<void> {
    if (!changedKeys.includes('diagnostic_capture_next')) return;
    this.diagnosticCaptureNext = Boolean(newSettings.diagnostic_capture_next);
    if (this.diagnosticCaptureNext && this.telemetryAdapter) {
      this.log(`[diag] ${this.telemetryAdapter.diagnosticLabel} next telemetry snapshot requested`);
    }
  }

  private unavailableAfterMs(): number {
    const minutes = Number(this.getSetting('unavailable_after')) || DEFAULT_UNAVAILABLE_AFTER_MIN;
    return Math.max(5, Math.min(240, minutes)) * 60 * 1000;
  }

  /** Only transitions are applied, so a quiet device is not repeatedly flagged. */
  private async setOnline(): Promise<void> {
    if (this.getAvailable()) return;
    await this.setAvailable().catch(() => {});
  }

  private async setOffline(message: string): Promise<void> {
    if (!this.getAvailable()) return;
    await this.setUnavailable(message).catch(() => {});
  }

  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- SDK types deletion void; teardown must await saved energy.
  async onDeleted(): Promise<void> {
    await this.teardown();
    // Removing the final app-connected STREAM 5000-family device removes the
    // stored EcoFlow account with it. Both current and deprecated drivers are
    // checked so deleting one cannot break devices paired through the other.
    if (!this.hasOtherFamilyDevices() && hasSavedAppAuthCreds(this.homey)) {
      clearSavedAppAuthCreds(this.homey);
      this.log('Last STREAM 5000-family unit removed — stored EcoFlow account cleared');
    }
  }

  async onUninit(): Promise<void> {
    await this.teardown();
  }

  private async teardown(): Promise<void> {
    this.subscriptionState = 'stopped';
    if (this.framesReceived > 0) {
      this.log(
        `[diag] ${this.telemetryAdapter.diagnosticLabel} session summary frames=${this.framesReceived} parsed=${this.parsedFrames} `
        + `unparsed=${this.unparsedFrames} bytes=${this.bytesReceived} `
        + `commands=${[...this.commandKeys].sort().join(',') || 'none'} `
        + `values=${this.telemetryAdapter.formatSnapshot(this.lastValues)}`,
      );
    }
    if (this.subscribedSn && this.frameHandler) {
      this.realtimeApp?.unsubscribeAppRealtime(this.subscribedSn, this.frameHandler);
      this.subscribedSn = undefined;
    }
    if (this.watchdog) {
      this.homey.clearInterval(this.watchdog);
      this.watchdog = null;
    }
    if (this.resubscribeTimer) {
      this.homey.clearInterval(this.resubscribeTimer);
      this.resubscribeTimer = null;
    }
    await this.applyChain.catch(() => {});
    await this.energyCheckpoint?.flush();
  }

  private hasOtherFamilyDevices(): boolean {
    for (const driverId of STREAM_5000_DRIVER_IDS) {
      try {
        const driver = (this.homey.drivers as any).getDriver(driverId);
        const devices = typeof driver?.getDevices === 'function' ? driver.getDevices() : [];
        if (devices.some((device: any) => {
          if (device === this) return false;
          return Boolean(device.getData?.().sn);
        })) return true;
      } catch {
        // A driver may be absent in a development build. Continue with the
        // remaining family drivers instead of retaining credentials forever.
      }
    }
    return false;
  }
}

/**
 * A physical STREAM 5000-family monitor. Battery power stays available to the
 * user and Insights through a custom capability. It deliberately exposes no
 * standard Homey Energy power or cumulative meters; the STREAM Home Battery
 * aggregate is the installation's single Energy source.
 */
export class Stream5000PhysicalUnitDevice extends Stream5000UnitDevice {
  protected isEnergyAggregate(): boolean {
    return false;
  }

  protected monitoringOnlyMessageKey(): string {
    return 'device.stream_5000_unit.monitoring_only';
  }

  protected capabilityValuesForRole(values: Stream5000CapabilityValues): Stream5000CapabilityValues {
    return stream5000PhysicalCapabilityValues(values);
  }
}
