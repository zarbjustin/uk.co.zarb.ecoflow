'use strict';

import { BaseEcoFlowDevice, QuotaSampleContext } from '../../lib/BaseEcoFlowDevice';
import { reconcileStreamQuota } from '../../lib/streamQuotaReconciliation';
import { mapStreamQuota } from '../../lib/streamMapping';
import {
  integrateTimedSignedPower, followResettableCounter, batteryEnergyMode,
  EnergyAccountingDiagnostic, MAX_GAP_MS,
} from '../../lib/energyIntegration';
import { toFiniteNumber } from '../../lib/quota';
import { OperatingMode } from '../../lib/streamProtocol';
import {
  executeStreamControl, readStreamControlState, StreamControlIntent, StreamControlFailure,
} from '../../lib/streamControls';
import { currentPriceIsFresh } from '../../lib/automationSafety';
import { aboveBelow } from '../../lib/thresholds';
import { fetchDailyEnergy, DailyEnergy } from '../../lib/streamHistory';
import { fetchSolarRadiation, toForecast } from '../../lib/solarForecast';
import { powerDirection, PowerDirection, startedDirection } from '../../lib/flowStates';
import { EnergyCheckpoint } from '../../lib/EnergyCheckpoint';
import { DeveloperApiQuarantineError } from '../../lib/developerApiCompatibility';
import { StreamTopologyEvidence, streamTopologyFamily } from '../../lib/streamTopology';
import { REPORTING_CAPABILITIES, ReportingObservation } from '../../lib/streamReportingDiagnostics';
import { ReporterTimeline } from '../../lib/reporterTimeline';
import { StreamCounterContinuity } from '../../lib/streamDiagnosticChecks';
import { StreamLimitObservations } from '../../lib/streamLimitDiagnostics';
import { LegacyFlowReadings, assertLegacyThreshold, legacyFlowValueValid } from '../../lib/legacyFlowReadings';
import { ForecastFlowReadings, localForecastDay, sameForecastZone } from '../../lib/forecastFlowReadings';
import {
  MONITORING_TRIAL_SETTING, MONITORING_TRIAL_STORE, MONITORING_TICK_MS, MONITORING_RESOLVE_MS,
  MONITORING_STATE_STORE, MONITORING_LOOKUP_DEADLINE_MS, readMonitoringState,
  TRIAL_SUPPRESSED_CAPABILITIES, selectMonitoringReporter, monitoringTrialSnapshot,
  MonitoringSelection,
} from '../../lib/streamMonitoringTrial';

const HISTORY_INTERVAL_MS = 30 * 60 * 1000;
const SOLAR_FORECAST_INTERVAL_MS = 3 * 60 * 60 * 1000;
type ControlWaitResolver = () => void;

module.exports = class StreamDevice extends BaseEcoFlowDevice {
  protected reconcileRestQuota(quota: Record<string, any>, newerFields: ReadonlySet<string>): Record<string, any> {
    return reconcileStreamQuota(quota, newerFields);
  }

  private mainSn = '';
  private aggregateBound = false;
  private aggregateVerifiedMain = '';
  private aggregateIdentityConflict = false;
  private aggregateVerificationFailures = 0;
  private aggregateRecoveries = 0;
  private bindingAttempted = false;
  private energySourceSn = '';

  private reportingObservations: Record<string, ReportingObservation> = {};
  private limitObservations = new StreamLimitObservations();
  private legacyFlowReadings = new LegacyFlowReadings();
  private forecastFlowReadings = new ForecastFlowReadings();
  private forecastGeneration = 0;
  private forecastPending: Promise<void> | null = null;
  private forecastSettingsTimer: NodeJS.Timeout | null = null;

  getLimitDiagnostics(): Record<string, unknown> {
    return this.limitObservations.snapshot();
  }

  private mainResolution: { status: string; receivedAt: number; family: string } | null = null;
  private resolutionPending: Promise<void> | null = null;
  private resolutionCancel: (() => void) | null = null;
  private resolvedReporter: { sn: string; readSn: string; receivedAt: number } | null = null;
  private monitoringEnabled = false;
  private monitoringReporterId: string | null = null;
  private monitoringStatus = 'disabled';
  private monitoringCandidate: { driverId: string; deviceIndex: number } | null = null;
  private monitoringTimer: NodeJS.Timeout | null = null;
  private monitoringPending: Promise<void> | null = null;
  private monitoringResolveAt = 0;
  private monitoringGeneration = 0;
  private monitoringRollbackPending = false;
  private monitoringSession = 0;
  private monitoringSettingsCount = 0;
  private monitoringSettingsChain: Promise<void> = Promise.resolve();
  private monitoringLocalPending: Promise<void> | null = null;
  private monitoringCoalescedTicks = 0;
  private monitoringTimeline = new ReporterTimeline();
  private monitoringApplied: MonitoringSelection | null = null;
  private monitoringAppliedAt = 0;

  /** Fresh applied snapshot stays online while newer values wait for the next tick.
   * Conditions/widgets still require the latest donor values to match exactly.
   */
  private monitoringAvailabilityReady(selected?: MonitoringSelection, applying = false): boolean {
    if (!this.monitoringEnabled || this.monitoringRollbackPending || (!applying && this.monitoringSettingsCount > 0)
      || this.monitoringStatus !== 'active' || this.monitoringReporterId === null) return false;
    const now = Date.now();
    const current = selected || selectMonitoringReporter(this.homey, this, now, this.monitoringReporterId);
    const applied = this.monitoringApplied;
    return current.status === 'active' && applied?.status === 'active'
      && current.reporterId === applied.reporterId && applied.reporterId === this.monitoringReporterId
      && this.monitoringAppliedAt <= now && applied.validUntil !== null && now <= applied.validUntil
      && Object.entries(applied.values).every(([cap, value]) => this.getCapabilityValue(cap) === value);
  }

  /** Conditions validate the donor now, not just the last 15-second tick. */
  private monitoringConditionReady(): boolean {
    if (this.monitoringRollbackPending || this.monitoringSettingsCount > 0) return false;
    if (!this.monitoringEnabled) return true;
    if (this.monitoringStatus !== 'active' || this.monitoringReporterId === null) return false;
    const selected = selectMonitoringReporter(this.homey, this, Date.now(), this.monitoringReporterId);
    return selected.status === 'active' && Object.entries(selected.values)
      .every(([cap, value]) => this.getCapabilityValue(cap) === value);
  }

  /** An unavailable reading is not false: inverted Flow conditions must also stop. */
  assertMonitoringCondition(scope: 'core' | 'installation'): void {
    if (this.monitoringEnabled && scope === 'installation') {
      throw new Error(this.monitoringMessage('condition'));
    }
    if (this.monitoringRollbackPending || this.monitoringSettingsCount > 0
      || (this.monitoringEnabled && !this.monitoringConditionReady())) {
      throw new Error(this.monitoringMessage('unavailable'));
    }
  }

  private legacyFlowError(kind: 'readings' | 'arguments' | 'forecast'): Error {
    const key = `legacy_flow.${kind}`;
    const fallback = {
      readings: 'Current, matching STREAM readings are unavailable or not time-coherent. Flow evaluation stopped, including when inverted.',
      arguments: 'Use a supported comparison direction and a finite threshold in the card range.',
      forecast: 'A recent forecast for the correct Homey-local date and current location/settings is unavailable. Flow evaluation stopped.',
    };
    const translated = this.homey.__?.(key);
    return new Error(translated && translated !== key ? translated : fallback[kind]);
  }

  /** A cache value alone is not a receipt; unknown must reject, never become invertible false. */
  assertFlowReadings(scope: 'core' | 'installation', caps: string[], coherent = false): void {
    if (this.bindingAttempted && !this.aggregateBound && !this.monitoringEnabled) throw this.legacyFlowError('readings');
    this.assertMonitoringCondition(scope);
    if (this.isShuttingDown() || this.controlStopped) throw this.legacyFlowError('readings');
    if (this.monitoringEnabled) {
      if (!caps.every((cap) => legacyFlowValueValid(cap, this.getCapabilityValue(cap)))) throw this.legacyFlowError('readings');
      return; // Existing selected-donor identity, freshness and application checks above remain authoritative.
    }
    if (typeof this.getAvailable === 'function' && !this.getAvailable()) throw this.legacyFlowError('readings');
    try {
      this.legacyFlowReadings.assert(caps, (cap) => this.getCapabilityValue(cap), coherent);
    } catch {
      throw this.legacyFlowError('readings');
    }
  }

  reportedOperatingModeIs(mode: string): boolean {
    this.assertFlowReadings('installation', ['operating_mode']);
    if (!legacyFlowValueValid('operating_mode', mode)) throw this.legacyFlowError('arguments');
    return this.getCapabilityValue('operating_mode') === mode;
  }

  reportedFeedInEnabled(): boolean {
    this.assertFlowReadings('installation', ['feed_in_control']);
    return this.getCapabilityValue('feed_in_control') === true;
  }

  /** Widgets must not use failed capability writes or old installation flow tiles. */
  getRemainingTimeDiagnostics(): Record<string, unknown> {
    return this.monitoringEnabled || this.monitoringRollbackPending ? {} : super.getRemainingTimeDiagnostics();
  }

  getReadingDiagnostics(): Record<string, { stale: boolean }> {
    if (!this.monitoringEnabled && !this.monitoringRollbackPending) return { ...this.getRemainingTimeFreshness(), ...this.getLiveReadingFreshness() };
    const selected = this.monitoringEnabled && this.monitoringReporterId && this.monitoringStatus !== 'application_failed'
      ? selectMonitoringReporter(this.homey, this, Date.now(), this.monitoringReporterId)
      : null;
    return Object.fromEntries([
      ...TRIAL_SUPPRESSED_CAPABILITIES.map((cap) => [cap, { stale: true }]),
      ...['measure_battery', 'measure_power', 'battery_charging_state'].map((cap) => [cap, {
        stale: !selected || selected.values[cap as keyof typeof selected.values] == null
          || this.getCapabilityValue(cap) !== selected.values[cap as keyof typeof selected.values],
      }]),
    ]);
  }

  getMonitoringTrialDiagnostics() {
    const selected = selectMonitoringReporter(this.homey, this, Date.now(),
      this.monitoringEnabled ? this.monitoringReporterId : null, !this.monitoringEnabled);
    let status = this.monitoringEnabled ? selected.status : this.monitoringStatus;
    if (this.monitoringEnabled && this.monitoringReporterId === null) status = 'waiting_for_validation';
    if (this.monitoringEnabled && (this.controlStopped || this.isShuttingDown())) status = 'waiting_for_validation';
    if (this.monitoringEnabled && this.monitoringStatus === 'application_failed') status = 'application_failed';
    if (this.monitoringEnabled && status === 'active' && !this.monitoringAvailabilityReady(selected)) status = 'pending_apply';
    return monitoringTrialSnapshot({
      enabled: this.monitoringEnabled,
      status,
      candidateDevice: this.monitoringCandidate,
      rollbackAwaitingFreshOriginal: this.monitoringRollbackPending,
      updatePending: status === 'active' && !this.monitoringConditionReady(),
      readiness: {
        eligible: !this.controlStopped && !this.isShuttingDown() && !this.monitoringEnabled && !this.monitoringRollbackPending
        && this.monitoringSettingsCount === 0 && selected.status === 'active',
        status: selected.status,
      },
      timeline: this.monitoringTimeline.snapshot(Date.now()),
      coalescedLocalTicks: this.monitoringCoalescedTicks,
      powerApplication: {
        lastApplyStartedAgeSec: this.monitoringAppliedAt > 0 && this.monitoringAppliedAt <= Date.now()
          ? (Date.now() - this.monitoringAppliedAt) / 1000 : null,
        appliedPowerW: this.monitoringEnabled && this.monitoringAvailabilityReady(selected)
          ? this.monitoringApplied?.values.measure_power : null,
        candidatePowerW: this.monitoringEnabled && selected.status === 'active' ? selected.values.measure_power : null,
      },
    });
  }

  private resetMonitoringTriggers(): void {
    this.prevMode = undefined;
    this.prevSoc = undefined;
    this.prevBatteryDirection = undefined;
    this.prevPv = undefined;
    this.prevGrid = undefined;
    this.prevGridDirection = undefined;
  }

  private startMonitoringTimer(): void {
    if (this.monitoringTimer) this.homey.clearInterval(this.monitoringTimer);
    this.monitoringTimer = this.homey.setInterval(() => {
      this.refreshMonitoringTrial().catch(() => this.error('Monitoring reporter refresh failed.'));
    }, MONITORING_TICK_MS);
  }

  /** Reuse paired reporter caches, with one bounded fresh identity check per four minutes. */
  private async refreshMonitoringTrial(): Promise<void> {
    if (!this.monitoringEnabled || this.isShuttingDown()) return;
    if (this.monitoringLocalPending) {
      this.monitoringCoalescedTicks += 1; return;
    }
    const generation = this.monitoringGeneration;
    const apply = async () => {
      if (this.monitoringLocalPending) return;
      const pending = this.queueDeviceWork(async () => {
        if (generation !== this.monitoringGeneration || !this.monitoringEnabled) return;
        await this.applyMonitoringTrial();
      }).finally(() => {
        if (this.monitoringLocalPending === pending) this.monitoringLocalPending = null;
      });
      this.monitoringLocalPending = pending;
      await pending;
    };
    // Expiry/removal checks continue locally even while a network lookup is pending.
    await apply();
    if (generation !== this.monitoringGeneration || !this.monitoringEnabled || this.monitoringPending) return;
    const now = Date.now();
    if (this.monitoringResolveAt > 0 && this.monitoringResolveAt <= now
      && now - this.monitoringResolveAt < MONITORING_RESOLVE_MS) return;
    this.monitoringResolveAt = now;
    const run = async () => {
      await this.refreshReporterDiagnostics();
      await apply();
    };
    const pending = run().finally(() => {
      if (this.monitoringPending === pending) this.monitoringPending = null;
    });
    this.monitoringPending = pending;
    await pending;
  }

  private async applyMonitoringTrial(): Promise<void> {
    const generation = this.monitoringGeneration;
    const selected = this.monitoringReporterId
      ? selectMonitoringReporter(this.homey, this, Date.now(), this.monitoringReporterId)
      : {
        status: 'waiting_for_validation',
        reporterId: null,
        candidateDevice: null,
        validUntil: null,
        values: { measure_battery: null, measure_power: null, battery_charging_state: null },
      };
    const boundary = selected.status !== this.monitoringStatus;
    if (boundary || selected.status !== 'active') this.resetMonitoringTriggers();
    this.monitoringStatus = selected.status;
    this.monitoringCandidate = selected.candidateDevice;
    this.monitoringApplied = null;
    this.monitoringAppliedAt = Date.now();
    try {
      for (const cap of TRIAL_SUPPRESSED_CAPABILITIES) {
        if (this.hasCapability(cap) && this.getCapabilityValue(cap) !== null) await this.setCapabilityValue(cap, null);
      }
      for (const [cap, value] of Object.entries(selected.values)) {
        if (this.hasCapability(cap) && this.getCapabilityValue(cap) !== value) await this.setCapabilityValue(cap, value);
      }
    } catch {
      this.monitoringStatus = 'application_failed';
      this.monitoringTimeline.record('reporter_state', Date.now(), 'application_failed');
      this.resetMonitoringTriggers();
      for (const cap of Object.keys(selected.values)) {
        if (this.hasCapability(cap)) await this.setCapabilityValue(cap, null).catch(() => {});
      }
      await super.setOnlineState(false, this.monitoringMessage('unavailable'));
      return;
    }
    if (generation !== this.monitoringGeneration || this.isShuttingDown()) return;
    this.monitoringApplied = selected;
    const current = this.monitoringReporterId
      ? selectMonitoringReporter(this.homey, this, Date.now(), this.monitoringReporterId) : null;
    if (selected.status === 'active' && !this.monitoringAvailabilityReady(current || undefined, true)) {
      this.monitoringStatus = current?.status === 'active' ? 'pending_apply' : current?.status || 'waiting_for_validation';
      this.monitoringTimeline.record('reporter_state', Date.now(), this.monitoringStatus);
      this.resetMonitoringTriggers();
      await super.setOnlineState(false, this.monitoringMessage('unavailable'));
      return;
    }
    // A missing/stale reporter is unavailable, not an idle or zero battery.
    await super.setOnlineState(selected.status === 'active', this.monitoringMessage('unavailable'));
    this.monitoringTimeline.record('reporter_state', Date.now(), selected.status);
    if (selected.status === 'active' && this.monitoringConditionReady()) {
      this.fireTriggers(Object.fromEntries(
        Object.entries(selected.values).filter(([, v]) => v !== null),
      ) as Record<string, number | string>);
    } else {
      // Do not create crossing events from a superseded snapshot.
      this.resetMonitoringTriggers();
    }
  }

  private monitoringMessage(kind: 'warning' | 'unavailable' | 'blocked' | 'activation' | 'condition'): string {
    const key = `settings.monitoring_trial.${kind}`;
    const translated = typeof this.homey.__ === 'function' ? this.homey.__(key) : null;
    const fallback = {
      warning: 'Monitoring trial: system SOC and derived battery power use the paired 5000 reporter. '
        + 'Cumulative energy and history still use the original source; their combined-system scope is unverified. '
        + 'Controls are disabled. Turn off the trial to restore original readings.',
      unavailable: 'Monitoring reporter missing, stale or changed. No fallback to original zeros. Check the integration report or turn off the monitoring trial.',
      blocked: 'Battery controls are disabled during the monitoring reporter trial. No control migration has been validated.',
      activation: 'Run the read-only reporter check first. Enable only with one exact paired reporter, fresh comparable system SOC/power and no second Home Battery for the same installation.',
      condition: 'Installation-flow and original control-setting conditions are unavailable during the monitoring reporter trial. '
        + 'Only fresh selected battery SOC and charging-state conditions are supported.',
    };
    return translated && translated !== key ? translated : fallback[kind];
  }

  /** Explicit read-only check; never changes the read/control address or counters. */
  async refreshReporterDiagnostics(): Promise<void> {
    if (this.resolutionPending) {
      await this.resolutionPending;
    }
    const resolutionAge = this.mainResolution ? Date.now() - this.mainResolution.receivedAt : null;
    if (resolutionAge !== null && resolutionAge >= 0 && resolutionAge < 60000) return;
    const generation = this.controlGeneration;
    const session = this.monitoringSession;
    const readSn = this.getReadSn();
    const active = () => !this.isShuttingDown() && generation === this.controlGeneration
      && session === this.monitoringSession && readSn === this.getReadSn();
    const run = async () => {
      const controller = new AbortController();
      let cancel: (() => void) | null = null;
      let timer: NodeJS.Timeout | null = null;
      try {
        if (!this.client || this.isShuttingDown()) return;
        const deadline = new Promise<never>((_resolve, reject) => {
          cancel = () => {
            controller.abort();
            reject(new Error('Reporter lookup cancelled or timed out.'));
          };
          this.resolutionCancel = cancel;
          timer = this.homey.setTimeout(cancel, MONITORING_LOOKUP_DEADLINE_MS);
        });
        const resolved = await Promise.race([
          this.client.getMainSn(readSn, { fresh: true, signal: controller.signal }), deadline,
        ]);
        if (!active()) return;
        const receivedAt = Date.now();
        this.resolvedReporter = { sn: resolved.toUpperCase(), readSn: readSn.toUpperCase(), receivedAt };
        this.mainResolution = {
          status: resolved.toUpperCase() === readSn.toUpperCase() ? 'matched' : 'changed',
          receivedAt,
          family: streamTopologyFamily(resolved.toUpperCase()),
        };
      } catch {
        if (!active()) return;
        this.monitoringTimeline.record('lookup_failed', Date.now());
        this.resolvedReporter = null;
        this.mainResolution = { status: 'failed', receivedAt: Date.now(), family: 'unknown' };
      } finally {
        if (timer) this.homey.clearTimeout(timer);
        if (this.resolutionCancel === cancel) this.resolutionCancel = null;
      }
    };
    const pending = run().finally(() => {
      if (this.resolutionPending === pending) this.resolutionPending = null;
    });
    this.resolutionPending = pending;
    await pending;
  }

  private controlStopped = false;
  private controlGeneration = 0;
  private controlWarning = false;
  private lastControlFailure: { reason: string; requestedAction: string; attempted: number; accepted: number; verified: number } | null = null;
  private controlWaits = new Map<NodeJS.Timeout, ControlWaitResolver>();
  private priceUpdatedAt = 0;

  /**
   * Daily-history capabilities and their titles. These are NOT declared on the
   * driver: they only populate when EcoFlow's history feed returns data, so they
   * are added on demand. Once present, retain their identity even when readings
   * are blank or the history feed is unavailable, preserving Insights and Flows.
   */
  private static readonly HISTORY_TITLES: Record<string, string> = {
    energy_solar_today: 'Solar today',
    energy_consumption_today: 'Consumption today (est.)',
    energy_grid_import_today: 'Grid import today',
    energy_grid_export_today: 'Grid export today',
    energy_savings_today: 'Savings today',
    co2_today: 'CO₂ avoided today',
    energy_independence: 'Energy independence',
  };

  private historyTimer: NodeJS.Timeout | null = null;
  private solarForecastTimer: NodeJS.Timeout | null = null;
  private historyDay = '';
  private prevSoc: number | undefined;
  private prevPv: number | undefined;
  private prevGrid: number | undefined;
  private prevMode: string | undefined;
  private prevBatteryDirection: PowerDirection | undefined;
  private prevGridDirection: PowerDirection | undefined;
  private prevOnline: boolean | undefined;
  private activeFaults = new Map<string, number>();
  // Locally-integrated cumulative battery energy (Wh). Prefer the device's own
  // counters (accuChgEnergy/accuDsgEnergy via MQTT, reset-protected); fall back
  // to integrating battery power when only the sparse REST snapshot is available.
  private chargedWh = 0;
  private dischargedWh = 0;
  private chargedRawWh: number | undefined;
  private dischargedRawWh: number | undefined;
  private lastEnergyTs = 0;
  // Once the device's own energy counters (accu*Energy, via MQTT) are seen they
  // are authoritative; the REST power-integration fallback is then disabled so the
  // same energy is never counted twice into the monotonic Homey meters.
  private countersAvailable = false;
  private energyCheckpoint!: EnergyCheckpoint;
  private energySamples = 0;
  private skippedEnergySamples = 0;
  private ignoredEnergyGaps = 0;
  private counterResets = 0;
  private counterContinuity = new StreamCounterContinuity();

  protected getReadSn(): string {
    return this.aggregateBound && !this.monitoringEnabled ? this.mainSn : this.getData().sn;
  }

  protected async beforeFirstPoll(): Promise<void> {
    const generation = this.controlGeneration;
    this.bindingAttempted = true;
    this.energySourceSn = (this.getStoreValue('energySourceSn') as string) || this.mainSn;
    this.aggregateBound = false;
    if (this.client && !this.monitoringEnabled && !this.monitoringRollbackPending) {
      try {
        this.mainSn = await this.resolveAggregateMain();
        if (this.energySourceSn !== this.mainSn) {
          // Rebase new reporter lifetime counters without importing history or bridging power gaps.
          this.chargedRawWh = undefined;
          this.dischargedRawWh = undefined;
          this.lastEnergyTs = 0;
        }
        this.energySourceSn = this.mainSn;
        await this.persistBatteryStore();
        if (generation === this.controlGeneration && !this.controlStopped) {
          this.aggregateBound = true;
          this.aggregateVerifiedMain = this.mainSn;
          this.aggregateIdentityConflict = false;
          if (this.getSetting('enable_history') !== false) this.startHistory();
        }
      } catch {
        if (generation === this.controlGeneration) this.aggregateBound = false;
      }
    }
  }

  private async resolveAggregateMain(): Promise<string> {
    const generation = this.controlGeneration;
    const main = await this.client.getMainSn(this.getData().sn, { fresh: true, signal: AbortSignal.timeout(10000) });
    if (this.isShuttingDown() || generation !== this.controlGeneration
      || streamTopologyFamily(main) !== 'original_stream') throw Error('Original aggregate main unavailable or unsupported');
    return main.toUpperCase();
  }

  private async requireAggregateMain(allowTelemetryRecovery = false): Promise<string> {
    const generation = this.controlGeneration;
    try {
      const main = await this.resolveAggregateMain();
      if (main !== this.mainSn) this.aggregateIdentityConflict = true;
      if (this.aggregateIdentityConflict) throw Error('Aggregate main changed; reinitialization required');
      if (!this.aggregateBound && allowTelemetryRecovery && this.aggregateVerifiedMain === main) {
        // A fresh successful lookup of the same session-verified source can
        // recover telemetry. Never adopt a changed source or replay readings.
        this.aggregateBound = true;
        this.aggregateRecoveries = Math.min(65535, this.aggregateRecoveries + 1);
        this.log('Original STREAM telemetry source reverified');
      }
      if (!this.aggregateBound) throw Error('Aggregate main unverified; reinitialization required');
      return main;
    } catch {
      if (generation !== this.controlGeneration || this.controlStopped || this.isShuttingDown()) throw Error('Aggregate lookup interrupted');
      if (this.aggregateBound) this.log('Original STREAM source verification interrupted', this.aggregateIdentityConflict ? 'identity_changed' : 'lookup_failed');
      this.aggregateBound = false;
      this.aggregateVerificationFailures = Math.min(65535, this.aggregateVerificationFailures + 1);
      this.lastEnergyTs = 0;
      this.legacyFlowReadings = new LegacyFlowReadings();
      for (const cap of ['measure_battery', 'measure_power', 'measure_power.grid', 'measure_power.load',
        'measure_power.pv', 'battery_charging_state', 'feed_in_control', 'backup_reserve_soc',
        'charge_limit', 'discharge_limit', 'operating_mode']) {
        if (generation !== this.controlGeneration || this.controlStopped || this.isShuttingDown()) break;
        if (this.hasCapability(cap)) await this.setCapabilityValue(cap, null).catch(() => {});
      }
      throw Error('Aggregate main unverified; no controls or legacy readings allowed');
    }
  }

  protected async poll(): Promise<void> {
    const generation = this.controlGeneration;
    if (this.controlStopped || this.isShuttingDown()) return;
    if (!this.monitoringEnabled && !this.monitoringRollbackPending) {
      try {
        // Identity checks precede the base poll, so refresh rotated API keys
        // here too; otherwise a failed lookup can trap the old client forever.
        this.refreshClientCredentials();
        await this.requireAggregateMain(true);
      } catch {
        if (generation === this.controlGeneration && !this.controlStopped && !this.isShuttingDown()) {
          await this.setOnlineState(false, this.aggregateUnavailableMessage());
        }
        return;
      }
    }
    await super.poll();
  }

  /** Session-only receipts, not device timestamps or verified installation membership. */
  getReportingDiagnostics() {
    let aggregateBinding = 'not_checked';
    if (this.bindingAttempted) aggregateBinding = this.aggregateBound ? 'verified_original_main' : 'blocked';
    let recoveryState = aggregateBinding;
    if (this.bindingAttempted && !this.aggregateBound && !this.aggregateVerifiedMain) recoveryState = 'startup_unverified';
    if (this.aggregateIdentityConflict) recoveryState = 'identity_changed';
    return {
      readAddressMatchesSavedMain: this.getStoreValue('mainSn') ? this.getReadSn() === this.getStoreValue('mainSn') : null,
      aggregateBinding,
      aggregateRecovery: {
        state: recoveryState,
        verificationFailures: this.aggregateVerificationFailures,
        recoveries: this.aggregateRecoveries,
      },
      observations: this.reportingObservations,
      lastControlFailure: this.lastControlFailure,
      mainResolution: this.mainResolution,
    };
  }

  /** Private session-only join key; supportSnapshot must never serialize this object. */
  getResolvedReporterEvidence() {
    return this.resolvedReporter ? { ...this.resolvedReporter, currentReadSn: this.getReadSn() } : null;
  }

  /** Address cached at init, not a live membership lookup or cross-generation identity. */
  getTopologyEvidence(): StreamTopologyEvidence {
    return {
      source: 'bk_main_address',
      addressSn: this.mainSn,
      peers: [],
      maxReportedRecordCount: 0,
      lastPeerRecordAt: null,
      systemSocObserved: false,
      truncated: false,
    };
  }

  protected handlesStatus(): boolean {
    return true;
  }

  protected async onReady(): Promise<void> {
    this.legacyFlowReadings = new LegacyFlowReadings();
    this.forecastFlowReadings = new ForecastFlowReadings();
    this.forecastGeneration += 1;
    this.limitObservations = new StreamLimitObservations();
    this.counterContinuity = new StreamCounterContinuity();
    await this.startLiveReadings('system');
    await this.startRemainingTime('system');
    // A persisted port fallback must not survive an app update as a house meter.
    if (this.hasCapability('measure_power.grid')) await this.setCapabilityValue('measure_power.grid', null).catch(() => {});
    this.monitoringApplied = null;
    this.monitoringAppliedAt = 0;
    this.monitoringTimeline.reset(Date.now());
    this.monitoringCoalescedTicks = 0;
    this.monitoringSession += 1;
    this.resolutionCancel?.();
    if (this.monitoringTimer) this.homey.clearInterval(this.monitoringTimer);
    this.monitoringTimer = null;
    this.controlGeneration += 1;
    this.aggregateBound = false;
    this.aggregateVerifiedMain = '';
    this.aggregateIdentityConflict = false;
    this.aggregateVerificationFailures = 0;
    this.aggregateRecoveries = 0;
    this.bindingAttempted = false;
    this.controlStopped = false;
    this.priceUpdatedAt = 0;
    this.reportingObservations = {};
    this.mainResolution = null;
    this.resolvedReporter = null;
    this.lastControlFailure = null;
    this.monitoringGeneration += 1;
    this.monitoringResolveAt = 0;
    this.monitoringEnabled = this.getSetting(MONITORING_TRIAL_SETTING) === true;
    const rawState = this.getStoreValue(MONITORING_STATE_STORE);
    const state = readMonitoringState(rawState);
    if (rawState != null && !state) this.monitoringTimeline.record('state_invalid', Date.now());
    // Legacy keys are read only if there is no new record, never over a corrupt one.
    let pinned = rawState == null ? this.getStoreValue(MONITORING_TRIAL_STORE) : null;
    if (state?.mode === 'trial') pinned = state.reporterId;
    this.monitoringReporterId = typeof pinned === 'string' && pinned ? pinned : null;
    this.monitoringStatus = this.monitoringEnabled ? 'waiting_for_validation' : 'disabled';
    this.monitoringCandidate = null;
    this.monitoringRollbackPending = !this.monitoringEnabled && (rawState == null
      ? this.getStoreValue('monitoringRollbackPending') === true : state?.mode !== 'original');
    this.resetMonitoringTriggers();
    this.mainSn = (this.getStoreValue('mainSn') as string) || this.getData().sn;
    const storedWh = (key: string) => {
      const value = toFiniteNumber(this.getStoreValue(key));
      return value !== undefined && value >= 0 ? value : undefined;
    };
    this.chargedWh = storedWh('chargedWh') ?? 0;
    this.dischargedWh = storedWh('dischargedWh') ?? 0;
    this.chargedRawWh = storedWh('chargedRawWh');
    this.dischargedRawWh = storedWh('dischargedRawWh');
    this.countersAvailable = this.getStoreValue('countersAvailable') === true
      || this.chargedRawWh !== undefined || this.dischargedRawWh !== undefined;
    this.energyCheckpoint = new EnergyCheckpoint(this.homey, () => this.persistBatteryStore());

    this.registerControlListeners();
    await this.setCapabilityValue('meter_power.charged', this.chargedWh / 1000).catch(() => {});
    await this.setCapabilityValue('meter_power.discharged', this.dischargedWh / 1000).catch(() => {});

    if ((this.monitoringEnabled || this.monitoringRollbackPending) && this.getSetting('enable_history') !== false) this.startHistory();
    if (this.getSetting('solar_forecast') !== false) this.startSolarForecast();
    if (this.monitoringEnabled) {
      await this.applyMonitoringTrial(); // Clear cached readings before startup's first legacy poll.
      await this.setWarning(this.monitoringMessage('warning')).catch(() => {});
      this.startMonitoringTimer();
    } else if (this.monitoringRollbackPending) {
      await this.clearRollbackReadings();
    }
  }

  /** Ensure a history capability exists (with its title) before setting it. */
  private async ensureHistoryCapability(cap: string): Promise<void> {
    if (this.hasCapability(cap)) return;
    await this.addCapability(cap).catch((e) => this.error(`add ${cap}`, e));
    const title = StreamDevice.HISTORY_TITLES[cap];
    if (title) await this.setCapabilityOptions(cap, { title: { en: title } }).catch(() => {});
  }

  /** Fetch a solar-yield forecast from Open-Meteo for Homey's location. */
  private startSolarForecast(): void {
    this.forecastGeneration += 1;
    this.forecastFlowReadings = new ForecastFlowReadings();
    const generation = this.forecastGeneration;
    if (this.solarForecastTimer) this.homey.clearInterval(this.solarForecastTimer);
    const refresh = () => {
      if (generation === this.forecastGeneration && !this.isShuttingDown()) this.refreshSolarForecast().catch(() => {});
    };
    if (this.forecastPending) this.forecastPending.catch(() => {}).then(refresh).catch(() => {});
    else refresh();
    this.solarForecastTimer = this.homey.setInterval(() => {
      refresh();
    }, SOLAR_FORECAST_INTERVAL_MS);
  }

  private async refreshSolarForecast(): Promise<void> {
    if (this.forecastPending) {
      await this.forecastPending; return;
    }
    const run = this.fetchAndApplySolarForecast();
    this.forecastPending = run;
    try {
      await run;
    } finally {
      if (this.forecastPending === run) this.forecastPending = null;
    }
  }

  private forecastContext(): { timeZone: string; factor: number; latitude: number; longitude: number; key: string } {
    const timeZone = this.homey.clock.getTimezone();
    const latitude = this.homey.geolocation.getLatitude();
    const longitude = this.homey.geolocation.getLongitude();
    const setting = this.getSetting('solar_factor');
    const factor = setting == null ? 0.67 : Number(setting);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180
      || !Number.isFinite(factor) || factor < 0.05 || factor > 5 || !sameForecastZone(timeZone, timeZone)) throw this.legacyFlowError('forecast');
    return {
      timeZone, factor, latitude, longitude, key: JSON.stringify([latitude, longitude, factor, timeZone]),
    };
  }

  private async fetchAndApplySolarForecast(): Promise<void> {
    const generation = this.forecastGeneration;
    const receipts = this.forecastFlowReadings;
    let context: { timeZone: string; factor: number; latitude: number; longitude: number; key: string };
    // No host timezone fallback: dates must refer to Homey's configured installation.
    try {
      context = this.forecastContext();
    } catch {
      return;
    }
    const requestedAt = Date.now();
    const requestDay = localForecastDay(requestedAt, context.timeZone);
    const radiation = await fetchSolarRadiation(context.latitude, context.longitude, undefined, context.timeZone);
    const active = () => !this.isShuttingDown() && generation === this.forecastGeneration && receipts === this.forecastFlowReadings;
    if (!active() || this.forecastContext().key !== context.key || requestDay !== localForecastDay(Date.now(), context.timeZone)) return;
    const { dates } = radiation;
    const dated = sameForecastZone(radiation.timeZone, context.timeZone) && dates?.[0] === requestDay
      && dates?.[1] === localForecastDay(requestedAt, context.timeZone, 1);
    const fc = toForecast(radiation, context.factor);
    for (const [cap, value, day, raw] of [
      ['solar_forecast_today', fc.todayKwh, dates?.[0], radiation.today],
      ['solar_forecast_tomorrow', fc.tomorrowKwh, dates?.[1], radiation.tomorrow],
    ] as const) {
      if (!active()) return;
      receipts.invalidate(cap);
      const valid = dated && typeof raw === 'number' && raw >= 0 && typeof value === 'number' && Number.isFinite(value) && value >= 0;
      if (!this.hasCapability(cap) && valid) await this.addCapability(cap).catch(() => {});
      if (!active()) return;
      if (!this.hasCapability(cap)) continue;
      try {
        await this.setCapabilityValue(cap, valid ? value : null);
        if (!active() || this.forecastContext().key !== context.key) return;
        if (valid) receipts.observe(cap, value, this.getCapabilityValue(cap), requestedAt, day, context.timeZone, context.key);
      } catch {
        receipts.invalidate(cap); /* Failed writes never bless cached values. */
      }
    }
  }

  solarForecastIs(day: 'today' | 'tomorrow', direction: 'above' | 'below', kwh: number): boolean {
    if (!['today', 'tomorrow'].includes(day) || this.isShuttingDown() || this.controlStopped
      || this.getSetting('solar_forecast') === false) throw this.legacyFlowError('forecast');
    try {
      assertLegacyThreshold(direction, kwh, 200);
    } catch {
      throw this.legacyFlowError('arguments');
    }
    const cap = `solar_forecast_${day}`;
    try {
      const context = this.forecastContext();
      this.forecastFlowReadings.assert(cap, this.getCapabilityValue(cap), context.timeZone, context.key);
    } catch {
      throw this.legacyFlowError('forecast');
    }
    return aboveBelow(this.getCapabilityValue(cap), direction, kwh);
  }

  private stopSolarForecast(remove: boolean): void {
    this.forecastGeneration += 1;
    this.forecastFlowReadings = new ForecastFlowReadings();
    if (this.forecastSettingsTimer) this.homey.clearTimeout(this.forecastSettingsTimer);
    this.forecastSettingsTimer = null;
    if (this.solarForecastTimer) {
      this.homey.clearInterval(this.solarForecastTimer);
      this.solarForecastTimer = null;
    }
    if (remove) {
      for (const cap of ['solar_forecast_today', 'solar_forecast_tomorrow']) {
        if (this.hasCapability(cap)) this.removeCapability(cap).catch(() => {});
      }
    }
  }

  private startHistory(): void {
    if (this.historyTimer) this.homey.clearInterval(this.historyTimer);
    this.refreshHistory().catch((e) => this.error('history', e));
    this.historyTimer = this.homey.setInterval(() => {
      this.refreshHistory().catch((e) => this.error('history', e));
    }, HISTORY_INTERVAL_MS);
  }

  private async refreshHistory(): Promise<void> {
    if (this.isShuttingDown()) return;
    if (this.bindingAttempted && !this.monitoringEnabled) await this.requireAggregateMain();
    const generation = this.controlGeneration;
    // On a calendar-day rollover, clear the existing daily tiles so a broken/empty
    // history feed can't keep showing yesterday's totals as "today"; fresh data
    // then overwrites them as it arrives.
    const tz = this.homey.clock.getTimezone();
    const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
    if (this.historyDay && this.historyDay !== today) {
      for (const cap of Object.keys(StreamDevice.HISTORY_TITLES)) {
        if (this.hasCapability(cap)) await this.setCapabilityValue(cap, null).catch(() => {});
      }
    }
    this.historyDay = today;
    const prefix = (this.getSetting('history_prefix') as string) || 'BK621';
    const daily = await fetchDailyEnergy(this.client, this.mainSn, prefix, tz);
    if (this.isShuttingDown() || generation !== this.controlGeneration
      || today !== new Date().toLocaleDateString('en-CA', { timeZone: tz })) return;
    await this.applyDailyEnergy(daily);
  }

  private async applyDailyEnergy(d: DailyEnergy): Promise<void> {
    const kwh = (wh?: number) => (typeof wh === 'number' ? wh / 1000 : undefined);
    const map: Record<string, number | undefined> = {
      energy_solar_today: kwh(d.solarWh),
      energy_consumption_today: kwh(d.consumptionWh),
      energy_grid_import_today: kwh(d.gridImportWh),
      energy_grid_export_today: kwh(d.gridExportWh),
      energy_savings_today: d.savings,
      co2_today: typeof d.co2g === 'number' ? d.co2g / 1000 : undefined,
      energy_independence: d.independencePct,
    };
    for (const [cap, value] of Object.entries(map)) {
      if (value === undefined) continue;
      await this.ensureHistoryCapability(cap);
      if (!this.hasCapability(cap)) continue;
      await this.setCapabilityValue(cap, value).catch((e) => this.error(`setCapabilityValue ${cap}`, e));
    }
  }

  private registerControlListeners(): void {
    this.registerCapabilityListener('feed_in_control', async (v: boolean) => this.flowSetFeedIn(v));
    this.registerCapabilityListener('backup_reserve_soc', async (v: number) => this.applyBackupReserve(v));
    this.registerCapabilityListener('operating_mode', async (v: OperatingMode) => this.flowSetOperatingMode(v));
    this.registerCapabilityListener('charge_limit', async (v: number) => this.flowSetChargeLimit(v));
    this.registerCapabilityListener('discharge_limit', async (v: number) => this.flowSetDischargeLimit(v));
  }

  private waitForControlReadback(): Promise<void> {
    return new Promise((resolve) => {
      const timer = this.homey.setTimeout(() => {
        this.controlWaits.delete(timer);
        resolve();
      }, 1500);
      this.controlWaits.set(timer, resolve);
    });
  }

  /** Fresh main-target state and readback for every command; no optimistic tiles. */
  private async runControl(intent: StreamControlIntent): Promise<void> {
    if (this.monitoringEnabled || this.monitoringRollbackPending || this.monitoringSettingsCount > 0) {
      throw new Error(this.monitoringMessage('blocked'));
    }
    this.assertDeveloperApiSupported();
    const target = await this.requireAggregateMain();
    const generation = this.controlGeneration;
    const active = () => !this.controlStopped && !this.isShuttingDown()
      && !this.monitoringEnabled && !this.monitoringRollbackPending
      && this.monitoringSettingsCount === 0
      && this.aggregateBound && generation === this.controlGeneration
      && target === (this.mainSn || this.getData().sn);
    try {
      await executeStreamControl(target, intent, {
        active,
        read: async () => {
          await this.requireAggregateMain(); return readStreamControlState(await this.readControlQuota(target));
        },
        write: async (payload) => {
          await this.requireAggregateMain(); await this.writeQuota(payload);
        },
        wait: () => this.waitForControlReadback(),
        observed: async (state) => {
          const receipts = this.legacyFlowReadings;
          for (const [key, value] of Object.entries(state)) {
            if (!active()) return;
            if (this.hasCapability(key)) {
              await this.setCapabilityValue(key, value);
              if (active() && receipts === this.legacyFlowReadings) receipts.observe(key, value, this.getCapabilityValue(key), Date.now());
            }
          }
        },
      });
      if (active() && this.controlWarning) {
        await this.setWarning(null).catch(() => {});
        this.controlWarning = false;
        this.lastControlFailure = null;
      }
    } catch (error) {
      if (error instanceof DeveloperApiQuarantineError) throw error;
      if (active() && error instanceof StreamControlFailure) {
        this.lastControlFailure = {
          reason: error.reason,
          requestedAction: error.requestedAction,
          attempted: error.attempted,
          accepted: error.accepted,
          verified: error.verified,
        };
        const previous = Object.entries(error.before).map(([key, value]) => `${key}=${value}`).join(', ');
        await this.setWarning(error.message + (previous ? ` Previous reported settings: ${previous}.` : '')).catch(() => {});
        this.controlWarning = true;
      }
      throw error;
    }
  }

  protected async applyBackupReserve(targetSoc: number): Promise<void> {
    await this.runControl({ kind: 'reserve', value: targetSoc });
  }

  private aggregateUnavailableMessage(): string {
    if (this.aggregateIdentityConflict) return 'Original STREAM main unit changed; review the installation before continuing.';
    return this.aggregateVerifiedMain
      ? 'Original STREAM source verification interrupted; retrying automatically.'
      : 'Waiting for original STREAM source verification.';
  }

  /** Availability + online/offline flow triggers (overrides the base). */
  protected async setOnlineState(online: boolean, message?: string): Promise<void> {
    if (this.monitoringEnabled) {
      // Legacy quota availability cannot revive a stale/missing selected reporter.
      await super.setOnlineState(this.monitoringAvailabilityReady(), this.monitoringMessage('unavailable'));
      return;
    }
    if (this.monitoringRollbackPending || this.monitoringSettingsCount > 0) {
      await super.setOnlineState(false, 'Waiting for fresh original battery readings after rollback.');
      return;
    }
    if (this.bindingAttempted && !this.aggregateBound) {
      await super.setOnlineState(false, this.aggregateUnavailableMessage());
      return;
    }
    if (online) {
      if (!this.getAvailable()) await this.setAvailable().catch(() => {});
    } else {
      this.legacyFlowReadings = new LegacyFlowReadings();
      this.resetMonitoringTriggers();
      await this.setUnavailable(message || 'Device offline').catch(() => {});
    }
    if (this.prevOnline !== undefined && online !== this.prevOnline) {
      const card = online ? 'device_came_online' : 'device_went_offline';
      this.homey.flow.getDeviceTriggerCard(card).trigger(this).catch(() => {});
    }
    this.prevOnline = online;
  }

  async applyQuota(quota: Record<string, any>, context?: QuotaSampleContext): Promise<void> {
    if (this.bindingAttempted && !this.monitoringEnabled && !this.monitoringRollbackPending && !this.aggregateBound) return;
    const flowReceipts = this.legacyFlowReadings;
    this.limitObservations.observe(quota, context?.receivedAt ?? Date.now(), 'developer_quota');
    if (!this.monitoringEnabled && !this.monitoringRollbackPending) await this.applyRemainingTime(quota, context);
    const receivedAt = context?.receivedAt ?? Date.now();
    this.counterContinuity.observe(quota, receivedAt);
    const values = mapStreamQuota(quota);
    if (!this.monitoringEnabled && flowReceipts === this.legacyFlowReadings) {
      if (Object.keys(quota).some((key) => key.startsWith('energyStrategyOperateMode.')) && values.operating_mode === undefined) {
        flowReceipts.observe('operating_mode', undefined, undefined, receivedAt);
      }
      if (Object.prototype.hasOwnProperty.call(quota, 'feedGridMode') && values.feed_in_control === undefined) {
        flowReceipts.observe('feed_in_control', undefined, undefined, receivedAt);
      }
    }
    delete values.charge_remaining;
    delete values.discharge_remaining;
    for (const key of REPORTING_CAPABILITIES) {
      const value = values[key];
      const previous = this.reportingObservations[key];
      if (typeof value === 'number' && Number.isFinite(value) && Number.isFinite(receivedAt)
        && receivedAt > 0 && receivedAt <= Date.now() && (!previous || receivedAt >= previous.receivedAt)) {
        this.reportingObservations[key] = { value, receivedAt, source: context?.source ?? 'unknown' };
      }
    }
    // Charged/discharged energy is maintained by updateBatteryEnergy, so drop any
    // values mapped from absent device counters to avoid conflicts.
    delete values['meter_power.charged'];
    delete values['meter_power.discharged'];
    const legacyPower = values.measure_power;
    if (this.monitoringEnabled) {
      for (const key of [...TRIAL_SUPPRESSED_CAPABILITIES, 'measure_battery', 'measure_power', 'battery_charging_state']) {
        delete values[key];
      }
    }
    if (this.monitoringRollbackPending && (!Number.isFinite(receivedAt) || receivedAt <= 0
      || receivedAt > Date.now() || Date.now() - receivedAt > 180000)) {
      // Delayed/future packets may not repopulate the core UI during rollback.
      // Keep the original accounting path below unchanged.
      delete values.measure_battery;
      delete values.measure_power;
      delete values.battery_charging_state;
    }
    let coreWriteFailed = false;
    const recordFlow = (cap: string, value: unknown) => {
      if (flowReceipts === this.legacyFlowReadings && !this.isShuttingDown() && !this.monitoringEnabled) {
        flowReceipts.observe(cap, value, this.getCapabilityValue(cap), receivedAt);
      }
    };
    for (const [cap, value] of Object.entries(values)) {
      if (!this.hasCapability(cap)) continue;
      if (this.isLiveReading(cap)) {
        const applied = await this.applyLiveReading(cap, value, receivedAt);
        if (!applied) {
          flowReceipts.invalidate(cap);
          delete values[cap];
          if (cap === 'measure_power') coreWriteFailed = true;
        }
        if (applied) recordFlow(cap, value);
        continue;
      }
      if (this.getCapabilityValue(cap) === value) {
        recordFlow(cap, value); continue;
      }
      try {
        await this.setCapabilityValue(cap, value);
        recordFlow(cap, value);
      } catch (e) {
        flowReceipts.invalidate(cap);
        if (cap === 'measure_battery' || cap === 'measure_power') coreWriteFailed = true;
        this.error(`setCapabilityValue ${cap}`, e);
      }
    }
    if (this.monitoringRollbackPending && !coreWriteFailed && receivedAt > 0 && receivedAt <= Date.now()
      && Date.now() - receivedAt <= 180000
      && typeof values.measure_battery === 'number' && typeof values.measure_power === 'number') {
      try {
        await this.setStoreValue(MONITORING_STATE_STORE, { version: 1, mode: 'original', reporterId: null });
        this.monitoringRollbackPending = false;
        this.monitoringTimeline.record('rollback_complete', Date.now());
      } catch { /* Keep rollback unavailable until its complete state can be saved. */ }
    }
    // Only the original quota enters accounting, never the selected reporter's power.
    await this.updateBatteryEnergy(quota, legacyPower, receivedAt);
    await this.expireLiveReadings();
    if (this.monitoringEnabled) await this.applyMonitoringTrial();
    if (!this.monitoringRollbackPending && this.monitoringSettingsCount === 0) this.fireTriggers(values);
    this.checkFaults(quota);
  }

  private async updateBatteryEnergy(
    quota: Record<string, any>,
    batteryPowerW: number | boolean | string | undefined,
    receivedAt: number,
  ): Promise<void> {
    const accuChg = toFiniteNumber(quota.accuChgEnergy);
    const accuDsg = toFiniteNumber(quota.accuDsgEnergy);
    const hasChg = accuChg !== undefined && accuChg >= 0;
    const hasDsg = accuDsg !== undefined && accuDsg >= 0;
    this.energySamples += 1;
    const mode = batteryEnergyMode(hasChg || hasDsg, this.countersAvailable);
    // Counters are authoritative once seen: 'skip' means the source is counters but
    // this sample carries none, so we must not integrate power (double-count).
    if (mode === 'skip') {
      this.skippedEnergySamples += 1;
      return;
    }

    // Capture the interval and re-anchor the timestamp SYNCHRONOUSLY (before any
    // await) so a concurrent applyQuota (poll + MQTT) can't double-count.
    if (mode === 'counter') {
      this.lastEnergyTs = receivedAt;
      this.countersAvailable = true;
      let changed = false;
      if (hasChg) {
        if (this.chargedRawWh !== undefined && accuChg < this.chargedRawWh) this.counterResets += 1;
        const r = followResettableCounter(this.chargedWh, this.chargedRawWh, accuChg as number);
        if (r.totalWh !== this.chargedWh) changed = true;
        this.chargedWh = r.totalWh;
        this.chargedRawWh = r.lastRawWh;
      }
      if (hasDsg) {
        if (this.dischargedRawWh !== undefined && accuDsg < this.dischargedRawWh) this.counterResets += 1;
        const r = followResettableCounter(this.dischargedWh, this.dischargedRawWh, accuDsg as number);
        if (r.totalWh !== this.dischargedWh) changed = true;
        this.dischargedWh = r.totalWh;
        this.dischargedRawWh = r.lastRawWh;
      }
      // Persist the first raw baselines and authoritative-source latch even
      // when the first sample adds no energy, or a restart can re-enable fallback.
      this.energyCheckpoint.mark();
      if (changed) await this.updateBatteryEnergyCapabilities();
      return;
    }

    // mode === 'integrate' — counters have never been seen; integrate power.
    if (typeof batteryPowerW !== 'number' || !Number.isFinite(batteryPowerW)) return;
    if (this.lastEnergyTs > 0 && receivedAt - this.lastEnergyTs > MAX_GAP_MS) this.ignoredEnergyGaps += 1;
    const next = integrateTimedSignedPower(
      { posWh: this.chargedWh, negWh: this.dischargedWh, lastSampleAt: this.lastEnergyTs },
      batteryPowerW,
      receivedAt,
    );
    this.lastEnergyTs = next.lastSampleAt;
    if (next.posWh !== this.chargedWh || next.negWh !== this.dischargedWh) {
      this.chargedWh = next.posWh;
      this.dischargedWh = next.negWh;
      await this.updateBatteryEnergyCapabilities();
    }
  }

  private async updateBatteryEnergyCapabilities(): Promise<void> {
    this.energyCheckpoint.mark();
    await this.setCapabilityValue('meter_power.charged', this.chargedWh / 1000).catch(() => {});
    await this.setCapabilityValue('meter_power.discharged', this.dischargedWh / 1000).catch(() => {});
  }

  private async persistBatteryStore(): Promise<void> {
    // Snapshot before awaiting so totals and raw baselines describe one sample.
    const snapshot = {
      chargedWh: this.chargedWh,
      dischargedWh: this.dischargedWh,
      chargedRawWh: this.chargedRawWh,
      dischargedRawWh: this.dischargedRawWh,
      countersAvailable: this.countersAvailable,
      energySourceSn: this.energySourceSn,
    };
    await this.setStoreValue('chargedWh', snapshot.chargedWh);
    await this.setStoreValue('dischargedWh', snapshot.dischargedWh);
    await this.setStoreValue('chargedRawWh', snapshot.chargedRawWh ?? null);
    await this.setStoreValue('dischargedRawWh', snapshot.dischargedRawWh ?? null);
    if (snapshot.energySourceSn) await this.setStoreValue('energySourceSn', snapshot.energySourceSn);
    if (snapshot.countersAvailable) await this.setStoreValue('countersAvailable', true);
  }

  getEnergyDiagnostics(): EnergyAccountingDiagnostic {
    let source: EnergyAccountingDiagnostic['source'] = this.lastEnergyTs > 0 ? 'integrated_power' : 'waiting';
    if (this.countersAvailable) source = 'device_counters';
    return {
      source,
      samples: this.energySamples,
      skippedSamples: this.skippedEnergySamples,
      ignoredGaps: this.ignoredEnergyGaps,
      counterResets: this.counterResets,
      chargedCounterSeen: this.chargedRawWh !== undefined,
      dischargedCounterSeen: this.dischargedRawWh !== undefined,
      lastSampleAgeSec: this.lastEnergyTs > 0 ? Math.max(0, Math.round((Date.now() - this.lastEnergyTs) / 1000)) : null,
      chargedKWh: this.chargedWh / 1000,
      dischargedKWh: this.dischargedWh / 1000,
      checkpoint: this.energyCheckpoint?.diagnostics(),
    };
  }

  getCounterContinuityDiagnostics(): Record<string, unknown> {
    const now = Date.now();
    const original = this.reportingObservations.measure_power;
    const originalFresh = original && original.receivedAt <= now && now - original.receivedAt <= 180000
      && this.getLiveReadingFreshness().measure_power?.stale === false;
    let power;
    if (this.monitoringEnabled) {
      if (this.monitoringConditionReady()) power = this.getCapabilityValue('measure_power');
    } else if (originalFresh) power = original.value;
    return this.counterContinuity.snapshot(now, typeof power === 'number' ? power : undefined,
      this.monitoringEnabled ? 'monitoring_system_scope_unverified' : 'original_address');
  }

  private fireTriggers(values: Record<string, number | boolean | string>): void {
    const { flow } = this.homey;
    const pv = values['measure_power.pv'];
    if (typeof pv === 'number' && pv !== this.prevPv) {
      flow.getDeviceTriggerCard('solar_power_changed').trigger(this, { power: pv }).catch(() => {});
      this.prevPv = pv;
    }
    const grid = values['measure_power.grid'];
    if (typeof grid === 'number' && grid !== this.prevGrid) {
      flow.getDeviceTriggerCard('grid_power_changed').trigger(this, { power: grid }).catch(() => {});
      const prevGrid = this.prevGrid ?? grid;
      // Threshold-crossing triggers (import positive; export magnitude = -grid).
      flow.getDeviceTriggerCard('grid_import_above')
        .trigger(this, { power: Math.max(0, Math.round(grid)) }, { power: grid, prevPower: prevGrid })
        .catch(() => {});
      flow.getDeviceTriggerCard('grid_export_above')
        .trigger(this, { power: Math.max(0, Math.round(-grid)) }, { power: -grid, prevPower: -prevGrid })
        .catch(() => {});
      const direction = powerDirection(grid);
      const started = startedDirection(this.prevGridDirection, direction);
      if (started !== null) {
        const card = started < 0 ? 'grid_export_started' : 'grid_import_started';
        flow.getDeviceTriggerCard(card).trigger(this, { power: grid }).catch(() => {});
      }
      this.prevGridDirection = direction;
      this.prevGrid = grid;
    }
    const battPower = values['measure_power'];
    if (typeof battPower === 'number') {
      const direction = powerDirection(battPower);
      const started = startedDirection(this.prevBatteryDirection, direction);
      if (started !== null) {
        const card = started > 0 ? 'charging_started' : 'discharging_started';
        flow.getDeviceTriggerCard(card).trigger(this, { power: battPower }).catch(() => {});
      }
      this.prevBatteryDirection = direction;
    }
    const mode = values['operating_mode'];
    if (typeof mode === 'string' && mode !== this.prevMode) {
      if (this.prevMode !== undefined) {
        flow.getDeviceTriggerCard('operating_mode_changed').trigger(this, { mode }).catch(() => {});
      }
      this.prevMode = mode;
    }
    const soc = values['measure_battery'];
    if (typeof soc === 'number') {
      if (this.prevSoc !== undefined && soc !== this.prevSoc) {
        flow
          .getDeviceTriggerCard('battery_level_crossed')
          .trigger(this, { battery: soc }, { soc, prevSoc: this.prevSoc })
          .catch(() => {});
      }
      this.prevSoc = soc;
    }
  }

  private checkFaults(quota: Record<string, any>): void {
    const codes: Array<[string, string]> = [
      ['invErrCode', 'inverter'],
      ['batErrCode', 'battery'],
      ['llcErrCode', 'llc'],
      ['pv1ErrCode', 'pv1'],
      ['pv2ErrCode', 'pv2'],
    ];
    const current = new Map(this.activeFaults);
    let sawFaultField = false;
    for (const [key, source] of codes) {
      if (!(key in quota)) continue;
      sawFaultField = true;
      const v = Number(quota[key]);
      if (Number.isFinite(v) && v !== 0) {
        current.set(source, v);
      } else {
        current.delete(source);
      }
    }
    if (!sawFaultField) return;
    const isFaulted = current.size > 0;
    if (this.hasCapability('alarm_generic') && this.getCapabilityValue('alarm_generic') !== isFaulted) {
      this.setCapabilityValue('alarm_generic', isFaulted).catch(() => {});
    }
    for (const [source, code] of current) {
      if (this.activeFaults.get(source) !== code) {
        this.homey.flow.getDeviceTriggerCard('fault_raised').trigger(this, { source, code }).catch(() => {});
      }
    }
    if (!isFaulted && this.activeFaults.size > 0) {
      this.homey.flow.getDeviceTriggerCard('fault_cleared').trigger(this).catch(() => {});
    }
    this.activeFaults = current;
  }

  /** Condition + action helpers used by flow cards. */
  isCharging(): boolean {
    if (!this.monitoringConditionReady()) return false;
    return (this.getCapabilityValue('measure_power') as number) > 5;
  }

  isExporting(): boolean {
    if (this.monitoringEnabled || this.monitoringRollbackPending || this.monitoringSettingsCount > 0) return false;
    return (this.getCapabilityValue('measure_power.grid') as number) < -5;
  }

  solarPowerIs(direction: 'above' | 'below', watts: number): boolean {
    try {
      assertLegacyThreshold(direction, watts, 10000);
    } catch {
      throw this.legacyFlowError('arguments');
    }
    if (this.monitoringEnabled || this.monitoringRollbackPending || this.monitoringSettingsCount > 0) return false;
    return aboveBelow(this.getCapabilityValue('measure_power.pv'), direction, watts);
  }

  /** Observed charging with PV above reported load; never proves the energy's origin. */
  isChargingFromSolar(): boolean {
    if (this.monitoringEnabled || this.monitoringRollbackPending || this.monitoringSettingsCount > 0) return false;
    const batt = this.getCapabilityValue('measure_power');
    const pv = this.getCapabilityValue('measure_power.pv');
    const load = this.getCapabilityValue('measure_power.load');
    if (![batt, pv, load].every((value) => typeof value === 'number' && Number.isFinite(value))) return false;
    const surplus = pv - load;
    return batt > 5 && surplus > 5;
  }

  /**
   * Flow action: set the current electricity price (provider-agnostic — fed from
   * any tariff app such as Octopus, Tibber or aWATTar). Exposed as a capability so
   * the widget and price conditions can use it. The display unit follows the
   * device's `price_unit` setting.
   */
  async flowSetElectricityPrice(price: number): Promise<void> {
    if (this.controlStopped || this.isShuttingDown()) throw new Error('Device is shutting down.');
    if (typeof price !== 'number' || !Number.isFinite(price)) throw new Error('Electricity price must be a finite number.');
    const generation = this.controlGeneration;
    const unit = (this.getSetting('price_unit') as string) || 'p/kWh';
    const cap = 'tariff_price_now';
    if (!this.hasCapability(cap)) await this.addCapability(cap).catch((e) => this.error(`add ${cap}`, e));
    await this.setCapabilityOptions(cap, { units: { en: unit } }).catch(() => {});
    await this.setCapabilityValue(cap, price);
    if (this.controlStopped || this.isShuttingDown() || generation !== this.controlGeneration
      || unit !== ((this.getSetting('price_unit') as string) || 'p/kWh')) {
      throw new Error('Electricity price update interrupted; send a fresh price for the current session and unit.');
    }
    this.priceUpdatedAt = Date.now();
  }

  priceIs(direction: 'above' | 'below', threshold: number): boolean {
    const price = this.getCapabilityValue('tariff_price_now');
    if (!currentPriceIsFresh(price, this.priceUpdatedAt)) throw new Error('Electricity price missing or older than 90 minutes; update it before running this Flow.');
    if ((direction !== 'above' && direction !== 'below') || typeof threshold !== 'number' || !Number.isFinite(threshold)) {
      throw new Error('Electricity price comparison needs a valid direction and finite threshold.');
    }
    return aboveBelow(price, direction, threshold);
  }

  /** Condition: current electricity price is negative (paid to consume). */
  priceIsNegative(): boolean {
    const p = this.getCapabilityValue('tariff_price_now');
    if (!currentPriceIsFresh(p, this.priceUpdatedAt)) throw new Error('Electricity price missing or older than 90 minutes; update it before running this Flow.');
    return p < 0;
  }

  async flowRefresh(): Promise<void> {
    await this.poll();
    if (this.getSetting('enable_history') !== false) await this.refreshHistory().catch(() => {});
  }

  async flowSetOperatingMode(mode: OperatingMode): Promise<void> {
    await this.runControl({ kind: 'mode', value: mode });
  }

  async flowSetBackupReserve(level: number): Promise<void> {
    await this.applyBackupReserve(level);
  }

  async flowSetFeedIn(on: boolean): Promise<void> {
    await this.runControl({ kind: 'feed', value: on });
  }

  async flowSetChargeLimit(level: number): Promise<void> {
    await this.runControl({ kind: 'charge', value: level });
  }

  async flowSetDischargeLimit(level: number): Promise<void> {
    await this.runControl({ kind: 'discharge', value: level });
  }

  /**
   * Tariff helper — "prepare for cheap import": raise the backup-reserve target
   * and lift the charge limit to 100%. This is a policy, not a watt target or
   * proof of grid charging; EcoFlow mode/schedule/grid limits still apply.
   */
  async flowPrepareCheapImport(reserve: number): Promise<void> {
    await this.runControl({ kind: 'cheap_import', value: reserve });
  }

  /**
   * Tariff helper — "prepare for peak/export": drop the backup reserve so the
   * battery may discharge, and enable grid feed-in permission. This does not
   * guarantee physical export during a high-price window.
   */
  async flowPreparePeakExport(reserve: number): Promise<void> {
    await this.runControl({ kind: 'peak_export', value: reserve });
  }

  /**
   * Tariff helper — "release battery for export now": drop the reserve (and, in
   * the correct 8524-safe order, the discharge limit) to the minimum and enable
   * feed-in. This permits export; it does not force an immediate physical flow.
   */
  async flowReleaseForExport(): Promise<void> {
    await this.runControl({ kind: 'peak_export', value: 3 });
  }

  /** Battery SoC condition helper. */
  batterySocIs(direction: 'above' | 'below', level: number): boolean {
    try {
      assertLegacyThreshold(direction, level, 100);
    } catch {
      throw this.legacyFlowError('arguments');
    }
    if (!this.monitoringConditionReady()) return false;
    const soc = this.getCapabilityValue('measure_battery') as number;
    if (typeof soc !== 'number') return false;
    return direction === 'above' ? soc > level : soc < level;
  }

  protected async onSettingsChanged(newSettings: any, changedKeys: string[]): Promise<void> {
    if (changedKeys.includes(MONITORING_TRIAL_SETTING)) {
      await this.changeMonitoringSetting(newSettings[MONITORING_TRIAL_SETTING] === true);
    }
    // A cached numeric value in the old unit must not trigger a new-unit threshold.
    if (changedKeys.includes('price_unit')) this.priceUpdatedAt = 0;
    if (changedKeys.includes('enable_history')) {
      if (this.historyTimer) {
        this.homey.clearInterval(this.historyTimer);
        this.historyTimer = null;
      }
      if (newSettings.enable_history !== false) this.startHistory();
    }
    if (changedKeys.includes('solar_forecast') || changedKeys.includes('solar_factor')) {
      this.stopSolarForecast(newSettings.solar_forecast === false);
      if (newSettings.solar_forecast !== false) {
        // onSettings runs before the SDK commits new settings. Never stamp old calibration as new.
        const generation = this.forecastGeneration;
        let attempts = 0;
        const afterCommit = () => {
          this.forecastSettingsTimer = null;
          if (this.isShuttingDown() || generation !== this.forecastGeneration) return;
          const ready = ['solar_forecast', 'solar_factor'].every((key) => newSettings[key] === undefined || this.getSetting(key) === newSettings[key]);
          if (ready) this.startSolarForecast();
          else if (++attempts < 8) this.forecastSettingsTimer = this.homey.setTimeout(afterCommit, 250);
        };
        this.forecastSettingsTimer = this.homey.setTimeout(afterCommit, 0);
      }
    }
  }

  private async changeMonitoringSetting(enable: boolean): Promise<void> {
    if (this.monitoringSettingsCount >= 4) throw new Error('Too many pending monitoring changes; wait before retrying.');
    this.monitoringSettingsCount += 1;
    this.controlGeneration += 1; // Block/cancel commands before awaiting validation or persistence.
    this.legacyFlowReadings = new LegacyFlowReadings();
    const session = this.monitoringSession;
    const checkSession = () => {
      if (this.isShuttingDown() || session !== this.monitoringSession) throw new Error('Monitoring change cancelled.');
    };
    const run = async () => {
      checkSession();
      if (enable) await this.refreshReporterDiagnostics();
      checkSession();
      await this.queueDeviceWork(async () => {
        checkSession();
        const selected = enable ? selectMonitoringReporter(this.homey, this, Date.now(), null, true) : null;
        if (enable && selected?.status !== 'active') throw new Error(this.monitoringMessage('activation'));
        // Persist a Homey device reference, never a replacement paired serial or counter baseline.
        await this.setStoreValue(MONITORING_STATE_STORE, {
          version: 1, mode: enable ? 'trial' : 'rollback', reporterId: selected?.reporterId ?? null,
        });
        checkSession();
        this.monitoringEnabled = enable;
        this.resetLiveReadingReceipts();
        this.resetRemainingTimeReceipts();
        this.monitoringTimeline.record(enable ? 'trial_enabled' : 'rollback_started', Date.now());
        this.monitoringRollbackPending = !enable;
        this.monitoringReporterId = selected?.reporterId ?? null;
        this.monitoringGeneration += 1;
        this.controlGeneration += 1; // Cancel already in-flight control readbacks/writes.
        this.resetMonitoringTriggers();
        if (this.monitoringTimer) this.homey.clearInterval(this.monitoringTimer);
        this.monitoringTimer = null;
        if (enable) {
          this.monitoringResolveAt = Date.now();
          await this.setWarning(this.monitoringMessage('warning')).catch(() => {});
          checkSession();
          await this.applyMonitoringTrial();
          checkSession();
          this.startMonitoringTimer();
        } else {
          this.monitoringStatus = 'disabled';
          this.monitoringCandidate = null;
          // Do not reuse pre-switch receipts/capabilities on rollback; await original telemetry.
          this.reportingObservations = {};
          await this.clearRollbackReadings();
          await this.setWarning(null).catch(() => {});
        }
      });
      checkSession();
    };
    const pending = this.monitoringSettingsChain.then(run).catch((error) => {
      if (session === this.monitoringSession) this.monitoringTimeline.record('setting_failed', Date.now());
      throw error;
    }).finally(() => {
      this.monitoringSettingsCount -= 1;
    });
    this.monitoringSettingsChain = pending.catch(() => {});
    await pending;
  }

  private async clearRollbackReadings(): Promise<void> {
    for (const cap of [...TRIAL_SUPPRESSED_CAPABILITIES, 'measure_battery', 'measure_power', 'battery_charging_state']) {
      if (this.hasCapability(cap)) await this.setCapabilityValue(cap, null).catch(() => {});
    }
    await super.setOnlineState(false, 'Waiting for fresh original battery readings after rollback.');
  }

  protected async onTeardown(): Promise<void> {
    this.legacyFlowReadings = new LegacyFlowReadings();
    this.forecastGeneration += 1;
    this.forecastFlowReadings = new ForecastFlowReadings();
    if (this.forecastSettingsTimer) this.homey.clearTimeout(this.forecastSettingsTimer);
    this.forecastSettingsTimer = null;
    this.limitObservations = new StreamLimitObservations();
    this.stopLiveReadings();
    this.stopRemainingTime();
    this.counterContinuity = new StreamCounterContinuity();
    this.monitoringApplied = null;
    this.monitoringAppliedAt = 0;
    this.monitoringTimeline.record('session_stopped', Date.now());
    this.monitoringSession += 1;
    this.monitoringGeneration += 1;
    if (this.monitoringTimer) this.homey.clearInterval(this.monitoringTimer);
    this.monitoringTimer = null;
    this.monitoringStatus = this.monitoringEnabled ? 'waiting_for_validation' : 'disabled';
    this.monitoringCandidate = null;
    this.controlStopped = true;
    this.controlGeneration += 1;
    this.resolutionCancel?.();
    this.resolvedReporter = null;
    this.mainResolution = null;
    for (const [timer, resolve] of this.controlWaits) {
      this.homey.clearTimeout(timer);
      resolve();
    }
    this.controlWaits.clear();
    if (this.historyTimer) this.homey.clearInterval(this.historyTimer);
    if (this.solarForecastTimer) this.homey.clearInterval(this.solarForecastTimer);
    await this.energyCheckpoint?.flush();
  }

  protected liveReadingsEnabled(): boolean {
    return !this.monitoringEnabled;
  }
};
