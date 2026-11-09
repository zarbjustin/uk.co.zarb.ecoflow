'use strict';

import Homey from 'homey';
import { randomUUID } from 'crypto';
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
import { CoordinationWorkspace } from './lib/coordinationWorkspace';
import { CoordinationFlowMonitor } from './lib/coordinationFlowMonitor';
import { gridNotificationMatches } from './lib/sustainedGridNotifications';
import { requestStream5000Reserve, ReserveRequestError } from './lib/stream5000ReserveRequest';
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
  private reserveRequest: AbortController | null = null;
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
    if (body?.action === 'revoke') this.coordinationWorkspace?.revoke();
    return {
      advisoryOnly: true,
      controlsEnabled: false,
      contributesToEnergy: false,
      commandWrites: 0,
      state: 'blocked',
      reason: this.stopping ? 'session_expired' : 'external_reader_required',
      readings: [],
      decision: null,
      preservedBindings: true,
    };
  }

  async onInit(): Promise<void> {
    this.stopping = false;
    if (this.homey.settings.get('houseReserveControl')?.enabled === true) this.ensureHouseReserveWatchdog();
    this.streamDiscovery.clear();
    if (this.homey.flow) {
      this.homey.flow.getActionCard?.('stream_5000_request_backup_reserve').registerRunListener(
        (args: any) => this.requestStream5000BackupReserve(args.device, args.percent),
      );
      this.homey.flow.getDeviceTriggerCard?.('smartmeter_grid_power_sustained').registerRunListener(
        (args: any, state: any) => gridNotificationMatches(args, state)
          && args.device.gridNotificationEventCurrent(state.observation),
      );
      this.homey.flow.getConditionCard('smartmeter_grid_power_above').registerRunListener(
        (args: any) => args.device.gridPowerAbove(args.direction, args.watts),
      );
      this.homey.flow.getConditionCard('stream_5000_mode_is').registerRunListener(
        (args: any) => args.device.configurationModeIs(args.mode),
      );
      this.homey.flow.getConditionCard('stream_5000_reserve_enabled').registerRunListener(
        (args: any) => args.device.configurationReserveEnabled(),
      );
      this.homey.flow.getConditionCard('stream_5000_reading_current').registerRunListener(
        (args: any) => args.device.monitoringReadingCurrent(args.field, args.role),
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
    if (['accessKey', 'secretKey', 'host', 'houseReserveControl', 'houseReserveLease', ...APP_AUTH_SETTINGS].includes(key)) {
      this.cancelStream5000ReserveRequests();
    }
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
    this.cancelStream5000ReserveRequests();
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
      throw new Error('coordination_flow_external_reader_required');
    } else if (body?.action !== 'status') throw new Error('coordination_flow_unsupported_action');
    return {
      ...(this.coordinationFlowMonitor?.status() || {
        active: false,
        state: 'disabled',
        reason: 'external_reader_required',
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

  cancelStream5000ReserveRequests(): void {
    this.reserveRequest?.abort();
  }

  async requestStream5000BackupReserve(device: Homey.Device, percent: number): Promise<boolean> {
    const fail = (reason: string): never => {
      throw new Error(this.homey.__(`reserve_request.${reason}`));
    };
    if (this.reserveRequest) return fail('busy');
    if (!Number.isSafeInteger(percent) || percent < 0 || percent > 100) return fail('arguments');
    const paired = () => ['stream_5000_unit', 'stream_ac5000'].some((id) => {
      try {
        return this.homey.drivers.getDriver(id).getDevices().includes(device);
      } catch {
        return false;
      }
    });
    if (!device || !paired()) return fail('unavailable');
    if (device.getSetting('reserve_request_enabled') !== true) return fail('disabled');
    const credentials = this.getCredentials();
    if (!credentials.accessKey || !credentials.secretKey) return fail('credentials');
    const sn = device.getData().sn as string;
    const controller = new AbortController();
    const active = () => {
      const current = this.getCredentials();
      const lease = this.homey.settings.get('houseReserveLease');
      return !this.stopping && !controller.signal.aborted && paired() && device.getAvailable()
        && device.getSetting('reserve_request_enabled') === true && device.getData().sn === sn
        && current.accessKey === credentials.accessKey && current.secretKey === credentials.secretKey && current.host === credentials.host
        && this.homey.settings.get('houseReserveControl')?.enabled !== true && (!lease || lease.completed === true);
    };
    if (!active()) return fail('unavailable');
    this.reserveRequest = controller;
    const timer = this.homey.setTimeout(() => controller.abort(), 15000);
    try {
      const client = new EcoFlowClient({
        accessKey: credentials.accessKey, secretKey: credentials.secretKey, host: credentials.host,
      });
      await requestStream5000Reserve(client, sn, percent, controller.signal, active);
      return true;
    } catch (error) {
      return fail(error instanceof ReserveRequestError ? error.reason : 'preflight');
    } finally {
      this.homey.clearTimeout(timer);
      if (this.reserveRequest === controller) this.reserveRequest = null;
    }
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
    if (!house || (!houseOnly && !office) || !/^ES21[A-Z0-9]{4,60}$/.test(gate.serial)) throw new Error('Explicit coordinated read mapping required');
    const installation = Array.isArray(gate.houseMemberDeviceIds);
    const powerKey = 'stream_unit_power_battery_flow';
    const previousPowerAt = house.getAppliedReadingAt(powerKey);
    const requestedAt = Date.now();
    if (!houseOnly) await office.flowRefresh();
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
    const observations: Record<string, ReportingObservation> = houseOnly ? {} : office.getReportingDiagnostics()?.observations || {};
    const officeFresh = ['measure_battery', 'measure_power'].every((key) => {
      const f = observations[key];
      return f && Number.isFinite(f.value) && Number.isFinite(f.receivedAt) && f.receivedAt > 0 && f.receivedAt <= Date.now() && Date.now() - f.receivedAt <= 10000;
    });
    return {
      houseFresh: houseFresh(),
      ...(installation
        && houseFresh() ? { house: houseInstallationSnapshot(gate, this.homey.drivers.getDriver('stream_5000_unit').getDevices()) } : {}),
      officeFresh,
      officeRequired: !houseOnly,
      requested: true,
      checkedAt: Date.now(),
      settingsWrites: 0,
    };
  }

  private officeChargingWatts(office: any): number {
    const fields = office.getReportingDiagnostics()?.observations;
    const power: ReportingObservation | undefined = fields?.measure_power;
    if (!power || !Number.isFinite(power.value) || !Number.isFinite(power.receivedAt)
      || power.receivedAt <= 0 || power.receivedAt > Date.now() || Date.now() - power.receivedAt > 30000) throw new Error('Office battery power receipt unavailable');
    return Math.max(0, power.value);
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

  private async verifyOfficeChargeStopped(office: any): Promise<void> {
    const lease = this.homey.settings.get('houseReserveLease');
    const stoppedAfter = lease?.stoppingSince ?? (lease?.officeExpectedReserve > lease?.officeRestoreReserve ? Date.now() : undefined);
    let floorSamples = 0;
    let lastFloorReceipt = 0;
    let firstFloorReceipt = 0;
    for (let i = 0; i < 15; i++) {
      // Read the native source after the stop; a reserve ACK alone is not a
      // physical stop. Positive PV charging can continue when grid serves at
      // most the local load, but unknown/stale balance cannot release house.
      await office.flowRefresh();
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
      await new Promise<void>((resolve) => {
        this.homey.setTimeout(resolve, 1000);
      });
    }
    throw new Error('Office grid charging stop unverified; preserve house hold');
  }

  private assertCoordinatedPower(house: any, office: any, gate: any): void {
    if (office.getCapabilityValue('operating_mode') !== 'self_powered' || office.getCapabilityValue('alarm_generic') === true) throw new Error('Office mode/fault safety guard');
    assertHouseNoDischarge(house, Math.max(0, (gate.siteChargeKw - gate.officeNativeChargeKw) * 1000));
    const reserve = freshReserveSnapshot(house.getConfigurationDiagnostics());
    if (reserve.percent > house.getCapabilityValue('measure_battery')
      && gate.siteChargeKw < gate.officeNativeChargeKw + gate.houseNativeChargeKw) throw new Error('House charging pending; sequential headroom required');
    const watts = this.officeChargingWatts(office) + Math.max(0, house.getCapabilityValue('stream_unit_power_battery_flow'));
    if (watts > gate.siteChargeKw * 1000) throw new Error('Actual coordinated charging exceeds allowance');
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
    if (!lease || lease.completed || lease.fault || this.houseReserveBusy || this.coordinatedReserveBusy) return;
    let guardLost = false;
    let houseBudgetExceeded = false;
    let houseChargeProhibited = false;
    let houseGuardFailure: string | undefined;
    if (Array.isArray(lease.houseMemberDeviceIds)) {
      const gate = this.homey.settings.get('houseReserveControl');
      try {
        if (JSON.stringify(gate?.houseMemberDeviceIds) !== JSON.stringify(lease.houseMemberDeviceIds)
          || JSON.stringify(gate?.houseMemberSerials) !== JSON.stringify(lease.houseMemberSerials)) throw new Error('House membership changed');
        let view;
        try {
          view = houseInstallationSnapshot(gate, this.homey.drivers.getDriver('stream_5000_unit').getDevices());
        } catch {
          await this.refreshCoordinatedReadings(); view = houseInstallationSnapshot(gate, this.homey.drivers.getDriver('stream_5000_unit').getDevices());
        }
        houseBudgetExceeded = view.gridChargeW > (gate.houseSiteChargeKw ?? gate.siteChargeKw) * 1000
          || (view.gridChargeW > 50 && Number.isFinite(gate.houseSpaceGridLimitW) && view.gridImportW > gate.houseSpaceGridLimitW);
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
        if (gate?.enabled !== true || gate.mode !== 'routine') throw new Error('Coordinator disabled');
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
    try {
      if (lease.controlScope !== 'house-only') {
        const offices = this.homey.drivers.getDriver('stream').getDevices() as any[];
        const office = offices.find((d) => d.getId() === lease.officeDeviceId);
        if (!office || !office.getAvailable()) throw new Error('Office unavailable for expiry stop');
        const reserve = office.getCapabilityValue('backup_reserve_soc');
        if (reserve !== lease.officeRestoreReserve) {
          if (reserve !== lease.officeExpectedReserve) throw new Error('Office manual ownership changed');
          await office.flowSetBackupReserve(lease.officeRestoreReserve);
        }
        await this.verifyOfficeChargeStopped(office);
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
        await this.refreshCoordinatedReadings();
      }
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
            await this.appMqtt.publishHouseReserve(sn, houseReserveFrame(sn, lease.restoreEnabled, lease.restorePercent, ((Date.now() + restoreIds.indexOf(id)) & 0x7fffffff) || 1));
          }
        }
        let verified = false;
        for (let i = 0; i < 90; i++) {
          await new Promise<void>((resolve) => {
            this.homey.setTimeout(resolve, 500);
          });
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
      this.homey.settings.set('houseReserveLease', {
        ...lease, completed: true, restoredAt: Date.now(), ...(guardLost ? { stopReason: houseGuardFailure || stopFault || 'House guard lost' } : {}), ...(stopFault ? { fault: stopFault } : {}),
      });
    } catch (error: any) {
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

  /** Single scoped coordinator: stop office before house changes; never touch feed-in/CT. */
  async requestCoordinatedReserve(body: any): Promise<Record<string, unknown>> {
    if (this.coordinatedReserveBusy || this.houseReserveBusy) return { verified: false, busy: true };
    const gate = this.homey.settings.get('houseReserveControl');
    if (gate?.enabled !== true || gate.mode !== 'routine' || gate.expiresAt !== null
      || !Number.isFinite(gate.siteChargeKw) || !Number.isFinite(gate.officeNativeChargeKw)
      || !Number.isFinite(gate.houseNativeChargeKw) || gate.houseNativeChargeKw <= 0
      || gate.officeNativeChargeKw <= 0 || gate.siteChargeKw < gate.officeNativeChargeKw) throw new Error('Routine coordinator disabled/unconfigured');
    const pendingStop = this.homey.settings.get('houseReserveLease');
    if (pendingStop?.stoppingSince && !pendingStop.completed && !pendingStop.fault) return { verified: false, stopping: true, stoppingSince: pendingStop.stoppingSince };
    const targetKeys = ['housePercent', 'expectedHousePercent', 'officePercent', 'expectedOfficePercent', 'leaseUntil',
      'releaseOfficeOnly', 'houseOnly', 'houseMemberDeviceIds'];
    if (!body || Object.keys(body).some((k) => !targetKeys.includes(k))
      || !Number.isFinite(body.leaseUntil) || body.leaseUntil <= Date.now() || body.leaseUntil > Date.now() + 180000
      || ![body.officePercent, body.expectedOfficePercent].every((v) => Number.isSafeInteger(v) && v >= gate.officeRestoreReserve && v <= 100)) throw new Error('Invalid coordinated target');
    // Scope is explicit on both sides. A disabled office is not a dependency
    // of house control, and cannot be silently re-enrolled by a stale runner.
    if ((body.houseOnly === true) !== (gate.controlScope === 'house-only')
      || (body.houseOnly !== undefined && typeof body.houseOnly !== 'boolean')) throw new Error('Coordinator control scope mismatch');
    if (Array.isArray(gate.houseMemberDeviceIds) && JSON.stringify(body.houseMemberDeviceIds) !== JSON.stringify(gate.houseMemberDeviceIds)) throw new Error('Requested house membership changed');
    if (body.houseOnly === true) {
      if (body.releaseOfficeOnly === true || body.officePercent !== gate.officeRestoreReserve
        || body.expectedOfficePercent !== gate.officeRestoreReserve) throw new Error('Office control prohibited in house-only scope');
      const prior = this.homey.settings.get('houseReserveLease');
      if (prior && (!prior.completed || prior.fault) && prior.controlScope !== 'house-only') throw new Error('House-only transition requires reviewed quiescence');
      this.coordinatedReserveBusy = true;
      try {
        await this.requestHouseReserve({
          deviceId: gate.deviceId,
          enabled: true,
          percent: body.housePercent,
          expectedEnabled: true,
          expectedPercent: body.expectedHousePercent,
          leaseUntil: body.leaseUntil,
          officeExpectedReserve: gate.officeRestoreReserve,
          ...(Array.isArray(gate.houseMemberDeviceIds) ? { houseMemberDeviceIds: body.houseMemberDeviceIds } : {}),
        });
        return {
          verified: true,
          housePercent: body.housePercent,
          officePercent: gate.officeRestoreReserve,
          controlScope: 'house-only',
          leaseUntil: body.leaseUntil,
        };
      } finally {
        this.coordinatedReserveBusy = false;
      }
    }
    const office = (this.homey.drivers.getDriver('stream').getDevices() as any[]).find((d) => d.getId() === gate.officeDeviceId);
    const house = (this.homey.drivers.getDriver('stream_5000_unit').getDevices() as any[]).find((d) => d.getId() === gate.deviceId && d.getData()?.sn === gate.serial);
    if (!office?.getAvailable() || (body.releaseOfficeOnly !== true && !house?.getAvailable())) throw new Error('Coordinated device unavailable');
    if (office.getCapabilityValue('backup_reserve_soc') !== body.expectedOfficePercent) throw new Error('Office manual ownership changed');
    if (body.releaseOfficeOnly === true) {
      if (body.officePercent !== gate.officeRestoreReserve) throw new Error('Office-only action must stop charging');
      this.coordinatedReserveBusy = true;
      try {
        if (body.expectedOfficePercent !== gate.officeRestoreReserve) await office.flowSetBackupReserve(gate.officeRestoreReserve);
        await this.verifyOfficeChargeStopped(office);
        const lease = this.homey.settings.get('houseReserveLease');
        if (lease) this.homey.settings.set('houseReserveLease', { ...lease, completed: true, fault: 'Manual house ownership preserved; office stopped' });
        return {
          verified: true, officePercent: gate.officeRestoreReserve, housePercent: body.expectedHousePercent, leaseUntil: body.leaseUntil,
        };
      } finally {
        this.coordinatedReserveBusy = false;
      }
    }
    const oldHouse = freshReserveSnapshot(house.getConfigurationDiagnostics());
    if (!oldHouse.enabled || oldHouse.percent !== body.expectedHousePercent) throw new Error('House manual ownership changed');
    if (body.officePercent > gate.officeRestoreReserve && oldHouse.percent !== body.housePercent) throw new Error('Establish house reserve before office start');
    this.coordinatedReserveBusy = true;
    try {
      // Existing office action includes its native fleet readback verification.
      if (body.expectedOfficePercent !== gate.officeRestoreReserve && oldHouse.percent !== body.housePercent) {
        await office.flowSetBackupReserve(gate.officeRestoreReserve);
      }
      if (oldHouse.percent !== body.housePercent) await this.verifyOfficeChargeStopped(office);
      const officeCurrent = office.getCapabilityValue('backup_reserve_soc');
      await this.requestHouseReserve({
        deviceId: gate.deviceId,
        enabled: true,
        percent: body.housePercent,
        expectedEnabled: true,
        expectedPercent: oldHouse.percent,
        leaseUntil: body.leaseUntil,
        officeExpectedReserve: Math.max(officeCurrent, body.officePercent),
      });
      if (body.officePercent > gate.officeRestoreReserve) {
        await office.flowRefresh();
        this.assertCoordinatedPower(house, office, gate);
      }
      if (office.getCapabilityValue('backup_reserve_soc') !== body.officePercent) await office.flowSetBackupReserve(body.officePercent);
      if (body.officePercent > gate.officeRestoreReserve) {
        await office.flowRefresh();
        this.assertCoordinatedPower(house, office, gate);
      }
      const lease = this.homey.settings.get('houseReserveLease');
      this.homey.settings.set('houseReserveLease', { ...lease, officeExpectedReserve: body.officePercent });
      return {
        verified: true, housePercent: body.housePercent, officePercent: body.officePercent, leaseUntil: body.leaseUntil,
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
    }
  }

  async requestHouseReserve(body: any): Promise<Record<string, unknown>> {
    if (this.houseReserveBusy) throw new Error('House reserve command already pending');
    this.houseReserveBusy = true;
    try {
      const gate = this.homey.settings.get('houseReserveControl');
      if (gate?.enabled !== true || (gate.mode !== 'routine' && (!Number.isFinite(gate.expiresAt) || gate.expiresAt <= Date.now()))
        || (gate.mode === 'routine' && gate.expiresAt !== null)
        || !Number.isSafeInteger(gate.minPercent) || !Number.isSafeInteger(gate.maxPercent)
        || gate.minPercent < 0 || gate.maxPercent > 100 || gate.minPercent > gate.maxPercent) throw new Error('House reserve bridge disabled/expired');
      if (!body || Object.keys(body).some((k) => !['deviceId', 'enabled', 'percent', 'expectedEnabled', 'expectedPercent', 'leaseUntil', 'officeExpectedReserve', 'houseMemberDeviceIds'].includes(k))
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
        if (Array.isArray(gate.houseMemberDeviceIds)) {
          const view = houseInstallationSnapshot(gate, this.homey.drivers.getDriver('stream_5000_unit').getDevices());
          if (gate.houseGridChargingEnabled === false && body.percent > view.noChargeReserveCeilingPercent) throw new Error('House grid charging disabled pending power confirmation');
          if (view.reservePercent !== before.percent
            || (previousLease
            && !previousLease.completed
            && JSON.stringify(previousLease.houseMemberDeviceIds) !== JSON.stringify(gate.houseMemberDeviceIds))) throw new Error('House installation ownership changed');
        }
        if (gate.controlScope === 'house-only' && (body.officeExpectedReserve !== gate.officeRestoreReserve
          || (previousLease && !previousLease.completed && previousLease.controlScope !== 'house-only'))) throw new Error('House-only transition requires reviewed quiescence');
        if (previousLease?.fault) throw new Error('Prior coordinated reserve fault requires review');
        this.homey.settings.set('houseReserveLease', {
          until: body.leaseUntil,
          ...(Array.isArray(gate.houseMemberDeviceIds) ? { houseMemberDeviceIds: gate.houseMemberDeviceIds.slice(), houseMemberSerials: { ...gate.houseMemberSerials } } : {}),
          ...(gate.controlScope === 'house-only' ? { controlScope: 'house-only' } : {}),
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
        this.ensureHouseReserveWatchdog();
      }
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
          await mqtt.publishHouseReserve(sn, houseReserveFrame(sn, body.enabled, body.percent, ((Date.now() + targets.indexOf(id)) & 0x7fffffff) || 1));
        }
      }
      let stableMemberPasses = 0;
      for (let i = 0; i < 90 && Date.now() - started < 45000; i++) {
        await new Promise<void>((resolve) => {
          this.homey.setTimeout(resolve, 500);
        });
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
              await this.refreshCoordinatedReadings();
              continue;
            }
          }
          return {
            verified: true, changed: true, enabled: after.enabled, percent: after.percent,
          };
        }
      }
      throw new Error('House reserve command unverified; no blind retry');
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
