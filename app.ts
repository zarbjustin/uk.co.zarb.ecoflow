'use strict';

import Homey from 'homey';
import { EcoFlowMqtt, QuotaHandler, StatusHandler } from './lib/EcoFlowMqtt';

module.exports = class EcoFlowApp extends Homey.App {
  private mqtt: EcoFlowMqtt | null = null;
  private mqttCredsKey = '';

  async onInit(): Promise<void> {
    this.log('EcoFlow app initialised');
  }

  async onUninit(): Promise<void> {
    // Close the shared MQTT session cleanly so EcoFlow's broker (one session per
    // account) doesn't reject the next start with a stale ghost connection.
    await this.mqtt?.end().catch(() => {});
    this.mqtt = null;
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
    const { accessKey, secretKey, host } = this.getCredentials();
    if (!accessKey || !secretKey) return null;
    if (this.homey.settings.get('mqtt_enabled') === false) return null;

    // Recreate the connection if the saved credentials/region changed.
    const credsKey = `${accessKey}:${secretKey}:${host || ''}`;
    if (this.mqtt && credsKey !== this.mqttCredsKey) {
      await this.mqtt.end().catch(() => {});
      this.mqtt = null;
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
    const mqtt = await this.getMqtt();
    if (!mqtt) return false;
    mqtt.subscribe(sn, onQuota, onStatus);
    return true;
  }

  unsubscribeRealtime(sn: string, onQuota?: QuotaHandler, onStatus?: StatusHandler): void {
    this.mqtt?.unsubscribe(sn, onQuota, onStatus);
  }
};
