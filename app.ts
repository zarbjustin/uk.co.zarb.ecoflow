'use strict';

import Homey from 'homey';
import { randomUUID } from 'crypto';
import { EcoFlowMqtt, QuotaHandler, StatusHandler } from './lib/EcoFlowMqtt';
import { AppFrameHandler, EcoFlowAppMqtt } from './lib/EcoFlowAppMqtt';
import { StreamDiscoveryInventory } from './lib/streamDiscovery';
import { AppDevice } from './lib/appDevices';
import { DualCtResearch } from './lib/dualCtResearch';
import { mergeDualCtInventory, probeDualCtDeveloper, dualCtInventorySummary } from './lib/dualCtSources';
import { EcoFlowClient } from './lib/EcoFlowClient';
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
