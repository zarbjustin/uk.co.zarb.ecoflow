'use strict';

import Homey from 'homey';
import { StreamReporterObservations, StreamOwnUnitObservations } from './streamReporterEvidence';
import type { Es22Telemetry } from './streamAc5000Protocol';
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
import { stream5000ModelFromSn } from './stream5000Models';
import { hasOtherAppAuthDevices } from './appAuthConsumers';
import { stream5000PhysicalCapabilityValues } from './stream5000Roles';
import { EnergyAccountingDiagnostic, integrateTimedSignedPower, MAX_GAP_MS } from './energyIntegration';
import { EnergyCheckpoint } from './EnergyCheckpoint';
import { Stream5000ConfigurationTracker } from './stream5000Configuration';
import { Stream5000CapabilityCandidates } from './stream5000Capabilities';
import { Stream5000TimeObserver } from './stream5000TimeObserver';
import type { Stream5000OfficialSocSample } from './stream5000OfficialSoc';
import { Stream5000BatteryPresentation, STREAM_5000_PRESENTATION_CAPABILITY } from './stream5000BatteryPresentation';
import { migrateReadingTitle, STREAM_5000_UNIT_TITLES, STREAM_5000_CONFIGURATION_TITLES } from './streamReadingScopes';
import {
  STREAM_5000_CONFIGURATION_CAPABILITIES, STREAM_5000_LIVE_CAPABILITIES,
  Stream5000ReadingAges, stream5000ConfigurationValues, stream5000ReadingLimitMs,
} from './stream5000Readings';

/**
 * Shared monitoring lifecycle for verified STREAM 5000-family units.
 *
 * Read-only by design: this device subscribes to the app-auth MQTT feed and
 * never publishes. Installation SOC alone can use a read-only public API fallback
 * when app telemetry has no usable percentage and Developer credentials exist.
 * This is latest cloud-report evidence, not a device measurement timestamp.
 *
 * Availability is therefore derived from the age of the last usable parsed
 * MQTT telemetry. Unknown frames alone cannot keep stale readings online, and
 * the unavailable state is applied at most once per transition.
 */

/** How often the data-age watchdog runs. */
const WATCHDOG_INTERVAL_MS = 60 * 1000;
/** Local physical-tile expiry only; never poll EcoFlow or accelerate reconnects. */
const READING_EXPIRY_INTERVAL_MS = 5 * 1000;
/** Default age after which the device is reported unavailable. */
const DEFAULT_UNAVAILABLE_AFTER_MIN = 20;
/** Grace period after (re)start before a silent device is called unavailable. */
const STARTUP_GRACE_MS = 5 * 60 * 1000;
/** Retry cadence while the app-auth session cannot be established. */
const RESUBSCRIBE_INTERVAL_MS = 5 * 60 * 1000;
const DIAGNOSTIC_SUMMARY_EVERY_FRAMES = 100;
const MONITORING_ONLY_FALLBACK = 'Monitoring only · controls intentionally disabled';

const UNAVAILABLE_MESSAGE = 'Waiting for fresh EcoFlow readings. Missing readings are not zero; energy totals are retained.';
const NOT_CONNECTED_MESSAGE = 'EcoFlow connection unavailable. Retrying automatically; your paired device and energy totals are retained.';
const APPLICATION_FAILED_MESSAGE = 'Fresh EcoFlow readings could not be applied in Homey. Check the integration report.';
const ENERGY_CAPABILITIES = ['meter_power.charged', 'meter_power.discharged'] as const;

type ReadingWork = 'telemetry' | 'accessories';
type DeviceWork = ReadingWork | 'configuration' | 'expiry' | 'reset';
type WorkTask = () => Promise<void>;
type PendingReading = { value: number | string | null; receivedAt: number; observed: boolean; usable: boolean };
type ReadingBatch = {
  generation: number;
  readings: Record<string, PendingReading>;
  powerInterrupted: boolean;
};

export class Stream5000UnitDevice extends Homey.Device {
  private telemetryAdapter!: Stream5000TelemetryAdapter;
  private mapTelemetry!: ReturnType<Stream5000TelemetryAdapter['createMapper']>;
  private reporterObservations = new StreamReporterObservations();
  private ownUnitObservations = new StreamOwnUnitObservations();
  private frameHandler?: AppFrameHandler;
  private subscribedSn?: string;
  private realtimeApp?: EcoFlowAppApi;
  private lastFrameAt = 0;
  private lastTelemetryAt = 0;
  private startedAt = 0;
  private watchdog: NodeJS.Timeout | null = null;
  private readingExpiryTimer: NodeJS.Timeout | null = null;
  private readingExpiryPending = false;
  private availabilityPending = false;
  private resubscribeTimer: NodeJS.Timeout | null = null;
  private applyChain: Promise<void> = Promise.resolve();
  private workRunning = false;
  private readonly pendingWork = new Map<DeviceWork, WorkTask>();
  private readonly pendingReadings = new Map<ReadingWork, ReadingBatch>();
  private lastValues: Stream5000CapabilityValues = {};
  private lastResubscribeAt = 0;
  private framesReceived = 0;
  private parsedFrames = 0;
  private unparsedFrames = 0;
  private bytesReceived = 0;
  private diagnosticCaptureNext = false;
  private subscriptionState: 'starting' | 'active' | 'waiting' | 'stopped' = 'starting';
  private subscriptionAttempts = 0;
  private subscriptionInFlight: Promise<void> | null = null;
  private resubscribeCount = 0;
  private sampleGate!: ReturnType<Stream5000TelemetryAdapter['createSampleGate']>;
  private readonly commandKeys = new Set<string>();
  private readonly commandStats = new Map<string, { frames: number; parsed: number; unparsed: number }>();
  private chargedWh = 0;
  private dischargedWh = 0;
  private energyReadOnly = false;
  private lastEnergySampleAt = 0;
  private energyCheckpoint?: EnergyCheckpoint;
  private energySamples = 0;
  private skippedEnergySamples = 0;
  private ignoredEnergyGaps = 0;
  private topologyTracker?: Stream5000TopologyTracker;
  private configurationTracker?: Stream5000ConfigurationTracker;
  private timeObserver?: Stream5000TimeObserver;
  private readonly readingAges = new Stream5000ReadingAges();
  private readonly configurationWriteFailures = new Set<string>();
  private batteryPresentation = new Stream5000BatteryPresentation();
  private linkedPowerWarning = false;
  private lastOfflineMessage = '';
  private officialSocAbort?: AbortController;
  private officialSocLastAttempt = 0;
  private officialSocEvidence: Stream5000OfficialSocSample | null = null;
  private deliveryEpoch?: number;
  private deliveryGeneration = 0;

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
    this.ownUnitObservations = new StreamOwnUnitObservations();
    this.subscriptionState = 'starting';
    this.deliveryEpoch = undefined;
    this.deliveryGeneration += 1;
    this.batteryPresentation.reset();
    this.startedAt = Date.now();
    this.officialSocLastAttempt = 0;
    this.officialSocEvidence = null;
    this.diagnosticCaptureNext = Boolean(this.getSetting('diagnostic_capture_next'));
    const sn = this.getData().sn as string;
    const model = stream5000ModelFromSn(sn);
    if (!model) {
      await this.setUnavailable('This STREAM 5000-family model has not been verified by this app.');
      this.error(`Unsupported STREAM 5000 serial prefix: ${(sn || '').slice(0, 4) || 'missing'}`);
      return;
    }
    this.telemetryAdapter = stream5000TelemetryAdapter(model);
    // Disabled default and no start/settings/API path. Reuse this subscription
    // only; preparing research must never open another account connection.
    this.timeObserver = new Stream5000TimeObserver(sn);
    this.configurationTracker = new Stream5000ConfigurationTracker(sn);
    this.topologyTracker = this.telemetryAdapter.createTopologyTracker(sn);
    this.mapTelemetry = this.telemetryAdapter.createMapper(sn, this.isEnergyAggregate() ? 'system' : 'unit');
    this.sampleGate = this.telemetryAdapter.createSampleGate();
    if (this.isEnergyAggregate()) {
      const charged = this.storedEnergyWh('chargedWh');
      const discharged = this.storedEnergyWh('dischargedWh');
      this.energyReadOnly = charged === undefined || discharged === undefined;
      this.chargedWh = charged ?? 0;
      this.dischargedWh = discharged ?? 0;
      if (this.energyReadOnly) this.error('STREAM 5000 energy history requires reconciliation; preserving existing counters and stores.');
      this.energyCheckpoint = new EnergyCheckpoint(this.homey, () => this.persistEnergy());
      await this.initialiseEnergyCapabilities();
      // Homey may have projected a newer total than the coalesced checkpoint.
      // Keep that floor across upgrades/recovery; never reset existing history.
      if (!this.energyReadOnly && ((this.chargedWh > 0 && this.chargedWh !== this.getStoreValue('chargedWh'))
        || (this.dischargedWh > 0 && this.dischargedWh !== this.getStoreValue('dischargedWh')))) this.energyCheckpoint.mark();
    } else {
      await this.initialisePhysicalUnitCapabilities();
      try {
        if (!this.hasCapability(STREAM_5000_PRESENTATION_CAPABILITY)) await this.addCapability(STREAM_5000_PRESENTATION_CAPABILITY);
        await this.setCapabilityValue(STREAM_5000_PRESENTATION_CAPABILITY, 'waiting');
      } catch (e) {
        this.error('initialise battery reading status', e);
        if (this.hasCapability(STREAM_5000_PRESENTATION_CAPABILITY)) {
          await this.setCapabilityValue(STREAM_5000_PRESENTATION_CAPABILITY, null).catch(() => {});
        }
      }
      for (const [capability, titles] of Object.entries(STREAM_5000_UNIT_TITLES)) {
        if (this.isStopped()) return;
        if (!this.hasCapability(capability)) continue;
        // This is an in-place default-title migration, not a re-pair or custom-title reset.
        // eslint-disable-next-line no-await-in-loop
        await migrateReadingTitle(this, capability, titles, () => !this.isStopped());
      }
    }
    for (const capability of Object.values(STREAM_5000_CONFIGURATION_CAPABILITIES)) {
      if (this.isStopped()) return;
      if (!this.hasCapability(capability)) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await this.addCapability(capability);
        } catch (e) {
          // An optional read-only tile must not make an existing device lose
          // its telemetry subscription during an in-place upgrade.
          this.error(`add configuration ${capability}`, e);
          continue;
        }
      }
      if (STREAM_5000_CONFIGURATION_TITLES[capability]) {
        // Cosmetic, known-default-only migration. A custom title/read failure
        // must not lose devices or prevent their telemetry subscription.
        // eslint-disable-next-line no-await-in-loop
        await migrateReadingTitle(this, capability, STREAM_5000_CONFIGURATION_TITLES[capability], () => !this.isStopped());
      }
      // Clear persisted observations until this session actually reports them.
      // eslint-disable-next-line no-await-in-loop
      await this.setCapabilityValue(capability, null).then(() => {
        this.configurationWriteFailures.delete(capability);
      }).catch((e) => {
        this.configurationWriteFailures.add(capability);
        this.error(`configuration ${capability}`, e);
      });
    }
    for (const capability of STREAM_5000_LIVE_CAPABILITIES) {
      if (this.isStopped()) return;
      if (this.hasCapability(capability)) {
        // eslint-disable-next-line no-await-in-loop
        await this.setCapabilityValue(capability, null).catch((e) => {
          this.readingAges.failed(capability);
          this.error(capability, e);
        });
      }
    }
    if (this.hasApplicationFailures()) await this.setOffline(this.applicationFailedMessage());
    if (this.isStopped()) return;
    const messageKey = this.monitoringOnlyMessageKey();
    const localizedStatus = this.homey.__(messageKey);

    await this.setSettings({
      model: model.name,
      serial_number: sn,
      experimental_notice: localizedStatus && localizedStatus !== messageKey
        ? localizedStatus
        : MONITORING_ONLY_FALLBACK,
      ...(!this.isEnergyAggregate() ? { reading_scope: this.homey.__('device.stream_5000_unit.reading_scope') } : {}),
    }).catch(() => {});
    if (this.isStopped()) return;

    this.frameHandler = (payload, topic, delivery) => {
      if (this.subscriptionState === 'stopped') return;
      if (!delivery) return;
      const { receivedAt } = delivery;
      if (delivery) {
        if (delivery.retained !== false || delivery.duplicate !== false
          || !Number.isFinite(receivedAt) || receivedAt <= 0 || receivedAt > Date.now()
          || !Number.isFinite(delivery.receivedMonoMs) || delivery.receivedMonoMs < 0) return;
        const epoch = delivery.connectionEpoch;
        if (epoch !== undefined) {
          if (!Number.isSafeInteger(epoch) || epoch <= 0
            || (this.deliveryEpoch !== undefined && epoch < this.deliveryEpoch)) return;
          if (this.deliveryEpoch !== undefined && epoch !== this.deliveryEpoch) {
            // Enqueue only: per-packet reactions would grow behind a stalled SDK write.
            this.applyChain = this.resetDeliverySession();
          }
          this.deliveryEpoch = epoch;
        }
      }
      this.framesReceived += 1;
      this.bytesReceived += payload.length;
      this.lastFrameAt = receivedAt;
      try {
        this.timeObserver?.observe(payload, topic);
      } catch { /* Optional research cannot interrupt production telemetry or log private bytes. */ }
      this.configurationTracker?.observe(payload, this.lastFrameAt);
      this.applyChain = this.queueConfiguration();
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
      if (!this.isEnergyAggregate()) {
        this.applyChain = this.queueAccessories(this.telemetryAdapter.accessories(telemetry, sn), receivedAt);
      }
      this.topologyTracker?.observe(telemetry, receivedAt);
      this.reporterObservations.observe(telemetry, sn, receivedAt);
      this.ownUnitObservations.observe(telemetry as Es22Telemetry, sn, receivedAt);
      const values = this.mapTelemetry(telemetry);
      const roleValues = this.capabilityValuesForRole(values);
      const usable = Object.entries(roleValues).some(([capability, value]) => value !== null && this.hasCapability(capability));
      if (usable) this.lastTelemetryAt = receivedAt;
      Object.assign(this.lastValues, values);
      this.recordCommands(diagnostic, true);
      this.captureRequestedSnapshot(diagnostic, topic);
      this.maybeLogDiagnosticSummary(topic);
      if (Object.keys(roleValues).some((capability) => this.hasCapability(capability))) {
        this.applyChain = this.queueTelemetry(values, receivedAt, usable);
      }
    };

    await this.subscribe();
    if (this.isStopped()) return;
    this.refreshOfficialSystemSoc().catch(() => {});
    this.watchdog = this.homey.setInterval(() => {
      this.refreshOfficialSystemSoc().catch(() => {});
      if (this.isStopped() || this.availabilityPending) return;
      this.availabilityPending = true;
      this.checkAvailability().catch((e) => this.error('availability check', e?.message || e))
        .finally(() => {
          this.availabilityPending = false;
        });
    }, WATCHDOG_INTERVAL_MS);
    if (!this.isEnergyAggregate()) {
      this.readingExpiryTimer = this.homey.setInterval(() => {
        // Coalesce slow SDK writes instead of building an unbounded timer queue.
        if (this.isStopped() || this.readingExpiryPending) return;
        this.readingExpiryPending = true;
        this.queueReadingExpiry().catch((e) => this.error('reading expiry', e?.message || e))
          .finally(() => {
            this.readingExpiryPending = false;
          });
      }, READING_EXPIRY_INTERVAL_MS);
    }

    this.log(`${model.name} ${sn.slice(0, 4)}… initialised (monitoring only)`);
  }

  private async subscribe(): Promise<void> {
    if (this.subscriptionInFlight) {
      await this.subscriptionInFlight;
      return;
    }
    const pending = this.subscribeOnce();
    this.subscriptionInFlight = pending;
    try {
      await pending;
    } finally {
      if (this.subscriptionInFlight === pending) this.subscriptionInFlight = null;
    }
  }

  private async subscribeOnce(): Promise<void> {
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
    return this.queueReadingBatch('telemetry', this.capabilityValuesForRole(values), receivedAt, usable);
  }

  /** One running SDK operation and one pending task per kind, not one closure per packet. */
  private queueWork(kind: DeviceWork, run: () => Promise<void>): Promise<void> {
    if (this.isStopped()) return this.applyChain;
    this.pendingWork.set(kind, run);
    if (this.workRunning) return this.applyChain;
    this.workRunning = true;
    const drain = async () => {
      try {
        while (this.pendingWork.size > 0 && !this.isStopped()) {
          const [nextKind, nextRun] = this.pendingWork.entries().next().value!;
          this.pendingWork.delete(nextKind);
          // eslint-disable-next-line no-await-in-loop
          await nextRun().catch((e) => this.error(`apply ${nextKind}`, e?.message || e));
        }
      } finally {
        this.workRunning = false;
      }
    };
    this.applyChain = this.applyChain.then(drain, drain);
    return this.applyChain;
  }

  private queueReadingBatch(
    kind: ReadingWork, values: Stream5000CapabilityValues, receivedAt: number, usable = false,
  ): Promise<void> {
    if (this.isStopped()) return this.applyChain;
    const now = Date.now();
    const batch = this.pendingReadings.get(kind) ?? {
      generation: this.deliveryGeneration, readings: {}, powerInterrupted: false,
    };
    let accepted = false;
    for (const [capability, value] of Object.entries(values)) {
      if (!this.readingAges.canApply(capability, receivedAt, now, this.unavailableAfterMs())) continue;
      const previous = batch.readings[capability];
      if (previous && previous.receivedAt <= now && previous.receivedAt > receivedAt) continue;
      if (capability === 'measure_power' && previous) batch.powerInterrupted = true;
      batch.readings[capability] = {
        value,
        receivedAt,
        observed: value !== 0 || Boolean(previous?.observed),
        usable: usable && value !== null && this.hasCapability(capability),
      };
      accepted = true;
    }
    if (!accepted) return this.applyChain;
    this.pendingReadings.set(kind, batch);
    return this.queueWork(kind, async () => {
      this.pendingReadings.delete(kind);
      if (this.isStopped() || batch.generation !== this.deliveryGeneration) return;
      if (kind === 'accessories') {
        await this.applyAccessories(batch);
        return;
      }
      // Coalesced power intervals are unknown. Retain totals and anchor only
      // at the final accepted receipt, never integrate across discarded samples.
      if (batch.powerInterrupted) this.lastEnergySampleAt = 0;
      const groups = new Map<number, Stream5000CapabilityValues>();
      for (const [capability, reading] of Object.entries(batch.readings)) {
        const group = groups.get(reading.receivedAt) ?? {};
        group[capability] = reading.value;
        groups.set(reading.receivedAt, group);
      }
      let applied = true;
      for (const [at, group] of [...groups].sort(([a], [b]) => a - b)) {
        if (this.isStopped() || batch.generation !== this.deliveryGeneration) return;
        // eslint-disable-next-line no-await-in-loop
        applied = await this.applyTelemetry(group, at) && applied;
      }
      if (this.isStopped() || batch.generation !== this.deliveryGeneration) return;
      if (this.hasApplicationFailures()) await this.setOffline(this.applicationFailedMessage());
      else if (applied && Object.values(batch.readings).some((reading) => reading.usable)) await this.setOnline();
      await this.updateBatteryPresentation();
    });
  }

  private async applyTelemetry(values: Stream5000CapabilityValues, receivedAt: number): Promise<boolean> {
    if (this.isStopped()) return false;
    const generation = this.deliveryGeneration;
    const roleValues = this.capabilityValuesForRole(values);
    const powerEligible = this.isEnergyAggregate() && Object.prototype.hasOwnProperty.call(values, 'measure_power')
      && this.readingAges.canApply('measure_power', receivedAt, Date.now(), this.unavailableAfterMs());
    if (!this.isEnergyAggregate() && roleValues.stream_unit_power_battery_flow === null && values.battery_charging_state === null
      && !this.linkedPowerWarning) {
      this.linkedPowerWarning = true;
      const key = 'device.stream_5000_unit.linked_power_unverified';
      const translated = this.homey.__(key);
      await this.setWarning(translated && translated !== key ? translated
        : 'Linked installation: individual battery power and direction are not verified. Use Home Battery for combined readings.')
        .catch(() => {
          this.linkedPowerWarning = false;
        });
    }
    let applied = true;
    const appliedValues: Record<string, unknown> = {};
    for (const [capability, value] of Object.entries(roleValues)) {
      if (generation !== this.deliveryGeneration) return false;
      if (!this.hasCapability(capability)) continue;
      // eslint-disable-next-line no-await-in-loop
      const success = await this.applyLiveReading(capability, value, receivedAt);
      if (success) {
        appliedValues[capability] = value;
        if (capability === 'measure_battery') this.officialSocEvidence = null;
      }
      applied = success && applied;
    }
    if (generation !== this.deliveryGeneration) return false;
    if (!this.isEnergyAggregate()) {
      if (applied) this.batteryPresentation.observe(appliedValues, receivedAt, Date.now());
      else this.batteryPresentation.reset();
    }
    const batteryPowerW = values.measure_power;
    if (this.isEnergyAggregate() && Object.prototype.hasOwnProperty.call(values, 'measure_power')) {
      // Account only successfully applied, still-fresh battery power. Rejected
      // old/future packets must not move the accepted anchor. An eligible missing
      // or failed power reading breaks continuity rather than filling recovery.
      if (powerEligible && typeof batteryPowerW === 'number' && Number.isFinite(batteryPowerW)
        && appliedValues.measure_power === batteryPowerW
        && this.readingAges.canApply('measure_power', receivedAt, Date.now(), this.unavailableAfterMs())) {
        await this.updateEnergy(batteryPowerW, receivedAt);
      } else {
        this.skippedEnergySamples += 1;
        if (powerEligible) this.lastEnergySampleAt = 0;
      }
    }
    return applied;
  }

  private async applyLiveReading(capability: string, value: number | string | null, receivedAt: number): Promise<boolean> {
    if (this.isStopped() || !this.readingAges.canApply(capability, receivedAt, Date.now(), this.unavailableAfterMs())) return false;
    const generation = this.deliveryGeneration;
    this.readingAges.receive(capability, receivedAt);
    try {
      if (this.getCapabilityValue(capability) !== value) await this.setCapabilityValue(capability, value);
    } catch (e) {
      this.readingAges.failed(capability, receivedAt);
      this.error(capability, e);
      // Best effort: a rejected write must not leave an old number looking current.
      if (!this.isStopped()) await this.setCapabilityValue(capability, null).catch(() => {});
      return false;
    }
    if (this.isStopped() || generation !== this.deliveryGeneration) return false;
    this.lastValues[capability] = value;
    this.readingAges.observe({ [capability]: value }, receivedAt);
    if (!this.readingAges.canApply(capability, receivedAt, Date.now(), this.unavailableAfterMs())) {
      // Slow SDK writes cannot renew the receipt age or revive expired readings.
      await this.setCapabilityValue(capability, null).catch((e) => {
        this.readingAges.failed(capability, receivedAt);
        this.error(capability, e);
      });
      return false;
    }
    return true;
  }

  private queueConfiguration(): Promise<void> {
    const run = async () => {
      if (this.isStopped()) return;
      const generation = this.deliveryGeneration;
      const values = stream5000ConfigurationValues(this.configurationTracker?.snapshot());
      for (const [capability, value] of Object.entries(values)) {
        if (this.isStopped() || generation !== this.deliveryGeneration) return;
        if (!this.hasCapability(capability)) {
          this.configurationWriteFailures.delete(capability);
          continue;
        }
        try {
          if (this.getCapabilityValue(capability) !== value) {
            // eslint-disable-next-line no-await-in-loop
            await this.setCapabilityValue(capability, value);
          }
          if (this.isStopped() || generation !== this.deliveryGeneration) return;
          this.configurationWriteFailures.delete(capability);
        } catch (e) {
          if (this.isStopped() || generation !== this.deliveryGeneration) return;
          // Keep the device unavailable while a stale tile cannot be cleared.
          this.configurationWriteFailures.add(capability);
          this.error(`configuration ${capability}`, e);
        }
      }
      if (this.hasApplicationFailures()) await this.setOffline(this.applicationFailedMessage());
    };
    return this.queueWork('configuration', run);
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
    return this.queueReadingBatch('accessories', values, receivedAt);
  }

  private async applyAccessories(batch: ReadingBatch): Promise<void> {
    if (this.isStopped() || batch.generation !== this.deliveryGeneration) return;
    let applied = true;
    for (const [capability, { value, receivedAt, observed }] of Object.entries(batch.readings)) {
      if (this.isStopped() || batch.generation !== this.deliveryGeneration) return;
      if (!this.readingAges.canApply(capability, receivedAt, Date.now(), this.unavailableAfterMs())) continue;
      if (!this.hasCapability(capability)) {
        if (!observed) continue; // Zero alone does not establish that an accessory is installed.
        // eslint-disable-next-line no-await-in-loop
        try {
          await this.addCapability(capability);
        } catch (e) {
          this.readingAges.failed(capability, receivedAt);
          this.error(capability, e);
          applied = false;
          continue;
        }
      }
      if (this.isStopped() || batch.generation !== this.deliveryGeneration) return;
      // eslint-disable-next-line no-await-in-loop
      const success = await this.applyLiveReading(capability, value, receivedAt);
      applied = success && applied;
    }
    if (!this.isStopped() && !applied && this.hasApplicationFailures()) {
      await this.setOffline(this.applicationFailedMessage());
    }
  }

  getAppliedReadingAt(key: string): number | null {
    return this.readingAges.appliedReceiptAt(key);
  }

  private usableSoc(): boolean {
    const value = this.getCapabilityValue('measure_battery');
    const age = this.readingAges.snapshot(Date.now(), this.unavailableAfterMs()).measure_battery as any;
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
      && age?.stale === false && age.applicationStatus === 'applied';
  }

  /** A conservative receipt age, never a claim of hardware measurement age. */
  private async refreshOfficialSystemSoc(): Promise<void> {
    if (!this.isEnergyAggregate() || this.isStopped() || this.officialSocAbort || this.usableSoc()) return;
    const app = getApp(this.homey);
    if (Date.now() < this.officialSocLastAttempt) this.officialSocLastAttempt = 0;
    if (!app.readStream5000SystemSoc || Date.now() - this.officialSocLastAttempt < 60000) return;
    const abort = new AbortController(); this.officialSocAbort = abort;
    this.officialSocLastAttempt = Date.now();
    const deadline = this.homey.setTimeout(() => abort.abort(), 15000);
    const { sn } = this.getData();
    try {
      const sample = await app.readStream5000SystemSoc(sn, abort.signal);
      if (!sample || abort.signal.aborted || this.isStopped() || this.getData().sn !== sn
        || sample.basis !== 'cloud_latest_report' || sample.hardwareReportedAt !== null
        || !Number.isInteger(sample.percent) || sample.percent < 0 || sample.percent > 100
        || !Number.isFinite(sample.requestStartedAt) || sample.requestStartedAt < this.officialSocLastAttempt
        || !Number.isFinite(sample.receivedAt) || sample.receivedAt < sample.requestStartedAt
        || sample.receivedAt > Date.now() || Date.now() - sample.requestStartedAt > 15000) return;
      const apply = async () => {
        if (abort.signal.aborted || this.isStopped() || this.getData().sn !== sn || this.usableSoc()) return;
        const appliedAt = this.readingAges.appliedReceiptAt('measure_battery');
        if (appliedAt !== null && appliedAt <= Date.now() && appliedAt >= sample.requestStartedAt) return;
        if (await this.applyLiveReading('measure_battery', sample.percent, sample.requestStartedAt)) {
          this.officialSocEvidence = sample;
        }
      };
      this.applyChain = this.applyChain.then(apply, apply);
      await this.applyChain;
    } catch { /* Optional read failure cannot stop MQTT or expose API errors/identifiers. */ } finally {
      this.homey.clearTimeout(deadline);
      if (this.officialSocAbort === abort) this.officialSocAbort = undefined;
    }
  }

  getOfficialSocDiagnostics(): Record<string, unknown> | null {
    if (!this.isEnergyAggregate() || !this.officialSocEvidence) return null;
    const { requestStartedAt, receivedAt } = this.officialSocEvidence;
    const now = Date.now();
    return {
      source: 'developer_api',
      basis: 'cloud_latest_report',
      hardwareReportedAt: null,
      receiptAgeSec: now >= requestStartedAt ? Math.floor((now - requestStartedAt) / 1000) : null,
      requestDurationMs: receivedAt - requestStartedAt,
      stale: !this.usableSoc() || now < requestStartedAt || now - requestStartedAt > this.unavailableAfterMs(),
    };
  }

  getReadingDiagnostics(): Record<string, unknown> {
    const readings = this.readingAges.snapshot(Date.now(), this.unavailableAfterMs());
    for (const capability of this.configurationWriteFailures) {
      readings[capability] = {
        ageSec: null, receivedAgeSec: null, stale: true, applicationStatus: 'write_failed',
      };
    }
    if (this.officialSocEvidence && readings.measure_battery) {
      readings.measure_battery = {
        ...(readings.measure_battery as Record<string, unknown>),
        source: 'developer_api',
        basis: 'cloud_latest_report',
        hardwareReportedAt: null,
        hardwareFreshnessVerified: false,
      };
    }
    return readings;
  }

  /** Display-only status. No last-known number is restored to a live capability. */
  getBatteryReadingStatusDiagnostics(): Record<string, unknown> | null {
    if (this.isEnergyAggregate()) return null;
    const readings = this.readingAges.snapshot(Date.now(), this.unavailableAfterMs()) as any;
    const power = readings.stream_unit_power_battery_flow;
    return this.batteryPresentation.snapshot({
      now: Date.now(),
      connectionLimitMs: this.unavailableAfterMs(),
      telemetryAt: this.lastTelemetryAt,
      active: this.subscriptionState === 'active',
      live: power?.stale === false && power?.applicationStatus === 'applied'
        && typeof this.getCapabilityValue('stream_unit_power_battery_flow') === 'number',
      seen: Boolean(power),
      writeFailed: this.readingAges.hasWriteFailures(),
      linked: this.linkedPowerWarning,
    });
  }

  private async updateBatteryPresentation(): Promise<void> {
    if (this.isStopped() || this.isEnergyAggregate() || !this.hasCapability(STREAM_5000_PRESENTATION_CAPABILITY)) return;
    const status = this.getBatteryReadingStatusDiagnostics()?.status;
    if (typeof status !== 'string' || this.getCapabilityValue(STREAM_5000_PRESENTATION_CAPABILITY) === status) return;
    // Optional presentation failure must not take telemetry, accounting or existing Flows offline.
    await this.setCapabilityValue(STREAM_5000_PRESENTATION_CAPABILITY, status)
      .catch(async (e) => {
        this.error('apply battery reading status', e);
        if (!this.isStopped()) await this.setCapabilityValue(STREAM_5000_PRESENTATION_CAPABILITY, null).catch(() => {});
      });
  }

  /** Status/counts only. Numeric candidates have no support-report/export route. */
  getTimeObserverDiagnostics(): Record<string, unknown> | undefined {
    return this.timeObserver?.status();
  }

  getSystemReporterDiagnostics(): Record<string, unknown> {
    return this.reporterObservations.snapshot(Date.now());
  }

  getSystemFlowDiagnostics(): Record<string, unknown> {
    return this.reporterObservations.flowSnapshot(Date.now());
  }

  getOwnUnitDiagnostics(): Record<string, unknown> {
    return this.ownUnitObservations.snapshot(Date.now());
  }

  getPhysicalPowerDiagnostics(): Record<string, unknown> | null {
    if (this.isEnergyAggregate()) return null;
    const power = this.getCapabilityValue('stream_unit_power_battery_flow');
    const reading = this.readingAges.snapshot(Date.now(), this.unavailableAfterMs())
      .stream_unit_power_battery_flow as { stale?: boolean; applicationStatus?: string } | undefined;
    // An applied reading (including zero) is not independent physical scope/sign validation.
    const available = !this.isStopped() && typeof power === 'number' && Number.isFinite(power)
      && reading?.stale === false && reading.applicationStatus === 'applied';
    let status = available ? 'unit_reading_available' : 'waiting_for_unit_evidence';
    if (this.linkedPowerWarning) status = 'linked_power_unverified';
    return {
      status,
      physicalScopeVerified: false,
      linkedSystemPowerCopiedToUnit: false,
      energyContribution: false,
    };
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

  private storedEnergyWh(key: string): number | undefined {
    const value = this.getStoreValue(key);
    const capability = key === 'chargedWh' ? 'meter_power.charged' : 'meter_power.discharged';
    const projected = this.getCapabilityValue(capability);
    const savedWh = typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
    const projectedWh = typeof projected === 'number' && Number.isFinite(projected)
      && projected >= 0 && Number.isFinite(projected * 1000) ? projected * 1000 : undefined;
    if (savedWh === undefined && projectedWh === undefined && (value != null || projected != null)) return undefined;
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0
      && savedWh !== undefined && projected === Math.round(savedWh) / 1000) return savedWh;
    return Math.max(savedWh ?? 0, projectedWh ?? 0);
  }

  /** Add the meters defensively so devices paired with an older manifest migrate in place. */
  private async initialiseEnergyCapabilities(): Promise<void> {
    for (const capability of ENERGY_CAPABILITIES) {
      if (!this.hasCapability(capability)) {
        await this.addCapability(capability).catch((e) => this.error(`add ${capability}`, e));
      }
    }
    await this.projectEnergyCapabilities();
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
    if (this.energyReadOnly) {
      this.lastEnergySampleAt = 0;
      this.skippedEnergySamples += 1;
      return;
    }
    this.energySamples += 1;
    if (this.lastEnergySampleAt > 0
      && sampleAt - this.lastEnergySampleAt > Math.min(MAX_GAP_MS, stream5000ReadingLimitMs('measure_power', this.unavailableAfterMs()))) {
      this.ignoredEnergyGaps += 1;
      this.lastEnergySampleAt = 0; // Re-anchor, never backfill power that was already considered stale.
    }
    const next = integrateTimedSignedPower({
      posWh: this.chargedWh,
      negWh: this.dischargedWh,
      lastSampleAt: this.lastEnergySampleAt,
    }, batteryPowerW, sampleAt);
    this.lastEnergySampleAt = next.lastSampleAt;
    if (next.posWh !== this.chargedWh || next.negWh !== this.dischargedWh) {
      this.chargedWh = next.posWh;
      this.dischargedWh = next.negWh;
      this.energyCheckpoint?.mark();
    }
    // Retry an earlier failed SDK projection even at zero power. Never add
    // energy merely to make a failed capability write eligible for retry.
    await this.projectEnergyCapabilities();
  }

  private async projectEnergyCapabilities(): Promise<void> {
    if (this.energyReadOnly) return;
    for (const [capability, kWh] of [
      ['meter_power.charged', this.chargedWh / 1000],
      ['meter_power.discharged', this.dischargedWh / 1000],
    ] as const) {
      if (!this.hasCapability(capability)) continue;
      const projected = this.getCapabilityValue(capability);
      if (projected === kWh || projected === Math.round(kWh * 1000) / 1000) continue;
      // eslint-disable-next-line no-await-in-loop
      await this.setCapabilityValue(capability, kWh).catch((error) => this.error(capability, error));
    }
  }

  private async persistEnergy(): Promise<void> {
    if (this.energyReadOnly) return;
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
      skippedSamples: this.skippedEnergySamples,
      ignoredGaps: this.ignoredEnergyGaps,
      counterResets: 0,
      chargedCounterSeen: false,
      dischargedCounterSeen: false,
      lastSampleAgeSec: this.lastEnergySampleAt > 0 ? Math.max(0, Math.round((Date.now() - this.lastEnergySampleAt) / 1000)) : null,
      chargedKWh: this.energyReadOnly ? null : this.chargedWh / 1000,
      dischargedKWh: this.energyReadOnly ? null : this.dischargedWh / 1000,
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
          + 'raw_omitted=true',
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

  private queueReadingExpiry(): Promise<void> {
    const expire = async () => {
      if (this.isStopped()) return;
      const generation = this.deliveryGeneration;
      for (const capability of this.readingAges.expired(Date.now(), this.unavailableAfterMs())) {
        if (this.isStopped() || generation !== this.deliveryGeneration) return;
        if (this.hasCapability(capability) && this.getCapabilityValue(capability) !== null) {
          // eslint-disable-next-line no-await-in-loop
          try {
            await this.setCapabilityValue(capability, null);
            this.lastValues[capability] = null;
          } catch (e) {
            this.readingAges.failed(capability);
            this.error(capability, e);
          }
        }
      }
      await this.updateBatteryPresentation();
    };
    return this.queueWork('expiry', expire);
  }

  private async checkAvailability(): Promise<void> {
    this.timeObserver?.tick();
    await this.queueConfiguration();
    await this.queueReadingExpiry();
    if (this.isStopped()) return;
    if (this.hasApplicationFailures()) await this.setOffline(this.applicationFailedMessage());
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
    this.subscriptionState = 'starting';
    this.timeObserver?.close(); // Never resume a capture across a connection/session boundary.
    this.resubscribeCount += 1;
    if (this.subscribedSn && this.frameHandler) {
      this.realtimeApp?.unsubscribeAppRealtime(this.subscribedSn, this.frameHandler);
      this.subscribedSn = undefined;
    }
    this.deliveryEpoch = undefined;
    await this.resetDeliverySession();
    if (this.isStopped()) return;
    await this.queueConfiguration();
    if (this.isStopped()) return;
    await this.subscribe();
  }

  private resetDeliverySession(): Promise<void> {
    this.deliveryGeneration += 1;
    this.pendingWork.clear();
    this.pendingReadings.clear();
    this.lastTelemetryAt = 0;
    this.officialSocAbort?.abort();
    this.officialSocEvidence = null;
    this.timeObserver?.close();
    this.configurationTracker = new Stream5000ConfigurationTracker(this.getData().sn);
    this.topologyTracker = this.telemetryAdapter.createTopologyTracker(this.getData().sn);
    // Scope-disqualification latches are not receipts; reconnect cannot prove a singleton.
    this.reporterObservations = new StreamReporterObservations();
    this.ownUnitObservations = new StreamOwnUnitObservations();
    this.batteryPresentation.reset();
    for (const capability of STREAM_5000_LIVE_CAPABILITIES) this.readingAges.forget(capability);
    const reset = async () => {
      if (this.isStopped()) return;
      // Queue behind any SDK write already running, but before the new epoch's
      // telemetry. Lifetime totals survive; no interval crosses the boundary.
      this.lastEnergySampleAt = 0;
      for (const capability of STREAM_5000_LIVE_CAPABILITIES) {
        this.readingAges.forget(capability);
        if (!this.hasCapability(capability)) continue;
        // eslint-disable-next-line no-await-in-loop
        await this.setCapabilityValue(capability, null).catch((e) => {
          this.readingAges.failed(capability);
          this.error(capability, e);
        });
      }
      await this.updateBatteryPresentation();
    };
    return this.queueWork('reset', reset);
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

  private applicationFailedMessage(): string {
    const key = 'device.stream_5000_system.application_failed';
    const translated = this.homey.__(key);
    return translated && translated !== key ? translated : APPLICATION_FAILED_MESSAGE;
  }

  private hasApplicationFailures(): boolean {
    return this.readingAges.hasWriteFailures() || this.configurationWriteFailures.size > 0;
  }

  /** Only transitions are applied, so a quiet device is not repeatedly flagged. */
  private async setOnline(): Promise<void> {
    if (this.isStopped() || this.hasApplicationFailures() || this.getAvailable()) return;
    await this.setAvailable().then(() => {
      this.lastOfflineMessage = '';
    }).catch(() => {});
  }

  private async setOffline(message: string): Promise<void> {
    if (this.isStopped() || (!this.getAvailable() && this.lastOfflineMessage === message)) return;
    // A write failure before the first successful frame is not a connection failure.
    await this.setUnavailable(message).then(() => {
      this.lastOfflineMessage = message;
    }).catch(() => {});
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
    this.deliveryGeneration += 1;
    this.pendingWork.clear();
    this.pendingReadings.clear();
    this.officialSocAbort?.abort();
    this.officialSocEvidence = null;
    this.batteryPresentation.reset();
    this.timeObserver?.close();
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
    if (this.readingExpiryTimer) {
      this.homey.clearInterval(this.readingExpiryTimer);
      this.readingExpiryTimer = null;
    }
    if (this.resubscribeTimer) {
      this.homey.clearInterval(this.resubscribeTimer);
      this.resubscribeTimer = null;
    }
    await this.applyChain.catch(() => {});
    await this.energyCheckpoint?.close();
  }

  private hasOtherFamilyDevices(): boolean {
    return hasOtherAppAuthDevices(this.homey, this);
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
