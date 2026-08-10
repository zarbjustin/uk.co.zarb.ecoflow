'use strict';

import Homey from 'homey';
import { getApp } from '../../lib/appApi';
import { AppFrameHandler } from '../../lib/EcoFlowAppMqtt';
import { parseStreamAc5000Frame } from '../../lib/streamAc5000Protocol';
import { Es22CapabilityValues, mapStreamAc5000 } from '../../lib/streamAc5000Mapping';
import { STREAM_AC5000_MODEL } from '../../lib/appDevices';
import { clearSavedAppAuthCreds, hasSavedAppAuthCreds } from '../../lib/appAuthPairing';
import {
  describeEs22Frame,
  Es22FrameDiagnostic,
  Es22SampleGate,
  es22FrameShape,
  es22TopicKind,
  formatEs22CapabilitySnapshot,
} from '../../lib/streamAc5000Diagnostics';

/**
 * EXPERIMENTAL — STREAM AC 5000 (ES22) monitoring device.
 *
 * Read-only by design: this device subscribes to the app-auth MQTT feed and
 * never publishes. It also never polls the Developer/Open REST API — an ES22
 * answers code 1006 there, so polling would only burn the account's rate limit.
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
const NOT_CONNECTED_MESSAGE = 'EcoFlow app connection unavailable — delete and re-add this device to sign in again.';

module.exports = class StreamAc5000Device extends Homey.Device {
  private frameHandler?: AppFrameHandler;
  private subscribedSn?: string;
  private lastFrameAt = 0;
  private lastTelemetryAt = 0;
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
  private diagnosticCaptureNext = false;
  private subscriptionState: 'starting' | 'active' | 'waiting' | 'stopped' = 'starting';
  private subscriptionAttempts = 0;
  private resubscribeCount = 0;
  private readonly sampleGate = new Es22SampleGate();
  private readonly commandKeys = new Set<string>();
  private readonly commandStats = new Map<string, { frames: number; parsed: number; unparsed: number }>();

  async onInit(): Promise<void> {
    this.startedAt = Date.now();
    this.diagnosticCaptureNext = Boolean(this.getSetting('diagnostic_capture_next'));
    const sn = this.getData().sn as string;
    const localizedStatus = this.homey.__('device.stream_ac5000.monitoring_only');

    await this.setSettings({
      model: STREAM_AC5000_MODEL,
      serial_number: sn,
      experimental_notice: localizedStatus && localizedStatus !== 'device.stream_ac5000.monitoring_only'
        ? localizedStatus
        : MONITORING_ONLY_FALLBACK,
    }).catch(() => {});

    this.frameHandler = (payload, topic) => {
      this.framesReceived += 1;
      this.bytesReceived += payload.length;
      this.lastFrameAt = Date.now();
      const telemetry = parseStreamAc5000Frame(payload);
      const diagnostic = describeEs22Frame(payload, sn, telemetry ? 0 : undefined);
      if (!telemetry) {
        this.unparsedFrames += 1;
        this.recordCommands(diagnostic, false);
        this.captureUnparsedFrame(diagnostic, topic);
        this.maybeLogDiagnosticSummary(topic);
        return;
      }
      this.parsedFrames += 1;
      this.lastTelemetryAt = Date.now();
      const values = mapStreamAc5000(telemetry);
      Object.assign(this.lastValues, values);
      this.recordCommands(diagnostic, true);
      this.captureRequestedSnapshot(diagnostic, topic);
      this.maybeLogDiagnosticSummary(topic);
      this.queueTelemetry(values).catch((e) => this.error('apply telemetry', e?.message || e));
    };

    await this.subscribe();
    this.watchdog = this.homey.setInterval(() => {
      this.checkAvailability().catch((e) => this.error('availability check', e?.message || e));
    }, WATCHDOG_INTERVAL_MS);

    this.log(`STREAM AC 5000 ${sn.slice(0, 4)}… initialised (monitoring only)`);
  }

  private async subscribe(): Promise<void> {
    const sn = this.getData().sn as string;
    let subscribed = false;
    this.subscriptionState = 'starting';
    this.subscriptionAttempts += 1;
    try {
      subscribed = await getApp(this.homey).subscribeAppRealtime(sn, this.frameHandler!);
    } catch (e: any) {
      this.error('app-auth subscribe failed', e?.message || 'unknown error');
    }
    if (subscribed) {
      this.subscribedSn = sn;
      this.subscriptionState = 'active';
      this.log(`[diag] ES22 subscription state=active attempts=${this.subscriptionAttempts} reconnects=${this.resubscribeCount}`);
      if (this.resubscribeTimer) {
        this.homey.clearInterval(this.resubscribeTimer);
        this.resubscribeTimer = null;
      }
      return;
    }
    this.subscriptionState = 'waiting';
    await this.setOffline(NOT_CONNECTED_MESSAGE);
    if (!this.resubscribeTimer) {
      this.resubscribeTimer = this.homey.setInterval(() => {
        if (this.subscribedSn) return;
        this.subscribe().catch((e) => this.error('resubscribe', e?.message || e));
      }, RESUBSCRIBE_INTERVAL_MS);
    }
  }

  private queueTelemetry(values: Es22CapabilityValues): Promise<void> {
    const run = async () => {
      await this.applyTelemetry(values);
      await this.setOnline();
    };
    this.applyChain = this.applyChain.then(run, run);
    return this.applyChain;
  }

  private async applyTelemetry(values: Es22CapabilityValues): Promise<void> {
    for (const [capability, value] of Object.entries(values)) {
      if (!this.hasCapability(capability)) continue;
      if (this.lastValues[capability] === value && this.getCapabilityValue(capability) === value) continue;
      this.lastValues[capability] = value;
      await this.setCapabilityValue(capability, value).catch((e) => this.error(capability, e));
    }
  }

  private recordCommands(diagnostic: Es22FrameDiagnostic, parsed: boolean): void {
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

  private captureUnparsedFrame(diagnostic: Es22FrameDiagnostic, topic: string): void {
    const shape = es22FrameShape(diagnostic);
    if (!this.sampleGate.shouldCapture(diagnostic)) return;
    this.log(
      `[diag] ES22 unparsed frame shape=${shape} topic=${es22TopicKind(topic)} bytes=${diagnostic.bytes} `
          + `sha256=${diagnostic.sha256} commands=${diagnostic.commands.join(',') || 'none'} `
          + `truncated=${diagnostic.truncated} sample=${diagnostic.sampleBase64}`,
    );
  }

  private captureRequestedSnapshot(diagnostic: Es22FrameDiagnostic, topic: string): void {
    if (!this.diagnosticCaptureNext || !diagnostic.commands.includes('254/39')) return;
    this.diagnosticCaptureNext = false;
    this.log(
      `[diag] ES22 requested snapshot topic=${es22TopicKind(topic)} `
      + `values=${formatEs22CapabilitySnapshot(this.lastValues)}`,
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
      `[diag] ES22 telemetry frames=${this.framesReceived} parsed=${this.parsedFrames} `
      + `unparsed=${this.unparsedFrames} bytes=${this.bytesReceived} topic=${es22TopicKind(topic)} `
      + `subscription=${this.subscriptionState} frame_age_s=${frameAgeSec} telemetry_age_s=${telemetryAgeSec} `
      + `command_frames=${commandStats} values=${formatEs22CapabilitySnapshot(this.lastValues)}`,
    );
  }

  private async checkAvailability(): Promise<void> {
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
    this.resubscribeCount += 1;
    if (this.subscribedSn && this.frameHandler) {
      getApp(this.homey).unsubscribeAppRealtime(this.subscribedSn, this.frameHandler);
      this.subscribedSn = undefined;
    }
    await this.subscribe();
  }

  async onSettings({ newSettings, changedKeys }: { newSettings: any; changedKeys: string[] }): Promise<void> {
    if (!changedKeys.includes('diagnostic_capture_next')) return;
    this.diagnosticCaptureNext = Boolean(newSettings.diagnostic_capture_next);
    if (this.diagnosticCaptureNext) {
      this.log('[diag] ES22 next 254/39 telemetry snapshot requested');
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
    this.subscriptionState = 'stopped';
    if (this.framesReceived > 0) {
      this.log(
        `[diag] ES22 session summary frames=${this.framesReceived} parsed=${this.parsedFrames} `
        + `unparsed=${this.unparsedFrames} bytes=${this.bytesReceived} `
        + `commands=${[...this.commandKeys].sort().join(',') || 'none'} `
        + `values=${formatEs22CapabilitySnapshot(this.lastValues)}`,
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
