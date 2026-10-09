'use strict';

import Homey from 'homey';
import { EcoFlowMqtt, QuotaHandler, StatusHandler } from './lib/EcoFlowMqtt';
import { AppFrameHandler, EcoFlowAppMqtt } from './lib/EcoFlowAppMqtt';
import { StreamDiscoveryInventory } from './lib/streamDiscovery';
import { AppDevice } from './lib/appDevices';
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
  private readonly streamDiscovery = new StreamDiscoveryInventory();
  private readonly settingsHandler = (key: string) => this.onSettingChanged(key);

  async onInit(): Promise<void> {
    this.stopping = false;
    this.streamDiscovery.clear();
    if (this.homey.flow) {
      this.homey.flow.getConditionCard('stream_5000_mode_is').registerRunListener(
        (args: any) => args.device.configurationModeIs(args.mode),
      );
      this.homey.flow.getConditionCard('stream_5000_reserve_enabled').registerRunListener(
        (args: any) => args.device.configurationReserveEnabled(),
      );
    }
    this.homey.settings.on('set', this.settingsHandler);
    // Removing the app-connected STREAM account is an 'unset', not a 'set' — the
    // app-auth session must be torn down for that too.
    this.homey.settings.on('unset', this.settingsHandler);
    this.log('EcoFlow app initialised');
  }

  private onSettingChanged(key: string): void {
    if (this.stopping) return;
    if (['accessKey', 'secretKey', 'host', 'mqtt_enabled'].includes(key)) {
      if (this.settingsTimer) this.homey.clearTimeout(this.settingsTimer);
      this.settingsTimer = this.homey.setTimeout(() => {
        this.settingsTimer = null;
        this.applyConnectionSettings().catch((e) => this.error('Apply connection settings', e));
      }, 250);
    }
    if (APP_AUTH_SETTINGS.includes(key)) {
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
  async subscribeRealtime(sn: string, onQuota: QuotaHandler, onStatus?: StatusHandler): Promise<boolean> {
    if (this.stopping) return false;
    const mqtt = await this.getMqtt();
    if (this.stopping || !mqtt) return false;
    mqtt.subscribe(sn, onQuota, onStatus);
    return true;
  }

  unsubscribeRealtime(sn: string, onQuota?: QuotaHandler, onStatus?: StatusHandler): void {
    this.mqtt?.unsubscribe(sn, onQuota, onStatus);
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
  async subscribeAppRealtime(sn: string, onFrame: AppFrameHandler): Promise<boolean> {
    if (this.stopping) return false;
    const mqtt = await this.getAppMqtt();
    if (this.stopping || !mqtt) return false;
    mqtt.subscribe(sn, onFrame);
    return true;
  }

  unsubscribeAppRealtime(sn: string, onFrame?: AppFrameHandler): void {
    if (!this.appMqtt) return;
    this.appMqtt.unsubscribe(sn, onFrame);
    // The last app-connected STREAM device just went: drop the session rather than hold an
    // idle authenticated WSS connection open.
    if (this.appMqtt.hasSubscribers) return;
    const mqtt = this.appMqtt;
    this.appMqtt = null;
    this.appMqttCredsKey = '';
    mqtt.end().catch((e) => this.error('App-auth MQTT teardown', e?.message || 'unknown error'));
  }
};
