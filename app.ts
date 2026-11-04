'use strict';

import Homey from 'homey';
import { randomUUID } from 'crypto';
import { isDeepStrictEqual } from 'util';
import { isEcoflowManagedPower } from './lib/coordinatedPowerMode';
import { houseInstallationSnapshot } from './lib/houseInstallationSnapshot';
import { houseReserveFrame, freshReserveSnapshot, assertHouseNoDischarge } from './lib/houseReserveControl';
import type { ReportingObservation } from './lib/streamReportingDiagnostics';
import { EcoFlowMqtt, QuotaHandler, StatusHandler } from './lib/EcoFlowMqtt';
import { AppFrameHandler, EcoFlowAppMqtt } from './lib/EcoFlowAppMqtt';
import { StreamDiscoveryInventory } from './lib/streamDiscovery';
import { AppDevice } from './lib/appDevices';
import { DualCtResearch } from './lib/dualCtResearch';
import { mergeDualCtInventory, probeDualCtDeveloper, dualCtInventorySummary } from './lib/dualCtSources';
import { EcoFlowClient } from './lib/EcoFlowClient';
import { readStream5000OfficialSoc, Stream5000OfficialSocSample } from './lib/stream5000OfficialSoc';
import { EcoFlowDevice } from './lib/types';
import { CoordinationWorkspace, createHomeyCoordinationReader } from './lib/coordinationWorkspace';
import { CoordinationFlowMonitor } from './lib/coordinationFlowMonitor';
import {
  APP_AUTH_EMAIL_SETTING, APP_AUTH_HOST_SETTING, APP_AUTH_PASSWORD_SETTING,
  appAuthClientFromSettings, getSavedAppAuthCreds,
} from './lib/appAuthPairing';

const APP_AUTH_SETTINGS = [APP_AUTH_EMAIL_SETTING, APP_AUTH_PASSWORD_SETTING, APP_AUTH_HOST_SETTING];

module.exports = class EcoFlowApp extends Homey.App {
  private mqtt: EcoFlowMqtt | null = null;
  private mqttCredsKey = '';
  private appMqtt: EcoFlowAppMqtt | null = null;
  private appMqttCredsKey = '';
  private settingsTimer: NodeJS.Timeout | null = null;
  private appSettingsTimer: NodeJS.Timeout | null = null;
  private stopping = false;
  private pendingRealtime = 0;
  private pendingAppRealtime = 0;
  private releaseResearchMqttWhenIdle = false;
  private readonly streamDiscovery = new StreamDiscoveryInventory();
  private dualCtResearch: DualCtResearch | null = null;
  private dualCtCaptureId: string | null = null;
  private coordinationWorkspace: CoordinationWorkspace | null = null;
  private coordinationFlowMonitor: CoordinationFlowMonitor | null = null;
  private coordinationFlowRevision = 0;
  private readonly settingsHandler = (key: string) => this.onSettingChanged(key);

  async requestCoordinationWorkspace(body: any): Promise<Record<string, any>> {
    if (this.stopping) {
      return {
        state: 'blocked',
        reason: 'session_expired',
        advisoryOnly: true,
        controlsEnabled: false,
        contributesToEnergy: false,
        commandWrites: 0,
      };
    }
    if (!this.coordinationWorkspace) this.coordinationWorkspace = new CoordinationWorkspace((signal) => createHomeyCoordinationReader(this.homey, signal));
    return this.coordinationWorkspace.request(body);
  }

  async onInit(): Promise<void> {
    this.stopping = false;
    if (this.homey.settings.get('houseReserveControl')?.enabled === true) this.ensureHouseReserveWatchdog();
    this.streamDiscovery.clear();
    if (this.homey.flow) {
      this.homey.flow.getConditionCard('smartmeter_grid_power_above').registerRunListener(
        (args: any) => args.device.gridPowerAbove(args.direction, args.watts),
      );
      this.homey.flow.getConditionCard('stream_5000_mode_is').registerRunListener(
        (args: any) => args.device.configurationModeIs(args.mode),
      );
      this.homey.flow.getConditionCard('stream_5000_reserve_enabled').registerRunListener(
        (args: any) => args.device.configurationReserveEnabled(),
      );
      for (const [id, kind] of Object.entries({
        coordination_readings_current: 'current',
        coordination_external_priority: 'priority',
        coordination_grid_export_sustained: 'export',
        coordination_circuit_power_sustained: 'circuit',
      })) {
        this.homey.flow.getConditionCard(id).registerRunListener(async (args: any) => {
          try {
            if (!this.coordinationFlowMonitor) throw new Error('unavailable');
            return this.coordinationFlowMonitor.condition(kind, args);
          } catch {
            // Reject, do not resolve false: inverted conditions must not turn missing data into permission.
            throw new Error(this.homey.__('coordination.flow_condition_error'));
          }
        });
      }
    }
    this.homey.settings.on('set', this.settingsHandler);
    // Removing the app-connected STREAM account is an 'unset', not a 'set' — the
    // app-auth session must be torn down for that too.
    this.homey.settings.on('unset', this.settingsHandler);
    this.log('EcoFlow app initialised');
  }

  private onSettingChanged(key: string): void {
    if (this.stopping) return;
    if (['streamCoordinationBindingsV1', ...APP_AUTH_SETTINGS, 'accessKey', 'secretKey', 'host'].includes(key)) {
      this.coordinationFlowRevision += 1;
      this.coordinationFlowMonitor?.stop('monitor_sources_changed');
      if (key !== 'streamCoordinationBindingsV1') this.coordinationWorkspace?.revoke();
    }
    if (['accessKey', 'secretKey', 'host', 'mqtt_enabled'].includes(key)) {
      this.dualCtResearch?.stop('account_changed', true);
      if (this.settingsTimer) this.homey.clearTimeout(this.settingsTimer);
      this.settingsTimer = this.homey.setTimeout(() => {
        this.settingsTimer = null;
        this.applyConnectionSettings().catch((e) => this.error('Apply connection settings', e));
      }, 250);
    }
    if (APP_AUTH_SETTINGS.includes(key)) {
      this.dualCtResearch?.stop('account_changed', true);
      this.streamDiscovery.clear();
      if (this.appSettingsTimer) this.homey.clearTimeout(this.appSettingsTimer);
      this.appSettingsTimer = this.homey.setTimeout(() => {
        this.appSettingsTimer = null;
        this.applyAppAuthSettings().catch((e) => this.error('Apply app-auth settings', e?.message || e));
      }, 250);
    }
  }

  private async applyConnectionSettings(): Promise<void> {
    if (this.stopping) return;
    if (this.homey.settings.get('mqtt_enabled') === false) {
      await this.mqtt?.end().catch(() => {});
      this.mqtt = null;
      this.mqttCredsKey = '';
      return;
    }
    if (!this.mqtt) return;
    const { accessKey, secretKey, host } = this.getCredentials();
    if (!accessKey || !secretKey) return;
    const credsKey = `${accessKey}:${secretKey}:${host || ''}`;
    this.mqtt.updateOptions({
      accessKey, secretKey, host, log: (...a) => this.log('[mqtt]', ...a),
    });
    this.mqttCredsKey = credsKey;
    await this.mqtt.reconnect();
  }

  async onUninit(): Promise<void> {
    this.stopping = true;
    if (this.houseReserveTimer) this.homey.clearInterval(this.houseReserveTimer);
    this.houseReserveTimer = null;
    this.coordinationFlowRevision += 1;
    this.coordinationFlowMonitor?.shutdown();
    this.coordinationWorkspace?.stop();
    this.dualCtResearch?.stop('stopped', true);
    this.streamDiscovery.clear();
    this.homey.settings.removeListener('set', this.settingsHandler);
    this.homey.settings.removeListener('unset', this.settingsHandler);
    // Close the shared MQTT session cleanly so EcoFlow's broker (one session per
    // account) doesn't reject the next start with a stale ghost connection.
    if (this.settingsTimer) this.homey.clearTimeout(this.settingsTimer);
    if (this.appSettingsTimer) this.homey.clearTimeout(this.appSettingsTimer);
    this.settingsTimer = null;
    this.appSettingsTimer = null;
    await this.mqtt?.end().catch(() => {});
    this.mqtt = null;
    await this.appMqtt?.end().catch(() => {});
    this.appMqtt = null;
    this.appMqttCredsKey = '';
  }

  requestCoordinationFlowMonitor(body: any): Record<string, any> {
    if (body?.action === 'stop') {
      this.coordinationFlowRevision += 1; this.coordinationFlowMonitor?.stop();
    } else if (body?.action === 'start') {
      if (this.stopping) throw new Error('coordination_flow_stopped');
      if (body.expectedRevision !== this.coordinationFlowRevision) throw new Error('coordination_flow_setup_changed');
      this.coordinationFlowRevision += 1;
      if (!this.coordinationFlowMonitor) {
        this.coordinationFlowMonitor = new CoordinationFlowMonitor(() => createHomeyCoordinationReader(this.homey), (event, tokens) => {
          try {
            this.homey.flow.getTriggerCard(event).trigger(tokens).catch(() => {});
          } catch { /* No telemetry/provider error logging. */ }
        }, { now: () => Date.now(), set: (fn, ms) => this.homey.setTimeout(fn, ms), clear: (timer) => this.homey.clearTimeout(timer) });
      }
      return { ...this.coordinationFlowMonitor.start(body), revision: this.coordinationFlowRevision };
    } else if (body?.action !== 'status') throw new Error('coordination_flow_unsupported_action');
    return {
      ...(this.coordinationFlowMonitor?.status() || {
        active: false,
        state: 'disabled',
        reason: 'monitor_disabled',
        advisoryOnly: true,
        controlsEnabled: false,
        contributesToEnergy: false,
        commandWrites: 0,
      }),
      revision: this.coordinationFlowRevision,
    };
  }

  private getCredentials(): { accessKey?: string; secretKey?: string; host?: string } {
    return {
      accessKey: this.homey.settings.get('accessKey'),
      secretKey: this.homey.settings.get('secretKey'),
      host: this.homey.settings.get('host'),
    };
  }

  /** Read-only system SOC; never starts MQTT, commands, pairing or accounting. */
  async readStream5000SystemSoc(sn: string, signal: AbortSignal): Promise<Stream5000OfficialSocSample | null> {
    if (this.stopping || signal.aborted) return null;
    const credentials = this.getCredentials();
    if (!credentials.accessKey || !credentials.secretKey) return null;
    const client = new EcoFlowClient({ accessKey: credentials.accessKey, secretKey: credentials.secretKey, host: credentials.host });
    const sample = await readStream5000OfficialSoc(client, sn, signal);
    const current = this.getCredentials();
    if (this.stopping || signal.aborted || current.accessKey !== credentials.accessKey
      || current.secretKey !== credentials.secretKey || current.host !== credentials.host) return null;
    return sample;
  }

  /** Lazily create and connect the shared MQTT client. Returns null if unconfigured/unavailable. */
  async getMqtt(): Promise<EcoFlowMqtt | null> {
    if (this.stopping) return null;
    const { accessKey, secretKey, host } = this.getCredentials();
    if (!accessKey || !secretKey) return null;
    if (this.homey.settings.get('mqtt_enabled') === false) return null;

    // Update credentials/region in place if they changed (keeps subscriptions).
    const credsKey = `${accessKey}:${secretKey}:${host || ''}`;
    if (this.mqtt && credsKey !== this.mqttCredsKey) {
      this.mqtt.updateOptions({
        accessKey, secretKey, host, log: (...a) => this.log('[mqtt]', ...a),
      });
      this.mqttCredsKey = credsKey;
      try {
        await this.mqtt.reconnect();
        return this.mqtt;
      } catch (e: any) {
        this.error('MQTT reconnect failed; falling back to polling', e?.message || e);
        return null;
      }
    }
    if (!this.mqtt) {
      this.mqtt = new EcoFlowMqtt({
        accessKey, secretKey, host, log: (...a) => this.log('[mqtt]', ...a),
      });
      this.mqttCredsKey = credsKey;
    }
    try {
      await this.mqtt.connect();
      return this.mqtt;
    } catch (e: any) {
      this.error('MQTT connect failed; falling back to polling', e?.message || e);
      return null;
    }
  }

  /** Subscribe a device SN to realtime updates. Safe no-op if MQTT is unavailable. */
  async subscribeRealtime(sn: string, onQuota: QuotaHandler, onStatus?: StatusHandler, active: () => boolean = () => true): Promise<boolean> {
    if (this.stopping || !active()) return false;
    this.pendingRealtime += 1;
    try {
      const mqtt = await this.getMqtt();
      if (this.stopping || !active() || !mqtt || mqtt !== this.mqtt) return false;
      mqtt.subscribe(sn, onQuota, onStatus);
      return true;
    } finally {
      this.pendingRealtime -= 1;
      this.releaseResearchMqtt();
    }
  }

  unsubscribeRealtime(sn: string, onQuota?: QuotaHandler, onStatus?: StatusHandler): void {
    this.mqtt?.unsubscribe(sn, onQuota, onStatus);
  }

  private releaseResearchMqtt(): void {
    if (!this.releaseResearchMqttWhenIdle || this.pendingRealtime > 0) return;
    this.releaseResearchMqttWhenIdle = false;
    if (!this.mqtt || this.mqtt.hasSubscribers) return;
    const { mqtt } = this;
    this.mqtt = null; this.mqttCredsKey = '';
    mqtt.end().catch(() => {});
  }

  private unsubscribeResearchRealtime(sn: string, onQuota: QuotaHandler): void {
    this.unsubscribeRealtime(sn, onQuota);
    this.releaseResearchMqttWhenIdle = true;
    this.releaseResearchMqtt();
  }

  // ----- App-auth realtime (verified STREAM 5000-family adapters) ------------

  /** Observe only an already-requested pairing list; no cloud call or subscription. */
  beginStreamDiscoveryObservation(): (devices: AppDevice[]) => void {
    if (this.stopping) return () => {};
    return this.streamDiscovery.beginObservation();
  }

  getStreamDiscoveryEvidence(): Record<string, unknown> | null {
    return this.streamDiscovery.evidenceSnapshot();
  }

  /** Explicit settings action only: no automatic discovery, pairing or Energy source. */
  async startDualCtResearch(previewEnabled = false, counterPreviewEnabled = false): Promise<Record<string, unknown>> {
    if (this.stopping) return { status: 'stopped' };
    const reused = !!this.dualCtResearch && ['discovering', 'listening'].includes(this.dualCtResearch.snapshot().status as string);
    if (!reused) {
      // Each manual capture owns its clients/inventory; late prior-account lists
      // cannot overwrite the current capture's transport authorisation.
      this.dualCtResearch?.stop('stopped', true);
      // Local UI correlation only; never an account/device identity or report field.
      this.dualCtCaptureId = randomUUID();
      let developer: EcoFlowClient | null = null;
      let developerInventory: EcoFlowDevice[] = [];
      let inventorySummary: unknown = [];
      this.dualCtResearch = new DualCtResearch({
        previewEnabled: previewEnabled === true,
        counterPreviewEnabled: previewEnabled === true && counterPreviewEnabled === true,
        inventory: () => inventorySummary,
        list: async () => {
          const credentials = this.getCredentials();
          developer = null;
          try {
            if (credentials.accessKey && credentials.secretKey) {
              developer = new EcoFlowClient({ accessKey: credentials.accessKey, secretKey: credentials.secretKey, host: credentials.host });
            }
          } catch { /* An unavailable Developer configuration must not block app discovery. */ }
          const observations = await Promise.allSettled([
            (async () => {
              const client = appAuthClientFromSettings(this.homey);
              if (!client) throw new Error('App account unavailable');
              return client.getDeviceList();
            })(),
            developer ? developer.getDeviceList() : Promise.reject(new Error('Developer account unavailable')),
          ]);
          const appInventory = observations[0].status === 'fulfilled' ? observations[0].value as AppDevice[] : [];
          developerInventory = observations[1].status === 'fulfilled' ? observations[1].value as EcoFlowDevice[] : [];
          inventorySummary = dualCtInventorySummary(appInventory, developerInventory, observations.map((result) => result.status === 'fulfilled'));
          if (observations.every((result) => result.status === 'rejected')) throw new Error('Discovery unavailable');
          return mergeDualCtInventory(appInventory, developerInventory);
        },
        subscribe: (sn, handler, active) => this.subscribeAppRealtime(sn, handler, active),
        unsubscribe: (sn, handler) => this.unsubscribeAppRealtime(sn, handler),
        developerSubscribe: (sn, handler, active) => this.subscribeRealtime(sn, handler, undefined, active),
        developerUnsubscribe: (sn, handler) => this.unsubscribeResearchRealtime(sn, handler),
        probe: (sn, active) => (developer ? probeDualCtDeveloper(developer, sn, developerInventory, active) : Promise.resolve([])),
        timer: (fn, ms) => this.homey.setTimeout(fn, ms),
        cancel: (timer) => this.homey.clearTimeout(timer),
      });
    }
    const capture = this.dualCtResearch!;
    await capture.start();
    const research = this.getDualCtResearchSnapshot();
    const effective = (research.previewDiagnostics as { enabled?: boolean } | undefined)?.enabled === true;
    const effectiveCounter = (research.previewDiagnostics as any)?.counterResearch?.enabled === true;
    return {
      ...research,
      captureStart: {
        reused,
        superseded: capture !== this.dualCtResearch,
        requestedPreviewEnabled: previewEnabled === true,
        effectivePreviewEnabled: effective,
        requestedCounterPreviewEnabled: previewEnabled === true && counterPreviewEnabled === true,
        effectiveCounterPreviewEnabled: effectiveCounter,
        requiresRestart: ['discovering', 'listening'].includes(research.status as string) && (effective !== (previewEnabled === true)
          || effectiveCounter !== (previewEnabled === true && counterPreviewEnabled === true)),
      },
    };
  }

  stopDualCtResearch(): Record<string, unknown> {
    this.dualCtResearch?.stop();
    return this.getDualCtResearchSnapshot();
  }

  getDualCtResearchSnapshot(): Record<string, unknown> {
    return {
      ...(this.dualCtResearch?.snapshot() || { status: 'not_started', contributesToEnergy: false, controlsEnabled: false }),
      appVersion: this.homey.manifest?.version || 'unknown',
    };
  }

  getDualCtPreviewSnapshot(): Record<string, unknown> {
    return {
      ...(this.dualCtResearch?.previewSnapshot() || { enabled: false, reason: 'disabled', devices: [] }),
      appVersion: this.homey.manifest?.version || 'unknown',
      captureId: this.dualCtCaptureId,
    };
  }

  /** Explicit local view only. Numeric preview remains separate from support exports. */
  getDualCtResearchView(): Record<string, unknown> {
    return {
      captureId: this.dualCtCaptureId,
      research: this.getDualCtResearchSnapshot(),
      preview: this.getDualCtPreviewSnapshot(),
    };
  }

  /** Identity of the saved EcoFlow account, without exposing the password. */
  private appAuthCredsKey(): string {
    const { email, password, host } = getSavedAppAuthCreds(this.homey);
    if (!email || !password) return '';
    // Length only: enough to notice a change, useless to anyone reading a log.
    return `${email}:${password.length}:${host || ''}`;
  }

  private async applyAppAuthSettings(): Promise<void> {
    if (this.stopping) return;
    const credsKey = this.appAuthCredsKey();
    if (!credsKey) {
      await this.appMqtt?.end().catch(() => {});
      this.appMqtt = null;
      this.appMqttCredsKey = '';
      return;
    }
    if (!this.appMqtt || credsKey === this.appMqttCredsKey) return;
    const client = appAuthClientFromSettings(this.homey, (...a) => this.log('[app-mqtt]', ...a));
    if (!client) return;
    this.appMqtt.updateClient(client);
    this.appMqttCredsKey = credsKey;
    await this.appMqtt.reconnect();
  }

  /**
   * Lazily create and connect the app-auth (WSS) MQTT session.
   * Returns null when no EcoFlow account is configured or the connect failed —
   * there is no REST fallback for this path, so devices simply stay stale.
   */
  private houseReserveBusy = false;
  private coordinatedReserveBusy = false;
  private houseReserveTimer: NodeJS.Timeout | null = null;
  private coordinatedReadInFlight: Promise<Record<string, unknown>> | null = null;
  private coordinatedOfficeReadInFlight: Promise<void> | null = null;
  private officeCoordinationProof: { binding: string; office: any; members: any[]; until: number } | null = null;
  private officeCoordinationRevision = 0;
  private officeReserveOperation: { controller: AbortController; deadline: number; purpose: 'dispatch' | 'restoration'; assertActive: () => void } | null = null;

  private async writeOwnedOfficeReserve(office: any, percent: number, assertAuthority: () => void, deadline: number, purpose: 'dispatch' | 'restoration' = 'dispatch'): Promise<void> {
    if (this.officeReserveOperation) throw new Error('Office reserve command already pending');
    const controller = new AbortController();
    const operation = {
      controller, deadline: Math.min(deadline, Date.now() + 45000), purpose, assertActive: () => {},
    };
    const assertActive = () => {
      if (controller.signal.aborted || Date.now() >= operation.deadline) throw new Error('Office reserve command deadline expired');
      assertAuthority();
    };
    operation.assertActive = assertActive;
    this.officeReserveOperation = operation;
    let timer: NodeJS.Timeout | undefined;
    let cancelled: (() => void) | undefined;
    const expired = new Promise<never>((_, reject) => {
      cancelled = () => reject(new Error('Office reserve command cancelled or deadline expired'));
      controller.signal.addEventListener('abort', cancelled, { once: true });
      timer = this.homey.setTimeout(() => {
        controller.abort();
      }, Math.max(1, operation.deadline - Date.now()));
    });
    try {
      assertActive();
      await Promise.race([office.flowSetBackupReserve(percent, { signal: controller.signal, assertActive }), expired]);
      assertActive();
    } finally {
      if (cancelled) controller.signal.removeEventListener('abort', cancelled);
      controller.abort();
      if (timer) this.homey.clearTimeout(timer);
      if (this.officeReserveOperation === operation) this.officeReserveOperation = null;
    }
  }

  private officeLeaseOwned(gate: any, reserve: number): boolean {
    const lease = this.homey.settings.get('houseReserveLease');
    return !!lease && !lease.completed && !lease.fault && lease.controlScope !== 'house-only'
      && lease.officeDeviceId === gate.officeDeviceId && lease.officeRestoreReserve === gate.officeRestoreReserve
      && lease.officeExpectedReserve === reserve
      && (gate.controlScope !== 'coordinated-installations'
        || (lease.guardScope === gate.controlScope && lease.guardBinding === JSON.stringify(gate)));
  }

  private async boundedReserveRead<T>(read: Promise<T>, deadline: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const until = Math.min(deadline, Date.now() + 45000);
    try {
      const result = await Promise.race([read, new Promise<never>((_, reject) => {
        timer = this.homey.setTimeout(() => reject(new Error('Coordinated read deadline expired')), Math.max(1, until - Date.now()));
      })]);
      if (Date.now() >= until) throw new Error('Coordinated read deadline expired');
      return result;
    } finally {
      if (timer) this.homey.clearTimeout(timer);
    }
  }

  private validateCoordinatedPowerBudget(gate: any, requireOffice = false): any {
    const budget = gate?.powerBudget;
    if (isEcoflowManagedPower(budget) && gate.controlScope === 'coordinated-installations') return budget;
    if (budget?.schemaVersion !== 1 || (budget.mode !== undefined && budget.mode !== 'conservative')
      || !Number.isFinite(budget.wholePropertyImportLimitKw)
      || budget.wholePropertyImportLimitKw <= 0 || budget.wholePropertyImportLimitKw > 7.2
      || budget.wholePropertyImportLimitKw * 1000 !== gate.wholePropertyGridLimitW
      || (budget.spaceImportLimitKw?.house ?? NaN) * 1000 !== gate.houseSpaceGridLimitW
      || (budget.spaceImportLimitKw?.office ?? NaN) * 1000 !== gate.officeSpaceGridLimitW
      || !Number.isFinite(budget.marginKw) || budget.marginKw < 0
      || budget.marginKw >= budget.wholePropertyImportLimitKw
      || !Number.isFinite(budget.maxObservationAgeSec) || budget.maxObservationAgeSec <= 0
      || budget.maxObservationAgeSec > 30
      || (budget.houseSpaceBoundary !== undefined && !['whole-property', 'house-excluding-office'].includes(budget.houseSpaceBoundary))
      || (budget.houseSpaceBoundary === 'house-excluding-office' && gate.houseSpaceBoundaryReviewed !== true)
      || !Number.isFinite(budget.maxPowerSkewSec ?? 1) || (budget.maxPowerSkewSec ?? 1) < 0
      || (budget.maxPowerSkewSec ?? 1) > 30) throw new Error('Reviewed coordinated power budget required');
    const validateBound = (bound: any, maxKw: number) => {
      const commissioned = Date.parse(bound?.commissionedAt);
      const expires = Date.parse(bound?.validUntil);
      if (!Number.isFinite(bound?.maxKw) || bound.maxKw <= 0 || bound.maxKw !== maxKw
        || typeof bound.evidenceId !== 'string' || !bound.evidenceId.trim()
        || typeof bound.commissionedAt !== 'string' || typeof bound.validUntil !== 'string'
        || !Number.isFinite(commissioned) || commissioned > Date.now()
        || !Number.isFinite(expires) || expires <= Date.now() || expires <= commissioned) {
        throw new Error('Commissioned native charging bound missing or expired');
      }
    };
    validateBound(budget.nativeChargeBounds?.house, gate.houseNativeChargeKw);
    if (requireOffice) {
      validateBound(budget.nativeChargeBounds?.office, gate.officeNativeChargeKw);
      if (gate.officeNativeChargeKw * 1000 > gate.officeSpaceGridLimitW) throw new Error('Office native charge bound exceeds Space limit');
    }
    return budget;
  }

  private coordinatedGridReading(gate: any): { signedImportW: number; observedAt: number } {
    if (gate?.controlScope !== 'coordinated-installations'
      || !Number.isFinite(gate.wholePropertyGridLimitW) || gate.wholePropertyGridLimitW <= 0
      || gate.wholePropertyGridLimitW > 7200 || typeof gate.wholePropertyMeterDeviceId !== 'string'
      || gate.wholePropertyMeterScopeReviewed !== true
      || !Number.isFinite(gate.houseSpaceGridLimitW) || gate.houseSpaceGridLimitW <= 0
      || gate.houseSpaceGridLimitW > 7200 || !Number.isFinite(gate.officeSpaceGridLimitW)
      || gate.officeSpaceGridLimitW <= 0 || gate.officeSpaceGridLimitW > 7200
      || !Number.isFinite(gate.houseNativeChargeKw) || gate.houseNativeChargeKw <= 0
      || gate.houseNativeChargeKw * 1000 > gate.houseSpaceGridLimitW) throw new Error('Reviewed coordinated power boundaries required');
    const budget = this.validateCoordinatedPowerBudget(gate);
    const matches = (this.homey.drivers.getDriver('smartmeter_dual_ct_energy').getDevices() as any[])
      .filter((d) => d.getId() === gate.wholePropertyMeterDeviceId);
    if (matches.length !== 1 || !matches[0].getAvailable()) throw new Error('Whole-property meter unavailable');
    const reading = matches[0].getCoordinatedGridReading?.();
    const now = Date.now();
    if (!reading || !Number.isFinite(reading.signedImportW) || !Number.isFinite(reading.observedAt)
      || reading.observedAt > now || now - reading.observedAt > budget.maxObservationAgeSec * 1000) throw new Error('Whole-property meter receipt stale');
    return reading;
  }

  private officeCoordinationBinding(office: any, gate: any): string {
    const offices = this.homey.drivers.getDriver('stream').getDevices() as any[];
    const enrolled = offices.filter((d) => d.getId() === gate?.officeDeviceId);
    const recovery = office?.getReportingDiagnostics?.()?.aggregateRecovery;
    if (this.stopping || enrolled.length !== 1 || enrolled[0] !== office || !office?.getAvailable()
      || recovery?.state !== 'verified_original_main') throw new Error('Office aggregate identity unverified');
    const ids = gate?.officeMemberDeviceIds;
    if (!Array.isArray(ids) || ids.length !== 6 || new Set(ids).size !== ids.length
      || ids.some((id: any) => typeof id !== 'string' || !id)
      || !gate.officeMemberSerials || Object.keys(gate.officeMemberSerials).length !== ids.length) {
      throw new Error('Explicit six-member office binding required');
    }
    const serials = ids.map((id: string) => gate.officeMemberSerials[id]);
    if (serials.some((sn: any) => typeof sn !== 'string' || !sn) || new Set(serials).size !== ids.length
      || !serials.includes(gate.officeMainSerial)
      || typeof office?.getCoordinationMainSn !== 'function') throw new Error('Office member identity unverified');
    const units = this.homey.drivers.getDriver('stream_unit').getDevices() as any[];
    ids.forEach((id: string) => {
      const matches = units.filter((d) => d.getId() === id);
      if (matches.length !== 1 || !matches[0].getAvailable()
        || matches[0].getData()?.sn !== gate.officeMemberSerials[id]
        || typeof matches[0].getCoordinationMainSn !== 'function') throw new Error('Office member unavailable or changed');
      const soc = matches[0].getCapabilityValue('measure_battery');
      const receipt = matches[0].getReadingDiagnostics()?.measure_battery;
      if (!Number.isFinite(soc) || soc < 0 || soc > 100 || receipt?.stale !== false
        || receipt.applicationStatus !== 'applied' || !Number.isFinite(receipt.ageSec)
        || receipt.ageSec < 0 || receipt.ageSec > 300) throw new Error('Office member SOC receipt stale');
    });
    return JSON.stringify({
      ids, serials, main: gate.officeMainSerial, officeId: gate.officeDeviceId, recovery,
    });
  }

  // The raw work retains its lifetime after a timeout: transports are not cancelled
  // by Promise.race. The read-only single flight tracks this work, not its timeout.
  private async officeCoordinationMembershipWork(office: any, gate: any, deadline: number, assertActive: () => void): Promise<void> {
    const revision = ++this.officeCoordinationRevision;
    this.officeCoordinationProof = null;
    const snapshot = JSON.stringify(gate);
    const lease = JSON.stringify(this.homey.settings.get('houseReserveLease'));
    const until = Math.min(deadline, Date.now() + 45000);
    const check = () => {
      if (this.stopping || revision !== this.officeCoordinationRevision || !Number.isFinite(until) || Date.now() >= until
        || JSON.stringify(this.homey.settings.get('houseReserveControl')) !== snapshot
        || JSON.stringify(this.homey.settings.get('houseReserveLease')) !== lease) throw new Error('Office membership verification expired or superseded');
      assertActive();
    };
    try {
      check();
      const binding = this.officeCoordinationBinding(office, gate);
      const units = this.homey.drivers.getDriver('stream_unit').getDevices() as any[];
      const members = gate.officeMemberDeviceIds.map((id: string) => units.find((d) => d.getId() === id));
      const main = await office.getCoordinationMainSn();
      check();
      if (binding !== this.officeCoordinationBinding(office, gate)) throw new Error('Office membership changed during verification');
      if (main !== gate.officeMainSerial) throw new Error('Office main differs from reviewed membership');
      // Keep the read-only flight occupied until every transport settles, even
      // when one member rejects while another is still stalled.
      const resolved = await Promise.allSettled(members.map((member: any) => {
        try {
          return Promise.resolve(member.getCoordinationMainSn());
        } catch (error) {
          return Promise.reject(error);
        }
      }));
      check();
      const currentUnits = this.homey.drivers.getDriver('stream_unit').getDevices() as any[];
      if (binding !== this.officeCoordinationBinding(office, gate)
        || members.some((member: any) => currentUnits.find((d) => d.getId() === member.getId()) !== member)
        || resolved.some((result) => result.status !== 'fulfilled' || result.value !== main)) throw new Error('Office membership topology changed');
      this.officeCoordinationProof = {
        binding, office, members, until: Date.now() + 90000,
      };
    } catch (error) {
      // An old failed lookup must not erase a newer successful verification.
      if (revision === this.officeCoordinationRevision) this.officeCoordinationProof = null;
      throw error;
    }
  }

  private async verifyOfficeCoordinationMembership(office: any, gate: any, deadline = Date.now() + 45000, assertActive = () => {}): Promise<void> {
    const until = Math.min(deadline, Date.now() + 45000);
    const work = this.officeCoordinationMembershipWork(office, gate, until, assertActive);
    const revision = this.officeCoordinationRevision;
    try {
      await this.boundedReserveRead(work, until);
    } catch (error) {
      if (revision === this.officeCoordinationRevision) {
        this.officeCoordinationRevision += 1;
        this.officeCoordinationProof = null;
      }
      throw error;
    }
  }

  private officeCoordinationMembershipCurrent(office: any, gate: any): boolean {
    const proof = this.officeCoordinationProof;
    if (!proof || proof.until <= Date.now() || proof.office !== office) return false;
    try {
      const units = this.homey.drivers.getDriver('stream_unit').getDevices() as any[];
      return JSON.stringify(this.homey.settings.get('houseReserveControl')) === JSON.stringify(gate)
        && proof.binding === this.officeCoordinationBinding(office, gate)
        && proof.members.every((member) => units.find((d) => d.getId() === member.getId()) === member);
    } catch {
      return false;
    }
  }

  async refreshCoordinatedReadings(): Promise<Record<string, unknown>> {
    if (this.coordinatedReadInFlight) return this.coordinatedReadInFlight;
    this.coordinatedReadInFlight = this.readCoordinatedDevices().finally(() => {
      this.coordinatedReadInFlight = null;
    });
    return this.coordinatedReadInFlight;
  }

  private async readCoordinatedDevices(): Promise<Record<string, unknown>> {
    const gate = this.homey.settings.get('houseReserveControl');
    const houseOnly = gate?.controlScope === 'house-only';
    const house = (this.homey.drivers.getDriver('stream_5000_unit').getDevices() as any[]).find((d) => d.getId() === gate?.deviceId && d.getData()?.sn === gate?.serial);
    const office = (this.homey.drivers.getDriver('stream').getDevices() as any[]).find((d) => d.getId() === gate?.officeDeviceId);
    const dual = gate?.controlScope === 'coordinated-installations';
    if (!house || (!houseOnly && !office && !dual) || !/^ES21[A-Z0-9]{4,60}$/.test(gate.serial)) throw new Error('Explicit coordinated read mapping required');
    const installation = Array.isArray(gate.houseMemberDeviceIds);
    const powerKey = 'stream_unit_power_battery_flow';
    const previousPowerAt = house.getAppliedReadingAt(powerKey);
    const requestedAt = Date.now();
    let officeRead: Promise<void> | null = null;
    if (!houseOnly && office) {
      if (dual && office.getAvailable()) {
        if (!this.coordinatedOfficeReadInFlight) {
          const deadline = Date.now() + 45000;
          const snapshot = JSON.stringify(gate);
          const lease = JSON.stringify(this.homey.settings.get('houseReserveLease'));
          const revision = ++this.officeCoordinationRevision;
          // A proof completed after the short House wait must remain usable on
          // the next read. Reusing it never renews its original 90-second expiry.
          if (!this.officeCoordinationMembershipCurrent(office, gate)) this.officeCoordinationProof = null;
          const assertActive = () => {
            if (this.stopping || Date.now() >= deadline
              || JSON.stringify(this.homey.settings.get('houseReserveControl')) !== snapshot
              || JSON.stringify(this.homey.settings.get('houseReserveLease')) !== lease) throw new Error('Office read expired or superseded');
          };
          const pending: Promise<void> = Promise.resolve().then(async () => {
            assertActive();
            await office.flowRefresh();
            assertActive();
            if (revision !== this.officeCoordinationRevision) throw new Error('Office read superseded');
            if (!this.officeCoordinationMembershipCurrent(office, gate)) {
              await this.officeCoordinationMembershipWork(office, gate, deadline, assertActive);
            }
          }).catch(() => {
            if (revision === this.officeCoordinationRevision) this.officeCoordinationProof = null;
          }).finally(() => {
            if (this.coordinatedOfficeReadInFlight === pending) this.coordinatedOfficeReadInFlight = null;
          });
          this.coordinatedOfficeReadInFlight = pending;
        }
        officeRead = this.coordinatedOfficeReadInFlight;
      } else if (!dual) await office.flowRefresh();
    }
    const houseFresh = (): boolean => {
      if (installation) {
        try {
          const r = houseInstallationSnapshot(gate, this.homey.drivers.getDriver('stream_5000_unit').getDevices());
          return r.socAgeSec <= 10 && r.powerAgeSec <= 10 && Date.now() - (r.powerAgeSec + 1) * 1000 >= requestedAt;
        } catch {
          return false;
        }
      }
      const fields = house.getReadingDiagnostics();
      const powerAt = house.getAppliedReadingAt(powerKey);
      if (!Number.isFinite(powerAt) || powerAt < requestedAt || powerAt <= (previousPowerAt ?? 0)) return false;
      return ['measure_battery', powerKey].every((key) => {
        const f = fields[key];
        return f?.stale === false && f.applicationStatus === 'applied' && Number.isFinite(f.ageSec) && f.ageSec >= 0 && f.ageSec <= 10
          && Number.isFinite(house.getCapabilityValue(key));
      });
    };
    if (!this.appMqtt?.connected) throw new Error('House read connection unavailable');
    if (installation) {
      for (const d of this.homey.drivers.getDriver('stream_5000_unit').getDevices() as any[]) {
        if (gate.houseMemberDeviceIds.includes(d.getId())) {
          const fields = d.getConfigurationDiagnostics()?.values;
          const keys = ['backupReserveEnabled', 'backupReservePct', 'mode', 'tasks', ...(gate.houseSpaceGridLimitW !== undefined ? ['maxGridInputW'] : [])];
          const soc = d.getReadingDiagnostics()?.measure_battery;
          if (soc?.stale !== false || !Number.isFinite(soc.ageSec) || soc.ageSec < 0 || soc.ageSec > 5 || keys.some((key) => fields?.[key]?.stale !== false
            || !Number.isFinite(fields[key].ageSec)
            || fields[key].ageSec < 0
            || fields[key].ageSec > 600)) await this.appMqtt.requestHouseRead(d.getData().sn);
        }
      }
    }
    await this.appMqtt.requestHouseRead(gate.serial);
    for (let i = 0; i < 12 && !houseFresh(); i++) {
      await new Promise<void>((resolve) => {
        this.homey.setTimeout(resolve, 500);
      });
    }
    if (officeRead) {
      let timeout: NodeJS.Timeout;
      await Promise.race([officeRead, new Promise<void>((resolve) => {
        timeout = this.homey.setTimeout(resolve, 1000);
      })]);
      this.homey.clearTimeout(timeout!);
    }
    const observations: Record<string, ReportingObservation> = houseOnly ? {} : office?.getReportingDiagnostics()?.observations || {};
    const officeFresh = (!dual || (office?.getAvailable() === true
      && office?.getReportingDiagnostics()?.aggregateRecovery?.state === 'verified_original_main'))
      && ['measure_battery', 'measure_power'].every((key) => {
        const f = observations[key];
        return f && Number.isFinite(f.value) && Number.isFinite(f.receivedAt) && f.receivedAt > 0 && f.receivedAt <= Date.now() && Date.now() - f.receivedAt <= 10000;
      });
    let wholeProperty: { signedImportW: number; observedAt: number } | null = null;
    const managed = dual && isEcoflowManagedPower(gate.powerBudget);
    if (dual && !managed) {
      try {
        wholeProperty = this.coordinatedGridReading(gate);
      } catch {
        // Missing meter never authorizes control.
      }
    }
    const freshHouse = houseFresh();
    const houseView = installation && freshHouse
      ? houseInstallationSnapshot(gate, this.homey.drivers.getDriver('stream_5000_unit').getDevices()) : null;
    if (dual && houseView) {
      houseView.noDischargeHoldVerified = this.houseGroupNoDischargeVerified(gate, houseView);
      houseView.houseChargingVerified = (managed || wholeProperty !== null) && this.houseChargingAuthorityVerified(gate, houseView);
    }
    let officePowerBudgetReady = false;
    if (dual && (managed || wholeProperty)) {
      try {
        // Fresh power/membership is not proof of an explicitly clear alarm.
        // Advertise managed command eligibility using the dispatch guard itself.
        if (managed) this.assertOfficeCoordinationPreflight(office, gate);
        else this.validateCoordinatedPowerBudget(gate, true);
        officePowerBudgetReady = true;
      } catch {
        // An unqualified Office remains read-only; House-only proof is separate.
      }
    }
    const reportedAt = Date.now();
    const stopLease = managed ? this.homey.settings.get('houseReserveLease') : null;
    let officeDischarge = null;
    if (dual) {
      try {
        const power = this.officeDischargeReading(office, gate, reportedAt);
        officeDischarge = {
          schemaVersion: 1,
          qualified: true,
          deviceId: gate.officeDeviceId,
          capturedAt: new Date(reportedAt).toISOString(),
          batteryW: power.value,
          powerAgeSec: (reportedAt - power.receivedAt) / 1000,
          powerAgeUncertaintySec: 0,
        };
      } catch {
        // Unknown discharge cannot become a zero-watt headroom assumption.
      }
    }
    const powerBudgetReceipt = wholeProperty ? {
      schemaVersion: 1,
      wholePropertyImportLimitKw: gate.powerBudget.wholePropertyImportLimitKw,
      spaceImportLimitKw: { ...gate.powerBudget.spaceImportLimitKw },
      marginKw: gate.powerBudget.marginKw,
      maxObservationAgeSec: gate.powerBudget.maxObservationAgeSec,
      houseMaxKw: gate.powerBudget.nativeChargeBounds.house.maxKw,
      officeMaxKw: officePowerBudgetReady ? gate.powerBudget.nativeChargeBounds.office.maxKw : null,
    } : null;
    return {
      houseFresh: freshHouse,
      ...(houseView ? { house: houseView } : {}),
      officeFresh,
      officeRequired: !houseOnly,
      ...(dual ? {
        officeDischarge,
        ...(managed ? { nativeControlDeadline: gate.mode === 'pilot' ? gate.expiresAt : null } : {}),
        ...(managed && officeFresh && officePowerBudgetReady ? {
          office: {
            deviceId: gate.officeDeviceId,
            controlContract: 'ecoflow-managed-v1',
            qualified: true,
            capturedAt: new Date(reportedAt).toISOString(),
            // Acknowledgement of the preceding owned, physically verified stop,
            // not an invented AC meter. House release re-verifies physical stop.
            ownedStopAcknowledged: stopLease?.officeStopped === true && stopLease.until > reportedAt
              && office.getCapabilityValue('backup_reserve_soc') === gate.officeRestoreReserve
              && this.officeLeaseOwned(gate, gate.officeRestoreReserve),
          },
        } : {}),
        wholeProperty,
        powerBudgetSupported: managed || wholeProperty !== null,
        officePowerBudgetReady,
        powerBudgetReceipt: managed ? { ...gate.powerBudget } : powerBudgetReceipt,
        propertyPower: wholeProperty ? {
          capturedAt: new Date(reportedAt).toISOString(),
          ageSec: (reportedAt - wholeProperty.observedAt) / 1000,
          propertyImportW: Math.max(0, wholeProperty.signedImportW),
        } : null,
      } : {}),
      requested: true,
      checkedAt: Date.now(),
      settingsWrites: 0,
    };
  }

  private officeChargingWatts(office: any, maxAgeMs = 30000): number {
    const fields = office.getReportingDiagnostics()?.observations;
    const power: ReportingObservation | undefined = fields?.measure_power;
    if (!power || !Number.isFinite(power.value) || !Number.isFinite(power.receivedAt)
      || power.receivedAt <= 0 || power.receivedAt > Date.now() || Date.now() - power.receivedAt > maxAgeMs) throw new Error('Office battery power receipt unavailable');
    return Math.max(0, power.value);
  }

  private officeDischargeReading(office: any, gate: any, now = Date.now()): ReportingObservation {
    const diagnostics = office?.getReportingDiagnostics();
    const power: ReportingObservation | undefined = diagnostics?.observations?.measure_power;
    const maxAgeSec = gate.powerBudget?.maxObservationAgeSec;
    if (office?.getId() !== gate.officeDeviceId || !office?.getAvailable()
      || diagnostics?.aggregateRecovery?.state !== 'verified_original_main'
      || !this.officeCoordinationMembershipCurrent(office, gate)
      || !Number.isFinite(maxAgeSec) || maxAgeSec <= 0 || maxAgeSec > 30
      || !power || !Number.isFinite(power.value) || !Number.isFinite(power.receivedAt)
      || power.receivedAt <= 0 || power.receivedAt > now
      || now - power.receivedAt > maxAgeSec * 1000) {
      throw new Error('Office discharge receipt unavailable');
    }
    return power;
  }

  private officeMembersNotCharging(stoppedAfter?: number): boolean | undefined {
    const ids = this.homey.settings.get('houseReserveControl')?.officeMemberDeviceIds;
    if (ids === undefined) return undefined;
    if (!Array.isArray(ids) || !ids.length || ids.length > 16 || new Set(ids).size !== ids.length
      || ids.some((id) => typeof id !== 'string' || !id)) return false;
    const units = this.homey.drivers.getDriver('stream_unit').getDevices() as any[];
    let total = 0;
    for (const id of ids) {
      const matches = units.filter((d) => d.getId() === id);
      if (matches.length !== 1 || !matches[0].getAvailable()) return false;
      const unit = matches[0];
      const key = 'stream_unit_power_battery_flow';
      const field = unit.getReadingDiagnostics()?.[key];
      const watts = unit.getCapabilityValue(key);
      if (field?.stale !== false || field.applicationStatus !== 'applied'
        || !Number.isFinite(field.ageSec) || field.ageSec < 0 || field.ageSec > 90
        || !Number.isFinite(watts) || watts < -10000 || watts > 5
        || (stoppedAfter !== undefined && Date.now() - (field.ageSec + 1) * 1000 < stoppedAfter)) return false;
      total += watts;
    }
    return total <= 0;
  }

  private async verifyOfficeChargeStopped(office: any, deadline = Date.now() + 45000, assertActive = () => {}): Promise<void> {
    const lease = this.homey.settings.get('houseReserveLease');
    const stoppedAfter = lease?.stoppingSince ?? (lease?.officeExpectedReserve > lease?.officeRestoreReserve ? Date.now() : undefined);
    let floorSamples = 0;
    let lastFloorReceipt = 0;
    let firstFloorReceipt = 0;
    for (let i = 0; i < 15; i++) {
      // Read the native source after the stop; a reserve ACK alone is not a
      // physical stop. Positive PV charging can continue when grid serves at
      // most the local load, but unknown/stale balance cannot release house.
      try {
        assertActive();
        if (this.stopping || Date.now() >= deadline) throw new Error('Office stop deadline expired');
        await this.boundedReserveRead(office.flowRefresh(), deadline);
        assertActive();
      } catch {
        throw new Error('Office grid charging stop unverified; preserve house hold');
      }
      const fields: Record<string, ReportingObservation> = office.getReportingDiagnostics()?.observations;
      const fresh = (key: string): boolean => Number.isFinite(fields?.[key]?.value)
        && Number.isFinite(fields[key].receivedAt) && fields[key].receivedAt > 0
        && fields[key].receivedAt <= Date.now() && Date.now() - fields[key].receivedAt <= 5000;
      if (fresh('measure_power') && (fields.measure_power.value <= 0
        || (fresh('measure_power.grid') && fresh('measure_power.load') && fields['measure_power.grid'].value <= fields['measure_power.load'].value))) return;
      // Native minimum-SOC maintenance is separate from scheduled bulk charge.
      // Require repeated independent receipts and both battery/grid evidence.
      const floor = office.getCapabilityValue('backup_reserve_soc');
      const memberEvidence = this.officeMembersNotCharging(stoppedAfter);
      const allowanceW = memberEvidence === true ? 150 : 50;
      const floorMaintenance = floor === 3 && office.getCapabilityValue('operating_mode') === 'self_powered'
        && office.getCapabilityValue('alarm_generic') !== true
        && ['measure_battery', 'measure_power', 'measure_power.grid', 'measure_power.load'].every(fresh)
        && fields.measure_battery.value >= floor && fields.measure_battery.value <= 100
        && (memberEvidence === true || (memberEvidence === undefined && fields.measure_battery.value <= floor + 1))
        && fields.measure_power.value > 0 && fields.measure_power.value <= allowanceW
        && fields['measure_power.grid'].value >= 0 && fields['measure_power.load'].value >= 0
        && fields['measure_power.grid'].value - fields['measure_power.load'].value <= allowanceW;
      if (floorMaintenance && fields.measure_power.receivedAt > lastFloorReceipt) {
        if (floorSamples === 0) firstFloorReceipt = fields.measure_power.receivedAt;
        floorSamples += 1; lastFloorReceipt = fields.measure_power.receivedAt;
        if (floorSamples >= 3 && lastFloorReceipt - firstFloorReceipt >= 6000) return;
      } else if (!floorMaintenance) floorSamples = 0;
      try {
        await this.boundedReserveRead(new Promise<void>((resolve) => {
          this.homey.setTimeout(resolve, 1000);
        }), deadline);
        assertActive();
      } catch {
        throw new Error('Office grid charging stop unverified; preserve house hold');
      }
    }
    throw new Error('Office grid charging stop unverified; preserve house hold');
  }

  private houseGroupNoDischargeVerified(gate: any, view: any): boolean {
    const maxAgeSec = gate.powerBudget?.maxObservationAgeSec;
    if (isEcoflowManagedPower(gate.powerBudget)) {
      // Native reserve plus fresh system flow, not AC accounting or a sum of
      // unqualified physical power tiles. Use every enrolled member's SOC floor.
      return view.memberSocAgeSec <= 30 && view.powerAgeSec >= 0 && view.powerAgeSec + 1 <= maxAgeSec
        && view.batteryW >= 0 && view.reservePercent >= view.noDischargeReserveFloorPercent;
    }
    if (!Number.isFinite(maxAgeSec) || gate.houseMemberPowerScopeReviewed !== true || view.memberSocAgeSec > 30
      || !Number.isFinite(view.powerAgeSec) || view.powerAgeSec + 1 > maxAgeSec
      || view.batteryW < 0 || view.batteryW > 50
      || view.noDischargeReserveFloorPercent > view.reservePercent
      || view.reservePercent > view.noChargeReserveCeilingPercent) return false;
    const units = this.homey.drivers.getDriver('stream_5000_unit').getDevices() as any[];
    return gate.houseMemberDeviceIds.every((id: string) => {
      const member = units.find((d) => d.getId() === id);
      const field = member?.getReadingDiagnostics()?.stream_unit_power_battery_flow;
      const power = member?.getCapabilityValue('stream_unit_power_battery_flow');
      return field?.stale === false && field.applicationStatus === 'applied' && Number.isFinite(field.ageSec)
        && field.ageSec >= 0 && field.ageSec + 1 <= maxAgeSec && Number.isFinite(power) && power >= 0;
    });
  }

  private houseChargingAuthorityVerified(gate: any, view: any): boolean {
    const lease = this.homey.settings.get('houseReserveLease');
    return !!lease && !lease.completed && !lease.fault && lease.until > Date.now()
      && lease.guardScope === gate.controlScope && lease.guardBinding === JSON.stringify(gate)
      && lease.houseDeviceId === gate.deviceId && lease.serial === gate.serial
      && lease.expectedEnabled === true && lease.expectedPercent === view.reservePercent
      && JSON.stringify(lease.houseMemberDeviceIds) === JSON.stringify(gate.houseMemberDeviceIds)
      && JSON.stringify(lease.houseMemberSerials) === JSON.stringify(gate.houseMemberSerials)
      && view.reservePercent > view.noDischargeReserveFloorPercent && view.memberSocAgeSec <= 30
      && view.powerAgeSec + 1 <= gate.powerBudget.maxObservationAgeSec
      && view.gridChargeAgeSec + 1 <= gate.powerBudget.maxObservationAgeSec
      && view.gridChargeW > 50 && view.batteryW > 50;
  }

  private assertFreshHouseBudgetReceipts(gate: any, view: any): void {
    const maxAge = gate.powerBudget.maxObservationAgeSec;
    const ages = [view.powerAgeSec, view.gridChargeAgeSec];
    if (!isEcoflowManagedPower(gate.powerBudget)) ages.push(view.gridImportAgeSec);
    if (ages.some((age) => !Number.isFinite(age)
      || age < 0 || age + 1 > maxAge)) throw new Error('House power budget receipt stale');
  }

  private assertOfficeCoordinationPreflight(office: any, gate: any): void {
    if (office.getCapabilityValue('operating_mode') !== 'self_powered' || office.getCapabilityValue('alarm_generic') === true) throw new Error('Office mode/fault safety guard');
    if (gate.controlScope === 'coordinated-installations') {
      this.validateCoordinatedPowerBudget(gate, true);
      if (office.getCapabilityValue('alarm_generic') !== false || !this.officeCoordinationMembershipCurrent(office, gate)) throw new Error('Office membership or alarm unverified');
    }
  }

  private assertCoordinatedPower(house: any, office: any, gate: any): void {
    this.assertOfficeCoordinationPreflight(office, gate);
    if (gate.controlScope === 'coordinated-installations') {
      const view = houseInstallationSnapshot(gate, this.homey.drivers.getDriver('stream_5000_unit').getDevices());
      if (isEcoflowManagedPower(gate.powerBudget)) {
        this.assertFreshHouseBudgetReceipts(gate, view);
        this.officeDischargeReading(office, gate);
        if (!this.houseGroupNoDischargeVerified(gate, view)) throw new Error('House native no-discharge hold unverified');
        return;
      }
      const grid = this.coordinatedGridReading(gate);
      this.assertFreshHouseBudgetReceipts(gate, view);
      const fields: Record<string, ReportingObservation> = office.getReportingDiagnostics()?.observations || {};
      const officeGrid = fields['measure_power.grid'];
      if (!officeGrid || !Number.isFinite(officeGrid.value) || !Number.isFinite(officeGrid.receivedAt)
        || officeGrid.receivedAt > Date.now() || Date.now() - officeGrid.receivedAt > gate.powerBudget.maxObservationAgeSec * 1000) throw new Error('Office grid receipt stale');
      const officePower = this.officeChargingWatts(office, gate.powerBudget.maxObservationAgeSec * 1000);
      if (Math.max(0, grid.signedImportW) > gate.wholePropertyGridLimitW - gate.powerBudget.marginKw * 1000
        || view.gridImportW > gate.houseSpaceGridLimitW - gate.powerBudget.marginKw * 1000
        || Math.max(0, officeGrid.value) > gate.officeSpaceGridLimitW - gate.powerBudget.marginKw * 1000
        || officePower > gate.officeNativeChargeKw * 1000
        || view.gridChargeW > gate.houseNativeChargeKw * 1000) throw new Error('Coordinated charging exceeds reviewed boundary');
      if (!this.houseChargingAuthorityVerified(gate, view) && !this.houseGroupNoDischargeVerified(gate, view)) {
        throw new Error('House charging or no-discharge hold unverified');
      }
      return;
    }
    assertHouseNoDischarge(house, Math.max(0, (gate.siteChargeKw - gate.officeNativeChargeKw) * 1000));
    const reserve = freshReserveSnapshot(house.getConfigurationDiagnostics());
    if (reserve.percent > house.getCapabilityValue('measure_battery')
      && gate.siteChargeKw < gate.officeNativeChargeKw + gate.houseNativeChargeKw) throw new Error('House charging pending; sequential headroom required');
    const watts = this.officeChargingWatts(office) + Math.max(0, house.getCapabilityValue('stream_unit_power_battery_flow'));
    if (watts > gate.siteChargeKw * 1000) throw new Error('Actual coordinated charging exceeds allowance');
  }

  private assertCoordinatedStartHeadroom(gate: any, houseTarget: number, officeStarts: boolean, office: any): void {
    const view = houseInstallationSnapshot(gate, this.homey.drivers.getDriver('stream_5000_unit').getDevices());
    if (isEcoflowManagedPower(gate.powerBudget)) {
      this.assertFreshHouseBudgetReceipts(gate, view);
      const officeDevice = office ?? (this.homey.drivers.getDriver('stream').getDevices() as any[])
        .find((d) => d.getId() === gate.officeDeviceId);
      this.officeDischargeReading(officeDevice, gate);
      return;
    }
    const grid = this.coordinatedGridReading(gate);
    this.assertFreshHouseBudgetReceipts(gate, view);
    const lease = this.homey.settings.get('houseReserveLease');
    const now = Date.now();
    const chargeIntervalStart = now - (view.gridChargeAgeSec + 1) * 1000;
    const chargeIntervalEnd = now - view.gridChargeAgeSec * 1000;
    const worstSkewMs = Math.max(Math.abs(grid.observedAt - chargeIntervalStart), Math.abs(grid.observedAt - chargeIntervalEnd));
    const powerIntervalStart = now - (view.powerAgeSec + 1) * 1000;
    const powerIntervalEnd = now - view.powerAgeSec * 1000;
    const maxSkewMs = (gate.powerBudget.maxPowerSkewSec ?? 1) * 1000;
    if (Math.max(Math.abs(grid.observedAt - powerIntervalStart), Math.abs(grid.observedAt - powerIntervalEnd)) > maxSkewMs) {
      throw new Error('House power and property receipt skew unverified');
    }
    const ownedHouseCharging = houseTarget > view.noChargeReserveCeilingPercent && lease
      && !lease.completed && !lease.fault && lease.until > Date.now() && lease.expectedPercent === view.reservePercent
      && lease.expectedEnabled === true && lease.houseDeviceId === gate.deviceId && lease.serial === gate.serial
      && lease.guardScope === 'coordinated-installations' && lease.guardBinding === JSON.stringify(gate)
      && worstSkewMs <= maxSkewMs
      && JSON.stringify(lease.houseMemberDeviceIds) === JSON.stringify(gate.houseMemberDeviceIds)
      && JSON.stringify(lease.houseMemberSerials) === JSON.stringify(gate.houseMemberSerials);
    const houseExtra = (houseTarget >= view.noChargeReserveCeilingPercent || view.batteryW > 50)
      ? Math.max(0, gate.houseNativeChargeKw * 1000 - (ownedHouseCharging ? view.gridChargeW : 0)) : 0;
    const officeExtra = officeStarts ? gate.officeNativeChargeKw * 1000 : 0;
    const houseOutput = Math.max(0, -view.batteryW);
    const officeDevice = office ?? (this.homey.drivers.getDriver('stream').getDevices() as any[])
      .find((d) => d.getId() === gate.officeDeviceId);
    const officePower = this.officeDischargeReading(officeDevice, gate, now);
    if (Math.abs(grid.observedAt - officePower.receivedAt) > maxSkewMs) throw new Error('Office discharge receipt unavailable or unaligned');
    const officeOutput = Math.max(0, -officePower.value);
    const propertyProspective = Math.max(0, grid.signedImportW) + houseOutput + officeOutput + houseExtra + officeExtra;
    const houseProspective = view.gridImportW + houseOutput + houseExtra
      + (gate.powerBudget.houseSpaceBoundary === 'house-excluding-office' ? 0 : officeOutput + officeExtra);
    if (propertyProspective > gate.wholePropertyGridLimitW - gate.powerBudget.marginKw * 1000
      || houseProspective > gate.houseSpaceGridLimitW - gate.powerBudget.marginKw * 1000) throw new Error('Insufficient whole-property or house headroom');
    if (officeStarts) {
      const gridField: ReportingObservation | undefined = office?.getReportingDiagnostics()?.observations?.['measure_power.grid'];
      if (!gridField || !Number.isFinite(gridField.value) || !Number.isFinite(gridField.receivedAt)
        || gridField.receivedAt > Date.now() || Date.now() - gridField.receivedAt > gate.powerBudget.maxObservationAgeSec * 1000
        || Math.max(0, gridField.value) + officeOutput + officeExtra > gate.officeSpaceGridLimitW - gate.powerBudget.marginKw * 1000) throw new Error('Insufficient office headroom');
    }
  }

  private ensureHouseReserveWatchdog(): void {
    if (!this.houseReserveTimer && typeof this.homey.setInterval === 'function') {
      this.houseReserveTimer = this.homey.setInterval(() => {
        this.expireHouseReserveLease().catch(() => this.error('Coordinated reserve watchdog requires attention'));
      }, 5000);
    }
  }

  private async expireHouseReserveLease(): Promise<void> {
    const lease = this.homey.settings.get('houseReserveLease');
    if (this.officeReserveOperation) {
      try {
        this.officeReserveOperation.assertActive();
        if (this.officeReserveOperation.purpose === 'dispatch' && lease?.until <= Date.now()) this.officeReserveOperation.controller.abort();
      } catch {
        this.officeReserveOperation.controller.abort();
      }
    }
    if (!lease || lease.completed || lease.fault || this.houseReserveBusy || this.coordinatedReserveBusy) return;
    let guardLost = false;
    let houseBudgetExceeded = false;
    let houseChargeProhibited = false;
    let houseGuardFailure: string | undefined;
    if (Array.isArray(lease.houseMemberDeviceIds)) {
      const gate = this.homey.settings.get('houseReserveControl');
      try {
        if (lease.guardScope === 'coordinated-installations'
          && JSON.stringify(gate) !== lease.guardBinding) throw new Error('Coordinator configuration changed');
        if (isEcoflowManagedPower(gate?.powerBudget) && (gate.enabled !== true
          || (gate.mode === 'pilot' && (!Number.isFinite(gate.expiresAt) || gate.expiresAt <= Date.now())))) {
          throw new Error('Coordinator disabled or pilot expired');
        }
        if (JSON.stringify(gate?.houseMemberDeviceIds) !== JSON.stringify(lease.houseMemberDeviceIds)
          || JSON.stringify(gate?.houseMemberSerials) !== JSON.stringify(lease.houseMemberSerials)) throw new Error('House membership changed');
        let view;
        try {
          view = houseInstallationSnapshot(gate, this.homey.drivers.getDriver('stream_5000_unit').getDevices());
        } catch {
          await this.refreshCoordinatedReadings(); view = houseInstallationSnapshot(gate, this.homey.drivers.getDriver('stream_5000_unit').getDevices());
        }
        if (gate.controlScope === 'coordinated-installations') {
          try {
            this.assertFreshHouseBudgetReceipts(gate, view);
          } catch {
            await this.refreshCoordinatedReadings();
            view = houseInstallationSnapshot(gate, this.homey.drivers.getDriver('stream_5000_unit').getDevices());
            this.assertFreshHouseBudgetReceipts(gate, view);
          }
        }
        houseBudgetExceeded = !isEcoflowManagedPower(gate.powerBudget) && (view.gridChargeW > (gate.houseSiteChargeKw ?? gate.siteChargeKw) * 1000
          || (view.gridChargeW > 50 && Number.isFinite(gate.houseSpaceGridLimitW) && view.gridImportW > gate.houseSpaceGridLimitW));
        if (gate.controlScope === 'coordinated-installations' && !isEcoflowManagedPower(gate.powerBudget)) {
          const upstream = this.coordinatedGridReading(gate);
          houseBudgetExceeded ||= Math.max(0, upstream.signedImportW) > gate.wholePropertyGridLimitW - gate.powerBudget.marginKw * 1000
            || view.gridImportW > gate.houseSpaceGridLimitW - gate.powerBudget.marginKw * 1000;
        }
        houseChargeProhibited = gate.houseGridChargingEnabled === false && view.gridChargeW > 50;
        guardLost = houseBudgetExceeded || houseChargeProhibited;
      } catch (error: any) {
        guardLost = true;
        houseGuardFailure = error.message;
      }
    }
    if (lease.officeExpectedReserve > lease.officeRestoreReserve) {
      try {
        const house = (this.homey.drivers.getDriver('stream_5000_unit').getDevices() as any[]).find((d) => d.getId() === lease.houseDeviceId && d.getData()?.sn === lease.serial);
        const office = (this.homey.drivers.getDriver('stream').getDevices() as any[]).find((d) => d.getId() === lease.officeDeviceId);
        const gate = this.homey.settings.get('houseReserveControl');
        if (gate?.enabled !== true || (gate.mode !== 'routine'
          && !(isEcoflowManagedPower(gate.powerBudget) && gate.mode === 'pilot' && gate.expiresAt > Date.now()))) throw new Error('Coordinator disabled');
        const power = house?.getReadingDiagnostics()?.stream_unit_power_battery_flow;
        const officePower: ReportingObservation | undefined = office?.getReportingDiagnostics()?.observations?.measure_power;
        // Live power does not prove unchanged reserve/mode/task configuration.
        // Refresh that independent receipt before its 20-minute safety horizon,
        // even when frequent power packets keep arriving. Never extend the horizon.
        const config = house?.getConfigurationDiagnostics()?.values;
        const configNeedsRead = ['backupReserveEnabled', 'backupReservePct', 'mode', 'tasks'].some((key) => {
          const field = config?.[key];
          return field?.stale !== false || !Number.isFinite(field.ageSec) || field.ageSec < 0 || field.ageSec > 600;
        });
        if (configNeedsRead || power?.stale !== false || power.ageSec > 20 || !officePower || Date.now() - officePower.receivedAt > 20000) await this.refreshCoordinatedReadings();
        this.assertCoordinatedPower(house, office, gate);
      } catch {
        guardLost = true;
      }
    }
    if (lease.until > Date.now() && !guardLost) return;
    // A read can await network traffic. Do not act on a lease renewed or
    // replaced while waiting, or let two watchdog callbacks stop concurrently.
    if (this.houseReserveBusy || this.coordinatedReserveBusy
      || JSON.stringify(this.homey.settings.get('houseReserveLease')) !== JSON.stringify(lease)) return;
    this.houseReserveBusy = true;
    const restorationStarted = Date.now();
    const restorationDeadline = restorationStarted + 45000;
    const leaseSnapshot = JSON.stringify(lease);
    let unownedRelease: { assertActive: () => void; deadline: number } | undefined;
    const assertRestorationOwned = () => {
      if (this.stopping || Date.now() >= restorationDeadline
        || JSON.stringify(this.homey.settings.get('houseReserveLease')) !== leaseSnapshot) throw new Error('House restoration expired or ownership changed');
    };
    try {
      if (lease.controlScope !== 'house-only') {
        const offices = this.homey.drivers.getDriver('stream').getDevices() as any[];
        const office = offices.find((d) => d.getId() === lease.officeDeviceId);
        if (!office || !office.getAvailable()) throw new Error('Office unavailable for expiry stop');
        const reserve = office.getCapabilityValue('backup_reserve_soc');
        if (reserve !== lease.officeRestoreReserve) {
          if (reserve !== lease.officeExpectedReserve) throw new Error('Office manual ownership changed');
          await this.writeOwnedOfficeReserve(office, lease.officeRestoreReserve, () => {
            const currentLease = this.homey.settings.get('houseReserveLease');
            const currentReserve = office.getCapabilityValue('backup_reserve_soc');
            if (JSON.stringify(currentLease) !== JSON.stringify(lease)
              || ![lease.officeExpectedReserve, lease.officeRestoreReserve].includes(currentReserve)) throw new Error('Office manual ownership changed');
          }, restorationDeadline, 'restoration');
        }
        await this.verifyOfficeChargeStopped(office, restorationDeadline);
      } else if (lease.guardScope === 'coordinated-installations'
        && lease.restorePercent < lease.expectedPercent) {
        const gate = this.homey.settings.get('houseReserveControl');
        const assertContext = () => {
          assertRestorationOwned();
          if (JSON.stringify(this.homey.settings.get('houseReserveControl')) !== lease.guardBinding
            || gate.officeDeviceId !== lease.officeDeviceId
            || gate.officeRestoreReserve !== lease.officeRestoreReserve) throw new Error('Coordinator configuration changed');
        };
        unownedRelease = await this.verifyUnownedOfficeStopped(gate, restorationDeadline, assertContext);
      }
      const houses = this.homey.drivers.getDriver('stream_5000_unit').getDevices() as any[];
      const house = houses.find((d) => d.getId() === lease.houseDeviceId && d.getData()?.sn === lease.serial);
      if (!house || !house.getAvailable()) throw new Error('House unavailable for expiry restoration');
      if (Array.isArray(lease.houseMemberDeviceIds)) {
        const gate = this.homey.settings.get('houseReserveControl');
        if (JSON.stringify(gate?.houseMemberDeviceIds) !== JSON.stringify(lease.houseMemberDeviceIds)
          || JSON.stringify(gate?.houseMemberSerials) !== JSON.stringify(lease.houseMemberSerials)) throw new Error('House membership changed; preserve manual ownership');
        for (const id of lease.houseMemberDeviceIds) {
          const member = houses.find((d) => d.getId() === id && d.getData()?.sn === lease.houseMemberSerials[id]);
          if (!member?.getAvailable()) throw new Error('House member unavailable for restoration');
          const r = freshReserveSnapshot(member.getConfigurationDiagnostics());
          if (!((r.enabled === lease.expectedEnabled
            && r.percent === lease.expectedPercent)
            || (r.enabled === lease.restoreEnabled
            && r.percent === lease.restorePercent))) throw new Error('House member manual ownership changed');
        }
      }
      // Office is already physically stopped. One bounded read may recover a
      // missing configuration receipt; it cannot authorise a blind restoration.
      try {
        freshReserveSnapshot(house.getConfigurationDiagnostics());
      } catch {
        assertRestorationOwned();
        await this.boundedReserveRead(this.refreshCoordinatedReadings(), restorationDeadline);
      }
      assertRestorationOwned();
      unownedRelease?.assertActive();
      const current = freshReserveSnapshot(house.getConfigurationDiagnostics());
      const restoreIds = Array.isArray(lease.houseMemberDeviceIds) ? lease.houseMemberDeviceIds : [lease.houseDeviceId];
      const needsRestore = restoreIds.some((id: string) => {
        const own = freshReserveSnapshot(houses.find((d) => d.getId() === id)?.getConfigurationDiagnostics());
        return own.enabled !== lease.restoreEnabled || own.percent !== lease.restorePercent;
      });
      if (needsRestore) {
        if (!((current.enabled === lease.expectedEnabled && current.percent === lease.expectedPercent)
          || (current.enabled === lease.restoreEnabled && current.percent === lease.restorePercent))) throw new Error('House manual ownership changed');
        if (!this.appMqtt?.connected) throw new Error('House restoration transport unavailable');
        for (const id of restoreIds) {
          const sn = id === lease.houseDeviceId ? lease.serial : lease.houseMemberSerials[id];
          const member = houses.find((d) => d.getId() === id && d.getData()?.sn === sn);
          if (!member?.getAvailable()) throw new Error('House member unavailable before restoration');
          const own = freshReserveSnapshot(member.getConfigurationDiagnostics());
          if (!((own.enabled === lease.expectedEnabled && own.percent === lease.expectedPercent)
            || (own.enabled === lease.restoreEnabled && own.percent === lease.restorePercent))) throw new Error('House member manual ownership changed');
          if (own.enabled !== lease.restoreEnabled || own.percent !== lease.restorePercent) {
            assertRestorationOwned();
            unownedRelease?.assertActive();
            const frame = houseReserveFrame(sn, lease.restoreEnabled, lease.restorePercent, ((Date.now() + restoreIds.indexOf(id)) & 0x7fffffff) || 1);
            await this.boundedReserveRead(this.appMqtt.publishHouseReserve(sn, frame), restorationDeadline);
            assertRestorationOwned();
            unownedRelease?.assertActive();
          }
        }
        let verified = false;
        for (let i = 0; i < 90; i++) {
          await new Promise<void>((resolve) => {
            this.homey.setTimeout(resolve, 500);
          });
          assertRestorationOwned();
          unownedRelease?.assertActive();
          const after = freshReserveSnapshot(house.getConfigurationDiagnostics());
          if (after.enabled === lease.restoreEnabled && after.percent === lease.restorePercent) {
            verified = true; break;
          }
        }
        if (!verified) throw new Error('House restoration unverified');
      }
      if (Array.isArray(lease.houseMemberDeviceIds)) {
        const gate = this.homey.settings.get('houseReserveControl');
        if (JSON.stringify(gate?.houseMemberDeviceIds) !== JSON.stringify(lease.houseMemberDeviceIds)
          || JSON.stringify(gate?.houseMemberSerials) !== JSON.stringify(lease.houseMemberSerials)) throw new Error('House membership changed; restoration requires review');
        let restored = false;
        for (let i = 0; i < 60; i++) {
          assertRestorationOwned();
          unownedRelease?.assertActive();
          try {
            const r = houseInstallationSnapshot(gate, this.homey.drivers.getDriver('stream_5000_unit').getDevices());
            if (r.reserveEnabled === lease.restoreEnabled && r.reservePercent === lease.restorePercent && r.gridChargeW <= 50 && Date.now() - (r.gridChargeAgeSec + 1) * 1000 >= restorationStarted) {
              restored = true; break;
            }
          } catch { /* Member ACKs may arrive separately. */ }
          await new Promise<void>((resolve) => {
            this.homey.setTimeout(resolve, 500);
          });
        }
        if (!restored) throw new Error('House member restoration unverified');
      }
      let stopFault: string | undefined;
      if (houseBudgetExceeded) stopFault = 'House installation charging exceeds allowance';
      else if (houseChargeProhibited) stopFault = 'House grid charging not enabled';
      else if (guardLost && lease.guardScope === 'coordinated-installations') stopFault = houseGuardFailure || 'Coordinated safety guard lost';
      assertRestorationOwned();
      unownedRelease?.assertActive();
      this.homey.settings.set('houseReserveLease', {
        ...lease, completed: true, restoredAt: Date.now(), ...(guardLost ? { stopReason: houseGuardFailure || stopFault || 'House guard lost' } : {}), ...(stopFault ? { fault: stopFault } : {}),
      });
    } catch (error: any) {
      // Do not fault, expire or resurrect an owner that replaced this lease.
      if (JSON.stringify(this.homey.settings.get('houseReserveLease')) !== leaseSnapshot) throw error;
      if ((error.message === 'Office grid charging stop unverified; preserve house hold'
        || (lease.stoppingSince && ['Office unavailable for expiry stop', 'House unavailable for expiry restoration'].includes(error.message)))
        && Date.now() - (lease.stoppingSince ?? Date.now()) < 600000) {
        this.homey.settings.set('houseReserveLease', { ...lease, until: Math.min(lease.until, Date.now() - 1), stoppingSince: lease.stoppingSince ?? Date.now() });
        return;
      }
      this.homey.settings.set('houseReserveLease', { ...lease, fault: error.message });
      throw error;
    } finally {
      this.houseReserveBusy = false;
    }
  }

  private assertCoordinatedRuntimeBoundary(gate: any, snapshot: string, leaseUntil: number): void {
    if (gate.controlScope !== 'coordinated-installations') return;
    if (JSON.stringify(this.homey.settings.get('houseReserveControl')) !== snapshot) throw new Error('Coordinator configuration changed');
    if (!Number.isFinite(leaseUntil) || leaseUntil <= Date.now()) throw new Error('Coordinated lease expired before next write or acknowledgement');
    if (isEcoflowManagedPower(gate.powerBudget)) {
      if (gate.enabled !== true || (gate.mode === 'pilot'
        ? !Number.isFinite(gate.expiresAt) || gate.expiresAt <= Date.now() || leaseUntil > gate.expiresAt
        : gate.mode !== 'routine' || gate.expiresAt !== null)) throw new Error('Coordinator disabled or pilot deadline exceeded');
      return;
    }
    const grid = this.coordinatedGridReading(gate);
    if (!grid || Math.max(0, grid.signedImportW) > gate.wholePropertyGridLimitW - gate.powerBudget.marginKw * 1000) {
      throw new Error('Fresh whole-property grid import must be within allowance');
    }
  }

  private async verifyUnownedOfficeStopped(gate: any, deadline: number, assertContext: () => void): Promise<{ assertActive: () => void; deadline: number }> {
    const offices = this.homey.drivers.getDriver('stream').getDevices() as any[];
    const office = offices.find((d) => d.getId() === gate?.officeDeviceId);
    const until = Math.min(deadline, Date.now() + 45000);
    const snapshot = JSON.stringify(gate);
    let proof: typeof this.officeCoordinationProof = null;
    const check = () => {
      if (this.stopping || !Number.isFinite(until) || Date.now() >= until
        || JSON.stringify(this.homey.settings.get('houseReserveControl')) !== snapshot
        || !office?.getAvailable() || office.getCapabilityValue('backup_reserve_soc') !== gate.officeRestoreReserve) {
        throw new Error('Unowned office stop unverified; preserve house hold');
      }
    };
    const checkProof = () => {
      check();
      if (!proof || !this.officeCoordinationMembershipCurrent(office, gate)
        || this.officeCoordinationProof?.binding !== proof.binding) throw new Error('Unowned office stop unverified; preserve house hold');
    };
    try {
      check();
      assertContext();
      await this.verifyOfficeCoordinationMembership(office, gate, until, () => {
        check(); assertContext();
      });
      proof = this.officeCoordinationProof;
      const assertActive = () => {
        checkProof(); assertContext();
      };
      assertActive();
      await this.boundedReserveRead(this.verifyOfficeChargeStopped(office, until, assertActive), until);
      assertActive();
      // The caller rechecks lease ownership separately after creating its own
      // replacement House lease. This guard remains valid through every publish.
      return { assertActive: checkProof, deadline: until };
    } catch {
      if (proof && this.officeCoordinationProof === proof) this.officeCoordinationProof = null;
      throw new Error('Unowned office stop unverified; preserve house hold');
    }
  }

  /** Single scoped coordinator: stop office before house changes; never touch feed-in/CT. */
  async requestCoordinatedReserve(body: any): Promise<Record<string, unknown>> {
    if (this.coordinatedReserveBusy || this.houseReserveBusy) return { verified: false, busy: true };
    const gate = this.homey.settings.get('houseReserveControl');
    const isolatedDual = gate?.controlScope === 'coordinated-installations' && body?.houseOnly === true;
    const managed = gate?.controlScope === 'coordinated-installations' && isEcoflowManagedPower(gate.powerBudget);
    const authorityReady = (gate?.mode === 'routine' && gate.expiresAt === null)
      || (managed && gate.mode === 'pilot' && Number.isFinite(gate.expiresAt) && gate.expiresAt > Date.now());
    if (gate?.enabled !== true || !authorityReady
      || (!managed && (!Number.isFinite(gate.siteChargeKw) || gate.siteChargeKw <= 0
      || !Number.isFinite(gate.houseNativeChargeKw) || gate.houseNativeChargeKw <= 0
      || (!isolatedDual && (!Number.isFinite(gate.officeNativeChargeKw)
        || gate.officeNativeChargeKw <= 0 || gate.siteChargeKw < gate.officeNativeChargeKw))))) throw new Error('Routine coordinator disabled/unconfigured');
    const pendingStop = this.homey.settings.get('houseReserveLease');
    if (pendingStop?.stoppingSince && !pendingStop.completed && !pendingStop.fault) return { verified: false, stopping: true, stoppingSince: pendingStop.stoppingSince };
    const targetKeys = ['housePercent', 'expectedHousePercent', 'officePercent', 'expectedOfficePercent', 'leaseUntil',
      'releaseOfficeOnly', 'releaseOfficeReason', 'acquireOfficeLease', 'houseOnly', 'houseMemberDeviceIds', 'tariffDeadline', 'powerBudget', 'controlScope'];
    const tariffDeadline = typeof body?.tariffDeadline === 'number' ? body.tariffDeadline : Date.parse(body?.tariffDeadline);
    if (!body || Object.keys(body).some((k) => !targetKeys.includes(k))
      || (body.acquireOfficeLease !== undefined && typeof body.acquireOfficeLease !== 'boolean')
      || (body.releaseOfficeOnly === true && !['staged-stop', 'manual-house-intervention'].includes(body.releaseOfficeReason))
      || (body.releaseOfficeOnly !== true && body.releaseOfficeReason !== undefined)
      || !Number.isFinite(body.leaseUntil) || body.leaseUntil <= Date.now() || body.leaseUntil > Date.now() + 180000
      || (managed && gate.mode === 'pilot' && body.leaseUntil > gate.expiresAt)
      || ((managed || body.tariffDeadline !== undefined) && (!Number.isFinite(tariffDeadline) || body.leaseUntil > tariffDeadline))
      || ![body.officePercent, body.expectedOfficePercent].every((v) => Number.isSafeInteger(v) && v >= gate.officeRestoreReserve && v <= 100)) throw new Error('Invalid coordinated target');
    // Scope is explicit on both sides. A disabled office is not a dependency
    // of house control, and cannot be silently re-enrolled by a stale runner.
    const dual = gate.controlScope === 'coordinated-installations';
    const requestScope = body.houseOnly === true ? 'house-only' : gate.controlScope;
    if (body.controlScope !== undefined && body.controlScope !== requestScope) throw new Error('Coordinator control scope mismatch');
    if ((managed || body.powerBudget !== undefined) && (!dual || !isDeepStrictEqual(body.powerBudget, gate.powerBudget))) {
      throw new Error('Requested power budget differs from native configuration');
    }
    if (dual && !managed && (gate.powerBudget?.schemaVersion !== 1
      || (gate.powerBudget.mode !== undefined && gate.powerBudget.mode !== 'conservative'))) {
      throw new Error('Unsupported coordinated power policy');
    }
    const gateSnapshot = dual ? JSON.stringify(gate) : '';
    const assertGateUnchanged = () => {
      if (dual && JSON.stringify(this.homey.settings.get('houseReserveControl')) !== gateSnapshot) throw new Error('Coordinator configuration changed');
    };
    if ((!dual && (body.houseOnly === true) !== (gate.controlScope === 'house-only'))
      || (body.houseOnly !== undefined && typeof body.houseOnly !== 'boolean')) throw new Error('Coordinator control scope mismatch');
    if (dual && (!Array.isArray(gate.houseMemberDeviceIds) || gate.houseMemberDeviceIds.length !== 2)) throw new Error('Explicit two-member house binding required');
    if (Array.isArray(gate.houseMemberDeviceIds) && JSON.stringify(body.houseMemberDeviceIds) !== JSON.stringify(gate.houseMemberDeviceIds)) throw new Error('Requested house membership changed');
    if (body.houseOnly === true) {
      if (body.releaseOfficeOnly === true || body.officePercent !== gate.officeRestoreReserve
        || body.expectedOfficePercent !== gate.officeRestoreReserve) throw new Error('Office control prohibited in house-only scope');
      const prior = this.homey.settings.get('houseReserveLease');
      if (prior && (!prior.completed || prior.fault) && prior.controlScope !== 'house-only') throw new Error('House-only transition requires reviewed quiescence');
      this.coordinatedReserveBusy = true;
      const priorSnapshot = JSON.stringify(prior);
      let dispatched = false;
      let release: { assertActive: () => void; deadline: number } | undefined;
      try {
        if (dual && body.housePercent < body.expectedHousePercent) {
          release = await this.verifyUnownedOfficeStopped(gate, body.leaseUntil, () => {
            assertGateUnchanged();
            if (JSON.stringify(this.homey.settings.get('houseReserveLease')) !== priorSnapshot) throw new Error('House lease ownership changed');
          });
          assertGateUnchanged();
          if (JSON.stringify(this.homey.settings.get('houseReserveLease')) !== priorSnapshot) throw new Error('House lease ownership changed');
          release.assertActive();
        }
        if (dual && body.housePercent >= body.expectedHousePercent) this.assertCoordinatedStartHeadroom(gate, body.housePercent, false, null);
        dispatched = true;
        await this.requestHouseReserve({
          deviceId: gate.deviceId,
          enabled: true,
          percent: body.housePercent,
          expectedEnabled: true,
          expectedPercent: body.expectedHousePercent,
          leaseUntil: body.leaseUntil,
          officeExpectedReserve: gate.officeRestoreReserve,
          ...(dual ? { houseOnly: true } : {}),
          ...(Array.isArray(gate.houseMemberDeviceIds) ? { houseMemberDeviceIds: body.houseMemberDeviceIds } : {}),
        }, release);
        return {
          verified: true,
          housePercent: body.housePercent,
          officePercent: gate.officeRestoreReserve,
          controlScope: 'house-only',
          leaseUntil: body.leaseUntil,
        };
      } catch (error) {
        const lease = this.homey.settings.get('houseReserveLease');
        if (lease && !lease.completed && (!dispatched ? JSON.stringify(lease) === priorSnapshot : !release
          && lease.until === body.leaseUntil && lease.expectedPercent === body.housePercent && lease.guardBinding === gateSnapshot)) {
          this.homey.settings.set('houseReserveLease', { ...lease, until: Date.now() - 1 });
        }
        if (error instanceof Error && error.message === 'Unowned office stop unverified; preserve house hold') {
          return {
            verified: false,
            releaseBlocked: true,
            interventionRequired: true,
            reason: error.message,
            controlScope: 'house-only',
          };
        }
        throw error;
      } finally {
        this.coordinatedReserveBusy = false;
      }
    }
    const office = (this.homey.drivers.getDriver('stream').getDevices() as any[]).find((d) => d.getId() === gate.officeDeviceId);
    const house = (this.homey.drivers.getDriver('stream_5000_unit').getDevices() as any[]).find((d) => d.getId() === gate.deviceId && d.getData()?.sn === gate.serial);
    if (!office?.getAvailable() || (body.releaseOfficeOnly !== true && !house?.getAvailable())) throw new Error('Coordinated device unavailable');
    if (office.getCapabilityValue('backup_reserve_soc') !== body.expectedOfficePercent) throw new Error('Office manual ownership changed');
    const officeOwned = this.officeLeaseOwned(gate, body.expectedOfficePercent);
    const officeAcquisition = body.acquireOfficeLease === true && gate.officeAcquisitionPolicy === 'restore-reserve-only'
      && body.expectedOfficePercent === gate.officeRestoreReserve && body.officePercent > gate.officeRestoreReserve;
    if (body.releaseOfficeOnly !== true && (body.expectedOfficePercent !== gate.officeRestoreReserve || body.officePercent !== gate.officeRestoreReserve)
      && !officeOwned && !officeAcquisition) throw new Error('Office write requires native ownership or explicit floor acquisition');
    const assertOfficeAuthority = () => {
      if (!this.officeLeaseOwned(gate, body.expectedOfficePercent)
        && !this.officeLeaseOwned(gate, body.officePercent)) throw new Error('Office native ownership changed');
      const current = office.getCapabilityValue('backup_reserve_soc');
      if (![body.expectedOfficePercent, body.officePercent, gate.officeRestoreReserve].includes(current)) throw new Error('Office manual ownership changed');
    };
    if (body.releaseOfficeOnly === true) {
      if (body.officePercent !== gate.officeRestoreReserve) throw new Error('Office-only action must stop charging');
      const owned = this.homey.settings.get('houseReserveLease');
      if (!officeOwned) throw new Error('Office-only stop requires matching active ownership');
      const staged = body.releaseOfficeReason === 'staged-stop';
      if (staged && (!owned.houseDeviceId || !owned.serial || !Number.isFinite(owned.until))) throw new Error('House restoration authority unavailable');
      this.coordinatedReserveBusy = true;
      try {
        if (body.expectedOfficePercent !== gate.officeRestoreReserve) {
          await this.writeOwnedOfficeReserve(office, gate.officeRestoreReserve, assertOfficeAuthority, body.leaseUntil);
        }
        await this.boundedReserveRead(this.verifyOfficeChargeStopped(office, body.leaseUntil), body.leaseUntil);
        assertGateUnchanged();
        assertOfficeAuthority();
        const lease = this.homey.settings.get('houseReserveLease');
        if (lease) {
          this.homey.settings.set('houseReserveLease', staged
            ? { ...lease, officeExpectedReserve: gate.officeRestoreReserve, officeStopped: true }
            : { ...lease, completed: true, fault: 'Manual house ownership preserved; office stopped' });
        }
        return {
          verified: true,
          officePercent: gate.officeRestoreReserve,
          housePercent: body.expectedHousePercent,
          houseVerified: false,
          houseOwnershipPreserved: true,
          leaseUntil: body.leaseUntil,
          officeStopped: true,
          houseRestorationPending: staged,
          ...(dual ? { controlScope: 'coordinated-installations' } : {}),
        };
      } catch (error) {
        const lease = this.homey.settings.get('houseReserveLease');
        if (lease && !lease.completed) this.homey.settings.set('houseReserveLease', { ...lease, until: Date.now() - 1 });
        throw error;
      } finally {
        this.coordinatedReserveBusy = false;
        const lease = this.homey.settings.get('houseReserveLease');
        if (lease && !lease.completed && !lease.fault && lease.until <= Date.now()) {
          await this.expireHouseReserveLease().catch(() => this.error?.('Coordinated reserve stop requires attention'));
        }
      }
    }
    const oldHouse = freshReserveSnapshot(house.getConfigurationDiagnostics());
    if (!oldHouse.enabled || oldHouse.percent !== body.expectedHousePercent) throw new Error('House manual ownership changed');
    if (body.officePercent > gate.officeRestoreReserve && oldHouse.percent !== body.housePercent) throw new Error('Establish house reserve before office start');
    this.coordinatedReserveBusy = true;
    try {
      // Existing office action includes its native fleet readback verification.
      if (body.expectedOfficePercent !== gate.officeRestoreReserve && oldHouse.percent !== body.housePercent) {
        await this.writeOwnedOfficeReserve(office, gate.officeRestoreReserve, assertOfficeAuthority, body.leaseUntil);
      }
      if (oldHouse.percent !== body.housePercent) {
        await this.boundedReserveRead(this.verifyOfficeChargeStopped(office, body.leaseUntil), body.leaseUntil);
      }
      const officeCurrent = office.getCapabilityValue('backup_reserve_soc');
      if (dual && body.officePercent > gate.officeRestoreReserve) {
        await this.verifyOfficeCoordinationMembership(office, gate, body.leaseUntil);
        assertGateUnchanged();
        this.assertCoordinatedPower(house, office, gate);
        this.assertCoordinatedStartHeadroom(gate, body.housePercent, true, office);
      } else if (dual && body.housePercent >= oldHouse.percent) {
        this.assertCoordinatedStartHeadroom(gate, body.housePercent, false, office);
      }
      await this.requestHouseReserve({
        deviceId: gate.deviceId,
        enabled: true,
        percent: body.housePercent,
        expectedEnabled: true,
        expectedPercent: oldHouse.percent,
        leaseUntil: body.leaseUntil,
        officeExpectedReserve: Math.max(officeCurrent, body.officePercent),
        ...(dual ? { houseMemberDeviceIds: body.houseMemberDeviceIds } : {}),
      });
      if (body.officePercent > gate.officeRestoreReserve) {
        await this.boundedReserveRead(office.flowRefresh(), body.leaseUntil);
        if (dual) await this.verifyOfficeCoordinationMembership(office, gate, body.leaseUntil);
        assertGateUnchanged();
        this.assertCoordinatedPower(house, office, gate);
        if (dual) this.assertCoordinatedStartHeadroom(gate, body.housePercent, true, office);
      }
      this.assertCoordinatedRuntimeBoundary(gate, gateSnapshot, body.leaseUntil);
      if (office.getCapabilityValue('backup_reserve_soc') !== officeCurrent) throw new Error('Office manual ownership changed');
      if (office.getCapabilityValue('backup_reserve_soc') !== body.officePercent) {
        await this.writeOwnedOfficeReserve(office, body.officePercent, () => {
          this.assertCoordinatedRuntimeBoundary(gate, gateSnapshot, body.leaseUntil);
          assertOfficeAuthority();
        }, body.leaseUntil);
      }
      if (body.officePercent > gate.officeRestoreReserve) {
        await this.boundedReserveRead(office.flowRefresh(), body.leaseUntil);
        assertGateUnchanged();
        this.assertCoordinatedPower(house, office, gate);
      }
      const lease = this.homey.settings.get('houseReserveLease');
      this.assertCoordinatedRuntimeBoundary(gate, gateSnapshot, body.leaseUntil);
      this.homey.settings.set('houseReserveLease', { ...lease, officeExpectedReserve: body.officePercent });
      return {
        verified: true,
        housePercent: body.housePercent,
        officePercent: body.officePercent,
        leaseUntil: body.leaseUntil,
        ...(dual ? { controlScope: 'coordinated-installations' } : {}),
      };
    } catch (error: any) {
      if (error.message === 'Office grid charging stop unverified; preserve house hold') {
        const stopping = this.homey.settings.get('houseReserveLease');
        if (stopping && !stopping.fault && !stopping.completed) {
          const stoppingSince = stopping.stoppingSince ?? Date.now();
          this.homey.settings.set('houseReserveLease', { ...stopping, until: Math.min(stopping.until, Date.now() - 1), stoppingSince });
          return { verified: false, stopping: true, stoppingSince };
        }
      }
      // A failed start cannot keep a lease alive. The watchdog stops office first.
      const lease = this.homey.settings.get('houseReserveLease');
      if (lease && !lease.completed) this.homey.settings.set('houseReserveLease', { ...lease, until: Date.now() - 1 });
      throw error;
    } finally {
      this.coordinatedReserveBusy = false;
      const lease = this.homey.settings.get('houseReserveLease');
      if (lease && !lease.completed && !lease.fault && lease.until <= Date.now()) {
        await this.expireHouseReserveLease().catch(() => this.error?.('Coordinated reserve stop requires attention'));
      }
    }
  }

  async requestHouseReserve(body: any, release?: { assertActive: () => void; deadline: number }): Promise<Record<string, unknown>> {
    if (this.houseReserveBusy) throw new Error('House reserve command already pending');
    this.houseReserveBusy = true;
    let acquiredLeaseSnapshot: string | undefined;
    try {
      const gate = this.homey.settings.get('houseReserveControl');
      const gateSnapshot = JSON.stringify(gate);
      if (gate?.enabled !== true || (gate.mode !== 'routine' && (!Number.isFinite(gate.expiresAt) || gate.expiresAt <= Date.now()))
        || (gate.mode === 'routine' && gate.expiresAt !== null)
        || !Number.isSafeInteger(gate.minPercent) || !Number.isSafeInteger(gate.maxPercent)
        || gate.minPercent < 0 || gate.maxPercent > 100 || gate.minPercent > gate.maxPercent) throw new Error('House reserve bridge disabled/expired');
      if (gate.controlScope === 'coordinated-installations' && !this.coordinatedReserveBusy) throw new Error('Dual-scope reserve requires coordinated owner');
      const requestKeys = ['deviceId', 'enabled', 'percent', 'expectedEnabled', 'expectedPercent', 'leaseUntil',
        'officeExpectedReserve', 'houseMemberDeviceIds', 'houseOnly'];
      if (!body || Object.keys(body).some((k) => !requestKeys.includes(k))
        || body.deviceId !== gate.deviceId || typeof body.enabled !== 'boolean'
        || !Number.isSafeInteger(body.percent) || body.percent < gate.minPercent || body.percent > gate.maxPercent) throw new Error('House reserve scope/target rejected');
      if (Array.isArray(gate.houseMemberDeviceIds)
        && (!body.leaseUntil || JSON.stringify(body.houseMemberDeviceIds) !== JSON.stringify(gate.houseMemberDeviceIds))) throw new Error('House installation requires matching bounded group lease');
      const devices = this.homey.drivers.getDriver('stream_5000_unit').getDevices() as any[];
      const matches = devices.filter((d) => d.getId() === gate.deviceId && d.getData()?.sn === gate.serial);
      if (matches.length !== 1 || !/^ES21[A-Z0-9]{4,60}$/.test(gate.serial)) throw new Error('House reserve identity changed');
      const device = matches[0];
      if (!device.getAvailable()) throw new Error('House device unavailable');
      const read = () => freshReserveSnapshot(device.getConfigurationDiagnostics());
      const before = read();
      if (before.enabled !== body.expectedEnabled || before.percent !== body.expectedPercent) throw new Error('House reserve changed; preserve manual ownership');
      if (body.leaseUntil !== undefined) {
        if (!Number.isFinite(body.leaseUntil) || body.leaseUntil <= Date.now() || body.leaseUntil > Date.now() + 180000
          || !Number.isSafeInteger(body.officeExpectedReserve) || body.officeExpectedReserve < 3 || body.officeExpectedReserve > 100
          || typeof gate.officeDeviceId !== 'string' || typeof gate.restoreEnabled !== 'boolean'
          || !Number.isSafeInteger(gate.restorePercent) || gate.restorePercent < 0 || gate.restorePercent > 100
          || !Number.isSafeInteger(gate.officeRestoreReserve) || gate.officeRestoreReserve < 3 || gate.officeRestoreReserve > 100) throw new Error('Invalid coordinated reserve lease');
        const previousLease = this.homey.settings.get('houseReserveLease');
        if (previousLease && !previousLease.completed && previousLease.guardScope === 'coordinated-installations'
          && previousLease.guardBinding !== gateSnapshot) throw new Error('Coordinator configuration changed during active lease');
        if (body.houseOnly !== undefined && (body.houseOnly !== true || gate.controlScope !== 'coordinated-installations')) throw new Error('House-only lease scope invalid');
        const leaseHouseOnly = gate.controlScope === 'house-only' || body.houseOnly === true;
        if (Array.isArray(gate.houseMemberDeviceIds)) {
          const view = houseInstallationSnapshot(gate, this.homey.drivers.getDriver('stream_5000_unit').getDevices());
          if (gate.houseGridChargingEnabled === false && body.percent > view.noChargeReserveCeilingPercent) throw new Error('House grid charging disabled pending power confirmation');
          if (view.reservePercent !== before.percent
            || (previousLease
            && !previousLease.completed
            && JSON.stringify(previousLease.houseMemberDeviceIds) !== JSON.stringify(gate.houseMemberDeviceIds))) throw new Error('House installation ownership changed');
        }
        if (leaseHouseOnly && (body.officeExpectedReserve !== gate.officeRestoreReserve
          || (previousLease && !previousLease.completed && previousLease.controlScope !== 'house-only'))) throw new Error('House-only transition requires reviewed quiescence');
        if (gate.controlScope === 'coordinated-installations' && !leaseHouseOnly
          && previousLease && !previousLease.completed && previousLease.controlScope !== 'coordinated-installations') throw new Error('Coordinated transition requires reviewed quiescence');
        if (previousLease?.fault) throw new Error('Prior coordinated reserve fault requires review');
        let controlScope = {};
        if (leaseHouseOnly) controlScope = { controlScope: 'house-only' };
        else if (gate.controlScope === 'coordinated-installations') controlScope = { controlScope: gate.controlScope };
        this.homey.settings.set('houseReserveLease', {
          until: body.leaseUntil,
          ...(Array.isArray(gate.houseMemberDeviceIds) ? { houseMemberDeviceIds: gate.houseMemberDeviceIds.slice(), houseMemberSerials: { ...gate.houseMemberSerials } } : {}),
          ...(gate.controlScope === 'coordinated-installations' ? { guardScope: gate.controlScope, guardBinding: gateSnapshot } : {}),
          ...controlScope,
          houseDeviceId: gate.deviceId,
          serial: gate.serial,
          officeDeviceId: gate.officeDeviceId,
          officeRestoreReserve: gate.officeRestoreReserve,
          officeExpectedReserve: body.officeExpectedReserve,
          restoreEnabled: gate.restoreEnabled,
          restorePercent: gate.restorePercent,
          expectedEnabled: body.enabled,
          expectedPercent: body.percent,
        });
        acquiredLeaseSnapshot = JSON.stringify(this.homey.settings.get('houseReserveLease'));
        this.ensureHouseReserveWatchdog();
      }
      const leaseSnapshot = JSON.stringify(this.homey.settings.get('houseReserveLease'));
      const assertRelease = () => {
        if (!release) return;
        release.assertActive();
        if (JSON.stringify(this.homey.settings.get('houseReserveLease')) !== leaseSnapshot) throw new Error('House lease ownership changed');
      };
      assertRelease();
      if (before.enabled === body.enabled && before.percent === body.percent) {
        return {
          verified: true, changed: false, enabled: before.enabled, percent: before.percent,
        };
      }
      const mqtt = this.appMqtt;
      if (!mqtt?.connected) throw new Error('House reserve transport not connected');
      const started = Date.now();
      const targets = Array.isArray(gate.houseMemberDeviceIds) ? gate.houseMemberDeviceIds : [gate.deviceId];
      for (const id of targets) {
        const sn = id === gate.deviceId ? gate.serial : gate.houseMemberSerials[id];
        const member = devices.find((d) => d.getId() === id && d.getData()?.sn === sn);
        if (!member?.getAvailable()) throw new Error('House member unavailable before reserve write');
        const own = freshReserveSnapshot(member.getConfigurationDiagnostics());
        if (!((own.enabled === body.expectedEnabled && own.percent === body.expectedPercent)
          || (own.enabled === body.enabled && own.percent === body.percent))) throw new Error('House member manual ownership changed');
        if (own.enabled !== body.enabled || own.percent !== body.percent) {
          this.assertCoordinatedRuntimeBoundary(gate, gateSnapshot, body.leaseUntil);
          assertRelease();
          const publish = mqtt.publishHouseReserve(sn, houseReserveFrame(sn, body.enabled, body.percent, ((Date.now() + targets.indexOf(id)) & 0x7fffffff) || 1));
          if (release) await this.boundedReserveRead(publish, release.deadline);
          else await publish;
          assertRelease();
        }
      }
      let stableMemberPasses = 0;
      for (let i = 0; i < 90 && Date.now() - started < 45000; i++) {
        await new Promise<void>((resolve) => {
          this.homey.setTimeout(resolve, 500);
        });
        this.assertCoordinatedRuntimeBoundary(gate, gateSnapshot, body.leaseUntil);
        assertRelease();
        const after = read();
        if (after.enabled !== body.enabled || after.percent !== body.percent) stableMemberPasses = 0;
        if (after.enabled === body.enabled && after.percent === body.percent && (before.enabled === body.enabled || after.enabledAgeSec <= (Date.now() - started) / 1000 + 1)
          && (before.percent === body.percent || after.percentAgeSec <= (Date.now() - started) / 1000 + 1)) {
          if (Array.isArray(gate.houseMemberDeviceIds)) {
            try {
              const view = houseInstallationSnapshot(gate, this.homey.drivers.getDriver('stream_5000_unit').getDevices());
              if (view.reservePercent !== body.percent) {
                stableMemberPasses = 0; continue;
              }
              // A delayed pre-write GET can follow the first SET acknowledgement.
              // Keep the command owner busy until both members stay aligned for
              // sixteen half-second polls; never resend SET to achieve agreement.
              stableMemberPasses++;
              if (stableMemberPasses < 16) continue;
            } catch {
              stableMemberPasses = 0;
              // Refresh independent member SOC/config receipts while waiting for
              // the shared acknowledgement; do not resend the reserve command.
              assertRelease();
              if (release) await this.boundedReserveRead(this.refreshCoordinatedReadings(), release.deadline);
              else await this.refreshCoordinatedReadings();
              assertRelease();
              continue;
            }
          }
          return {
            verified: true, changed: true, enabled: after.enabled, percent: after.percent,
          };
        }
      }
      throw new Error('House reserve command unverified; no blind retry');
    } catch (error) {
      const lease = this.homey.settings.get('houseReserveLease');
      if (release && acquiredLeaseSnapshot && JSON.stringify(lease) === acquiredLeaseSnapshot) {
        this.homey.settings.set('houseReserveLease', { ...lease, until: Date.now() - 1 });
      }
      throw error;
    } finally {
      this.houseReserveBusy = false;
    }
  }

  private async getAppMqtt(): Promise<EcoFlowAppMqtt | null> {
    if (this.stopping) return null;
    const credsKey = this.appAuthCredsKey();
    if (!credsKey) return null;

    if (this.appMqtt && credsKey !== this.appMqttCredsKey) {
      const refreshed = appAuthClientFromSettings(this.homey, (...a) => this.log('[app-mqtt]', ...a));
      if (!refreshed) return null;
      this.appMqtt.updateClient(refreshed);
      this.appMqttCredsKey = credsKey;
      try {
        await this.appMqtt.reconnect();
        return this.appMqtt;
      } catch {
        this.error('App-auth MQTT reconnect failed');
        return null;
      }
    }
    if (!this.appMqtt) {
      const client = appAuthClientFromSettings(this.homey, (...a) => this.log('[app-mqtt]', ...a));
      if (!client) return null;
      this.appMqtt = new EcoFlowAppMqtt({ client, log: (...a) => this.log('[app-mqtt]', ...a) });
      this.appMqttCredsKey = credsKey;
    }
    try {
      await this.appMqtt.connect();
      return this.appMqtt;
    } catch {
      this.error('App-auth MQTT connect failed');
      return null;
    }
  }

  /** Subscribe an admitted STREAM model to the read-only app-auth telemetry feed. */
  async subscribeAppRealtime(sn: string, onFrame: AppFrameHandler, active: () => boolean = () => true): Promise<boolean> {
    if (this.stopping || !active()) return false;
    this.pendingAppRealtime += 1;
    try {
      const mqtt = await this.getAppMqtt();
      if (this.stopping || !active() || !mqtt || mqtt !== this.appMqtt) return false;
      mqtt.subscribe(sn, onFrame);
      return true;
    } finally {
      this.pendingAppRealtime -= 1;
      this.releaseAppMqttIfIdle();
    }
  }

  getAppRealtimeDiagnostics(sn: string) {
    return this.appMqtt?.getDeliveryDiagnostics(sn) || null;
  }

  unsubscribeAppRealtime(sn: string, onFrame?: AppFrameHandler): void {
    if (!this.appMqtt) return;
    this.appMqtt.unsubscribe(sn, onFrame);
    this.releaseAppMqttIfIdle();
  }

  private releaseAppMqttIfIdle(): void {
    // The last app-connected STREAM device just went: drop the session rather than hold an
    // idle authenticated WSS connection open.
    if (!this.appMqtt || this.appMqtt.hasSubscribers || this.pendingAppRealtime > 0) return;
    const mqtt = this.appMqtt;
    this.appMqtt = null;
    this.appMqttCredsKey = '';
    mqtt.end().catch(() => this.error('App-auth MQTT teardown failed'));
  }
};
