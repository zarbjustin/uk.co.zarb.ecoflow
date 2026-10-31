'use strict';

import Homey from 'homey';
import { randomUUID } from 'crypto';
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

  async refreshCoordinatedReadings(): Promise<Record<string, unknown>> {
    if (this.coordinatedReadInFlight) return this.coordinatedReadInFlight;
    this.coordinatedReadInFlight = this.readCoordinatedDevices().finally(() => {
      this.coordinatedReadInFlight = null;
    });
    return this.coordinatedReadInFlight;
  }

  private async readCoordinatedDevices(): Promise<Record<string, unknown>> {
    const gate = this.homey.settings.get('houseReserveControl');
    const house = (this.homey.drivers.getDriver('stream_5000_unit').getDevices() as any[]).find((d) => d.getId() === gate?.deviceId && d.getData()?.sn === gate?.serial);
    const office = (this.homey.drivers.getDriver('stream').getDevices() as any[]).find((d) => d.getId() === gate?.officeDeviceId);
    if (!house || !office || !/^ES21[A-Z0-9]{4,60}$/.test(gate.serial)) throw new Error('Explicit coordinated read mapping required');
    const powerKey = 'stream_unit_power_battery_flow';
    const previousPowerAt = house.getAppliedReadingAt(powerKey);
    const requestedAt = Date.now();
    await office.flowRefresh();
    const houseFresh = (): boolean => {
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
    await this.appMqtt.requestHouseRead(gate.serial);
    for (let i = 0; i < 12 && !houseFresh(); i++) {
      await new Promise<void>((resolve) => {
        this.homey.setTimeout(resolve, 500);
      });
    }
    const observations: Record<string, ReportingObservation> = office.getReportingDiagnostics()?.observations || {};
    const officeFresh = ['measure_battery', 'measure_power'].every((key) => {
      const f = observations[key];
      return f && Number.isFinite(f.value) && Number.isFinite(f.receivedAt) && f.receivedAt > 0 && f.receivedAt <= Date.now() && Date.now() - f.receivedAt <= 10000;
    });
    return {
      houseFresh: houseFresh(), officeFresh, requested: true, checkedAt: Date.now(), settingsWrites: 0,
    };
  }

  private officeChargingWatts(office: any): number {
    const fields = office.getReportingDiagnostics()?.observations;
    const power: ReportingObservation | undefined = fields?.measure_power;
    if (!power || !Number.isFinite(power.value) || !Number.isFinite(power.receivedAt)
      || power.receivedAt <= 0 || power.receivedAt > Date.now() || Date.now() - power.receivedAt > 30000) throw new Error('Office battery power receipt unavailable');
    return Math.max(0, power.value);
  }

  private async verifyOfficeChargeStopped(office: any): Promise<void> {
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
    if (lease.officeExpectedReserve > lease.officeRestoreReserve) {
      try {
        const house = (this.homey.drivers.getDriver('stream_5000_unit').getDevices() as any[]).find((d) => d.getId() === lease.houseDeviceId && d.getData()?.sn === lease.serial);
        const office = (this.homey.drivers.getDriver('stream').getDevices() as any[]).find((d) => d.getId() === lease.officeDeviceId);
        const gate = this.homey.settings.get('houseReserveControl');
        if (gate?.enabled !== true || gate.mode !== 'routine') throw new Error('Coordinator disabled');
        const power = house?.getReadingDiagnostics()?.stream_unit_power_battery_flow;
        const officePower: ReportingObservation | undefined = office?.getReportingDiagnostics()?.observations?.measure_power;
        if (power?.stale !== false || power.ageSec > 20 || !officePower || Date.now() - officePower.receivedAt > 20000) await this.refreshCoordinatedReadings();
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
    try {
      const offices = this.homey.drivers.getDriver('stream').getDevices() as any[];
      const office = offices.find((d) => d.getId() === lease.officeDeviceId);
      if (!office || !office.getAvailable()) throw new Error('Office unavailable for expiry stop');
      const reserve = office.getCapabilityValue('backup_reserve_soc');
      if (reserve !== lease.officeRestoreReserve) {
        if (reserve !== lease.officeExpectedReserve) throw new Error('Office manual ownership changed');
        await office.flowSetBackupReserve(lease.officeRestoreReserve);
      }
      await this.verifyOfficeChargeStopped(office);
      const houses = this.homey.drivers.getDriver('stream_5000_unit').getDevices() as any[];
      const house = houses.find((d) => d.getId() === lease.houseDeviceId && d.getData()?.sn === lease.serial);
      if (!house || !house.getAvailable()) throw new Error('House unavailable for expiry restoration');
      const current = freshReserveSnapshot(house.getConfigurationDiagnostics());
      if (current.enabled !== lease.restoreEnabled || current.percent !== lease.restorePercent) {
        if (current.enabled !== lease.expectedEnabled || current.percent !== lease.expectedPercent) throw new Error('House manual ownership changed');
        if (!this.appMqtt?.connected) throw new Error('House restoration transport unavailable');
        await this.appMqtt.publishHouseReserve(lease.serial, houseReserveFrame(lease.serial, lease.restoreEnabled, lease.restorePercent, (Date.now() & 0x7fffffff) || 1));
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
      this.homey.settings.set('houseReserveLease', { ...lease, completed: true, restoredAt: Date.now() });
    } catch (error: any) {
      this.homey.settings.set('houseReserveLease', { ...lease, fault: error.message });
      throw error;
    } finally {
      this.houseReserveBusy = false;
    }
  }

  /** Single scoped coordinator: stop office before house changes; never touch feed-in/CT. */
  async requestCoordinatedReserve(body: any): Promise<Record<string, unknown>> {
    if (this.coordinatedReserveBusy || this.houseReserveBusy) throw new Error('Coordinated command pending');
    const gate = this.homey.settings.get('houseReserveControl');
    if (gate?.enabled !== true || gate.mode !== 'routine' || gate.expiresAt !== null
      || !Number.isFinite(gate.siteChargeKw) || !Number.isFinite(gate.officeNativeChargeKw)
      || !Number.isFinite(gate.houseNativeChargeKw) || gate.houseNativeChargeKw <= 0
      || gate.officeNativeChargeKw <= 0 || gate.siteChargeKw < gate.officeNativeChargeKw) throw new Error('Routine coordinator disabled/unconfigured');
    if (!body || Object.keys(body).some((k) => !['housePercent', 'expectedHousePercent', 'officePercent', 'expectedOfficePercent', 'leaseUntil', 'releaseOfficeOnly'].includes(k))
      || !Number.isFinite(body.leaseUntil) || body.leaseUntil <= Date.now() || body.leaseUntil > Date.now() + 180000
      || ![body.officePercent, body.expectedOfficePercent].every((v) => Number.isSafeInteger(v) && v >= gate.officeRestoreReserve && v <= 100)) throw new Error('Invalid coordinated target');
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
    } catch (error) {
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
      if (!body || Object.keys(body).some((k) => !['deviceId', 'enabled', 'percent', 'expectedEnabled', 'expectedPercent', 'leaseUntil', 'officeExpectedReserve'].includes(k))
        || body.deviceId !== gate.deviceId || typeof body.enabled !== 'boolean'
        || !Number.isSafeInteger(body.percent) || body.percent < gate.minPercent || body.percent > gate.maxPercent) throw new Error('House reserve scope/target rejected');
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
        if (previousLease?.fault) throw new Error('Prior coordinated reserve fault requires review');
        this.homey.settings.set('houseReserveLease', {
          until: body.leaseUntil,
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
      await mqtt.publishHouseReserve(gate.serial, houseReserveFrame(gate.serial, body.enabled, body.percent, (started & 0x7fffffff) || 1));
      for (let i = 0; i < 90; i++) {
        await new Promise<void>((resolve) => {
          this.homey.setTimeout(resolve, 500);
        });
        const after = read();
        if (after.enabled === body.enabled && after.percent === body.percent && (before.enabled === body.enabled || after.enabledAgeSec <= (Date.now() - started) / 1000 + 1)
          && (before.percent === body.percent || after.percentAgeSec <= (Date.now() - started) / 1000 + 1)) {
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
      } catch (e: any) {
        this.error('App-auth MQTT reconnect failed', e?.message || 'unknown error');
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
    } catch (e: any) {
      this.error('App-auth MQTT connect failed', e?.message || 'unknown error');
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
    mqtt.end().catch((e) => this.error('App-auth MQTT teardown', e?.message || 'unknown error'));
  }
};
