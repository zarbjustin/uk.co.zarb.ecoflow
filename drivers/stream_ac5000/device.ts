'use strict';

import Homey from 'homey';
import { getApp } from '../../lib/appApi';
import { AppFrameHandler } from '../../lib/EcoFlowAppMqtt';
import { Es22Telemetry, parseStreamAc5000Frame } from '../../lib/streamAc5000Protocol';
import { mapStreamAc5000 } from '../../lib/streamAc5000Mapping';
import { STREAM_AC5000_MODEL } from '../../lib/appDevices';
import { clearSavedAppAuthCreds, hasSavedAppAuthCreds } from '../../lib/appAuthPairing';
import { describeEs22Frame, es22TopicKind } from '../../lib/streamAc5000Diagnostics';

/**
 * EXPERIMENTAL — STREAM AC 5000 (ES22) monitoring device.
 *
 * Read-only by design: this device subscribes to the app-auth MQTT feed and
 * never publishes. It also never polls the Developer/Open REST API — an ES22
 * answers code 1006 there, so polling would only burn the account's rate limit.
 *
 * Availability is therefore derived purely from the age of the last MQTT frame,
 * and the unavailable state is applied at most once per transition so a quiet
 * device does not produce a stream of notifications.
 */

/** How often the data-age watchdog runs. */
const WATCHDOG_INTERVAL_MS = 60 * 1000;
/** Default age after which the device is reported unavailable. */
const DEFAULT_UNAVAILABLE_AFTER_MIN = 20;
/** Grace period after (re)start before a silent device is called unavailable. */
const STARTUP_GRACE_MS = 5 * 60 * 1000;
/** Retry cadence while the app-auth session cannot be established. */
const RESUBSCRIBE_INTERVAL_MS = 5 * 60 * 1000;
const DIAGNOSTIC_SAMPLE_LIMIT = 3;
const DIAGNOSTIC_SUMMARY_EVERY_FRAMES = 100;

const UNAVAILABLE_MESSAGE = 'No data from EcoFlow (experimental app connection). Check the EcoFlow account in the app settings.';
const NOT_CONNECTED_MESSAGE = 'Experimental EcoFlow app connection unavailable — re-pair this device to sign in again.';

module.exports = class StreamAc5000Device extends Homey.Device {
  private frameHandler?: AppFrameHandler;
  private subscribedSn?: string;
  private lastFrameAt = 0;
  private startedAt = 0;
  private watchdog: NodeJS.Timeout | null = null;
  private resubscribeTimer: NodeJS.Timeout | null = null;
  private applyChain: Promise<void> = Promise.resolve();
  private lastValues: Record<string, number | string> = {};
  private lastResubscribeAt = 0;
  private framesReceived = 0;
  private parsedFrames = 0;
  private unparsedFrames = 0;
  private bytesReceived = 0;
  private readonly sampledFrameHashes = new Set<string>();
  private readonly commandKeys = new Set<string>();

  async onInit(): Promise<void> {
    this.startedAt = Date.now();
    const sn = this.getData().sn as string;

    await this.setSettings({
      model: STREAM_AC5000_MODEL,
      serial_number: sn,
    }).catch(() => {});

    this.frameHandler = (payload, topic) => {
      this.framesReceived += 1;
      this.bytesReceived += payload.length;
      const telemetry = parseStreamAc5000Frame(payload);
      if (!telemetry) {
        this.unparsedFrames += 1;
        this.captureUnparsedFrame(payload, topic, sn);
        return;
      }
      this.parsedFrames += 1;
      this.lastFrameAt = Date.now();
      this.recordParsedFrame(payload, topic, sn);
      this.queueTelemetry(telemetry).catch((e) => this.error('apply telemetry', e?.message || e));
    };

    await this.subscribe();
    this.watchdog = this.homey.setInterval(() => {
      this.checkAvailability().catch((e) => this.error('availability check', e?.message || e));
    }, WATCHDOG_INTERVAL_MS);

    this.log(`STREAM AC 5000 ${sn.slice(0, 4)}… initialised (experimental, monitoring only)`);
  }

  private async subscribe(): Promise<void> {
    const sn = this.getData().sn as string;
    let subscribed = false;
    try {
      subscribed = await getApp(this.homey).subscribeAppRealtime(sn, this.frameHandler!);
    } catch (e: any) {
      this.error('app-auth subscribe failed', e?.message || 'unknown error');
    }
    if (subscribed) {
      this.subscribedSn = sn;
      if (this.resubscribeTimer) {
        this.homey.clearInterval(this.resubscribeTimer);
        this.resubscribeTimer = null;
      }
      return;
    }
    await this.setOffline(NOT_CONNECTED_MESSAGE);
    if (!this.resubscribeTimer) {
      this.resubscribeTimer = this.homey.setInterval(() => {
        if (this.subscribedSn) return;
        this.subscribe().catch((e) => this.error('resubscribe', e?.message || e));
      }, RESUBSCRIBE_INTERVAL_MS);
    }
  }

  private queueTelemetry(telemetry: Es22Telemetry): Promise<void> {
    const run = async () => {
      await this.applyTelemetry(telemetry);
      await this.setOnline();
    };
    this.applyChain = this.applyChain.then(run, run);
    return this.applyChain;
  }

  private async applyTelemetry(telemetry: Es22Telemetry): Promise<void> {
    const values = mapStreamAc5000(telemetry);
    for (const [capability, value] of Object.entries(values)) {
      if (!this.hasCapability(capability)) continue;
      if (this.lastValues[capability] === value && this.getCapabilityValue(capability) === value) continue;
      this.lastValues[capability] = value;
      await this.setCapabilityValue(capability, value).catch((e) => this.error(capability, e));
    }
  }

  private recordParsedFrame(payload: Buffer, topic: string, sn: string): void {
    const diagnostic = describeEs22Frame(payload, sn, 0);
    for (const command of diagnostic.commands) this.commandKeys.add(command);
    if (this.parsedFrames === 1 || this.framesReceived % DIAGNOSTIC_SUMMARY_EVERY_FRAMES === 0) {
      this.log(
        `[diag] ES22 telemetry frames=${this.framesReceived} parsed=${this.parsedFrames} `
        + `unparsed=${this.unparsedFrames} bytes=${this.bytesReceived} `
        + `topic=${es22TopicKind(topic)} commands=${[...this.commandKeys].sort().join(',') || 'none'}`,
      );
    }
  }

  private captureUnparsedFrame(payload: Buffer, topic: string, sn: string): void {
    const diagnostic = describeEs22Frame(payload, sn);
    for (const command of diagnostic.commands) this.commandKeys.add(command);
    if (this.sampledFrameHashes.has(diagnostic.sha256)) return;
    if (this.sampledFrameHashes.size >= DIAGNOSTIC_SAMPLE_LIMIT) return;
    this.sampledFrameHashes.add(diagnostic.sha256);
    this.log(
      `[diag] ES22 unparsed frame topic=${es22TopicKind(topic)} bytes=${diagnostic.bytes} `
          + `sha256=${diagnostic.sha256} commands=${diagnostic.commands.join(',') || 'none'} `
          + `truncated=${diagnostic.truncated} sample=${diagnostic.sampleBase64}`,
    );
  }

  private async checkAvailability(): Promise<void> {
    const limitMs = this.unavailableAfterMs();
    const reference = this.lastFrameAt || this.startedAt;
    const age = Date.now() - reference;
    if (this.lastFrameAt === 0 && Date.now() - this.startedAt < STARTUP_GRACE_MS) return;
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
    if (this.subscribedSn && this.frameHandler) {
      getApp(this.homey).unsubscribeAppRealtime(this.subscribedSn, this.frameHandler);
      this.subscribedSn = undefined;
    }
    await this.subscribe();
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

  async onDeleted(): Promise<void> {
    await this.teardown();
    // Removing the last STREAM AC 5000 removes the stored EcoFlow account with
    // it: nothing else uses it, and an unused account password is pure risk.
    const sn = this.getData().sn as string;
    const remaining = this.driver.getDevices().filter((d) => (d.getData()?.sn as string) !== sn);
    if (remaining.length === 0 && hasSavedAppAuthCreds(this.homey)) {
      clearSavedAppAuthCreds(this.homey);
      this.log('Last STREAM AC 5000 removed — stored EcoFlow account cleared');
    }
  }

  async onUninit(): Promise<void> {
    await this.teardown();
  }

  private async teardown(): Promise<void> {
    if (this.framesReceived > 0) {
      this.log(
        `[diag] ES22 session summary frames=${this.framesReceived} parsed=${this.parsedFrames} `
        + `unparsed=${this.unparsedFrames} bytes=${this.bytesReceived} `
        + `commands=${[...this.commandKeys].sort().join(',') || 'none'}`,
      );
    }
    if (this.subscribedSn && this.frameHandler) {
      getApp(this.homey).unsubscribeAppRealtime(this.subscribedSn, this.frameHandler);
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
  }
};
