import Homey from 'homey';
import { randomUUID } from 'crypto';
import { DualCtMessageEvidence } from '../../lib/dualCtMessageEvidence';
import { DualCtDiagnosticEvents, DUAL_CT_MONITOR_EVENTS } from '../../lib/dualCtDiagnosticEvents';
import {
  DUAL_CT_DISPLAY_SETTINGS, DualCtDisplaySettings, dualCtDisplayOptions, dualCtDisplayVisible,
} from '../../lib/dualCtDisplaySettings';
import { appAuthClientFromSettings, clearSavedAppAuthCreds, hasSavedAppAuthCreds } from '../../lib/appAuthPairing';
import { dualCtAccountBinding, dualCtPreviewDevices, DUAL_CT_PREVIEW_CONSENT } from '../../lib/dualCtPreviewPairing';
import { hasOtherAppAuthDevices } from '../../lib/appAuthConsumers';
import { DualCtMonitor } from '../../lib/dualCtMonitor';
import { dualCtFreshAge } from '../../lib/dualCtContract';
import { AppFrameHandler } from '../../lib/EcoFlowAppMqtt';
import { dualCtCircuitRole, DualCtDisplayRoles } from '../../lib/dualCtPresentation';
import manifest from './driver.compose.json';

module.exports = class DualCtPreviewDevice extends Homey.Device {
  private readonly diagnosticEvents = new DualCtDiagnosticEvents(DUAL_CT_MONITOR_EVENTS);
  private generation = 0;
  private readonly messageEvidence = new DualCtMessageEvidence();
  private monitor: DualCtMonitor | null = null;
  private handler: AppFrameHandler | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private expiry: ReturnType<typeof setTimeout> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 30000;
  private chain: Promise<void> = Promise.resolve();
  private readonly pendingWrites = new Map<string, Promise<void>>();
  private readonly cancelWrites = new Set<() => void>();
  private unavailablePending: Promise<void> | null = null;
  private availabilityRevision = 0;
  private connectionEpoch: number | null = null;
  private lastReceivedMonoMs: number | null = null;
  private enabled = false;
  private renderQueuedGeneration: number | null = null;
  private acceptedPackets = 0;
  private receivedFrames = 0;
  private rejectedFrames = 0;
  private lastFrameAt: number | null = null;
  private lastAcceptedAt: number | null = null;
  private state = 'waiting';
  private displayRoles: DualCtDisplayRoles = {};
  private readonly accountChanged = (key: string) => {
    if (['appAuthEmail', 'appAuthPassword', 'appAuthHost'].includes(key)) {
      this.stop('account_changed').catch(() => {});
    }
  };

  private text(key: string): string {
    return this.homey.__(`dual_ct_preview.${key}`);
  }

  async onInit(): Promise<void> {
    this.homey.settings.on('set', this.accountChanged);
    this.homey.settings.on('unset', this.accountChanged);
    const consented = this.getSetting('preview_enabled') === true
      && this.getStoreValue('dualCtPreviewConsent') === DUAL_CT_PREVIEW_CONSENT;
    const clear = this.stop(consented ? 'waiting' : 'disabled'); // Clear persisted capability values first.
    const { generation } = this;
    await clear;
    this.displayRoles = { aRole: dualCtCircuitRole(this.getSetting('ct1_role')), bRole: dualCtCircuitRole(this.getSetting('ct2_role')) };
    try {
      await this.ensureDisplays(generation);
    } catch {
      if (generation === this.generation) {
        this.state = 'display_failed';
        await this.setUnavailable(this.text('display_failed'));
      }
      return; // A failed capability upgrade must not start or renew a subscription.
    }
    if (generation !== this.generation) return;
    // Older releases persisted a long research disclaimer as a device warning.
    // Explain monitoring limits in pairing/settings; warnings must describe an
    // actionable fault. Explicitly clear the persisted warning on upgrade.
    await this.setWarning(null);
    if (generation !== this.generation) return;
    if (consented) {
      this.enabled = true;
      await this.connect(generation);
    }
  }

  /** Additive, idempotent preview-only upgrade. Existing IDs and consent are preserved. */
  private async ensureDisplays(generation: number, settings: DualCtDisplaySettings = {
    display_ct1: this.getSetting('display_ct1'), display_ct2: this.getSetting('display_ct2'), display_diagnostics: this.getSetting('display_diagnostics'),
  }): Promise<void> {
    this.chain = this.chain.catch(() => {}).then(async () => {
      for (const capability of manifest.capabilities) {
        if (generation !== this.generation) return;
        if (!this.hasCapability(capability)) {
          // eslint-disable-next-line no-await-in-loop
          await this.addCapability(capability);
          if (generation !== this.generation) return;
          // eslint-disable-next-line no-await-in-loop
          await this.setCapabilityValue(capability, null);
        }
        if (generation !== this.generation) return;
        const options = manifest.capabilitiesOptions as Record<string, {
          title?: { en: string; de: string; nl: string }; preventTag: boolean; preventInsights: boolean;
        }>;
        // Apply per-instance titles/privacy fences on upgrades as well as fresh pairing.
        // eslint-disable-next-line no-await-in-loop
        await this.setCapabilityOptions(capability, dualCtDisplayOptions(options[capability],
          this.getCapabilityOptions?.(capability) || {}, dualCtDisplayVisible(capability, settings, false)));
      }
    });
    await this.chain;
  }

  private async connect(generation: number): Promise<void> {
    if (!this.enabled || generation !== this.generation) return;
    try {
      const client = appAuthClientFromSettings(this.homey);
      if (!client) {
        await this.stop('account_changed'); return;
      }
      const account = dualCtAccountBinding(await client.getSession());
      if (!this.enabled || generation !== this.generation) return;
      if (account !== this.getStoreValue('dualCtAccountBinding')) {
        await this.stop('account_changed'); return;
      }
      const { sn } = this.getData();
      const owned = dualCtPreviewDevices(await client.getDeviceList()).some((device) => device.sn === sn);
      if (!this.enabled || generation !== this.generation) return;
      if (!owned) {
        await this.stop('model_unavailable'); return;
      }
      this.monitor = new DualCtMonitor({ account, device: sn, session: randomUUID() }, this.diagnosticEvents, this.messageEvidence);
      const app = this.homey.app as any;
      const handler: AppFrameHandler = (payload, topic, delivery) => {
        if (!this.enabled || generation !== this.generation || this.handler !== handler) return;
        const now = Date.now();
        this.receivedFrames = Math.min(65535, this.receivedFrames + 1);
        this.lastFrameAt = now;
        const epoch = delivery?.connectionEpoch;
        const epochChanged = epoch !== undefined && epoch !== this.connectionEpoch;
        const metadataKnown = typeof delivery?.retained === 'boolean' && typeof delivery.duplicate === 'boolean'
          && Number.isFinite(delivery.receivedMonoMs) && delivery.receivedMonoMs >= 0;
        const scopeKnown = metadataKnown
          && (epoch === undefined ? this.connectionEpoch === null : Number.isInteger(epoch) && epoch > 0
            && (this.connectionEpoch === null || epoch >= this.connectionEpoch));
        const ordered = scopeKnown && (epochChanged || this.lastReceivedMonoMs === null
          || delivery!.receivedMonoMs > this.lastReceivedMonoMs);
        const eligible = ordered && delivery!.retained === false && delivery!.duplicate === false;
        if (scopeKnown && epoch !== undefined && epochChanged) {
          this.monitor?.clear(); this.connectionEpoch = epoch;
          this.lastReceivedMonoMs = null;
          this.render(generation);
        }
        if (ordered && Number.isFinite(now) && now > 0 && Number.isFinite(delivery!.receivedAt)
          && delivery!.receivedAt > 0 && delivery!.receivedAt <= now && dualCtFreshAge(now - delivery!.receivedAt)) {
          this.lastReceivedMonoMs = delivery!.receivedMonoMs;
        }
        if (eligible && this.monitor?.observe(payload, topic, delivery!.receivedAt, now)) {
          this.acceptedPackets = Math.min(65535, this.acceptedPackets + 1);
          this.lastAcceptedAt = delivery!.receivedAt;
          this.render(generation);
        } else {
          this.rejectedFrames = Math.min(65535, this.rejectedFrames + 1);
        }
      };
      this.handler = handler;
      const subscribed = await app.subscribeAppRealtime(sn, handler, () => this.enabled && generation === this.generation);
      if (!this.enabled || generation !== this.generation) {
        app.unsubscribeAppRealtime(sn, handler); return;
      }
      if (!subscribed) throw new Error('subscription');
      this.retryDelay = 30000;
      this.ticker = this.homey.setInterval(() => {
        this.render(generation);
      }, 5000);
      this.render(generation);
    } catch {
      if (!this.enabled || generation !== this.generation) return;
      if (this.handler) (this.homey.app as any).unsubscribeAppRealtime(this.getData().sn, this.handler);
      this.handler = null;
      this.monitor?.clear(); this.monitor = null;
      this.diagnosticEvents.record('connection_failed');
      this.state = 'connection_failed';
      await this.clearDisplays(generation, 'connection_failed');
      if (!this.enabled || generation !== this.generation) return;
      this.retry = this.homey.setTimeout(() => {
        this.retry = null; this.connect(generation).catch(() => {});
      }, this.retryDelay);
      this.retryDelay = Math.min(300000, this.retryDelay * 2);
    }
  }

  private render(generation: number): void {
    if (!this.enabled || generation !== this.generation || !this.monitor) return;
    this.scheduleExpiry(generation);
    if (this.renderQueuedGeneration === generation) return;
    this.renderQueuedGeneration = generation;
    this.chain = this.chain.catch(() => {}).then(async () => {
      if (this.renderQueuedGeneration === generation) this.renderQueuedGeneration = null;
      if (!this.enabled || generation !== this.generation || !this.monitor) return;
      const view = this.monitor.snapshot(Date.now(), (key) => this.text(key), this.displayRoles);
      const nextState = view.recent ? 'recent' : 'waiting_stale';
      if (nextState !== this.state) this.diagnosticEvents.record(nextState);
      this.state = nextState;
      let displayFailed = false;
      for (const capability of Object.keys(view.values)) {
        if (!this.enabled || generation !== this.generation) return;
        const value = this.monitor.snapshot(Date.now(), (key) => this.text(key), this.displayRoles).values[capability];
        if (this.getCapabilityValue(capability) !== value) {
          // eslint-disable-next-line no-await-in-loop
          try {
            await this.writeDisplay(capability, value, generation);
          } catch {
            displayFailed = true;
          }
        }
      }
      if (!this.enabled || generation !== this.generation) return;
      const current = this.monitor.snapshot(Date.now(), (key) => this.text(key), this.displayRoles);
      if (displayFailed || !this.projectionCurrent(current.values)) {
        this.state = 'display_failed'; this.markUnavailable('display_failed'); return;
      }
      if (current.recent) {
        await this.writeDisplay('@available', null, generation);
        if (!this.enabled || generation !== this.generation
          || !this.monitor.snapshot(Date.now(), (key) => this.text(key), this.displayRoles).recent
          || !this.projectionCurrent(this.monitor.snapshot(Date.now(), (key) => this.text(key), this.displayRoles).values)) this.markUnavailable(this.state);
      } else this.markUnavailable('waiting_stale');
    }).catch(async () => {
      if (generation === this.generation) {
        this.state = 'display_failed';
        this.markUnavailable('display_failed');
      }
    });
  }

  private projectionCurrent(values: Record<string, string | number | null>): boolean {
    return Object.entries(values).filter(([id]) => /^dual_ct_preview_(power|voltage|current|total|net)\./.test(id))
      .every(([id, value]) => this.getCapabilityValue(id) === value);
  }

  /** Expiry and logical unavailability must progress independently of SDK display IO. */
  private scheduleExpiry(generation: number): void {
    if (!this.monitor || generation !== this.generation || !this.enabled) return;
    const view = this.monitor.snapshot(Date.now(), (key) => this.text(key), this.displayRoles);
    if (!view.recent || Object.entries(view.values).some(([id, value]) => (
      /^dual_ct_preview_(power|voltage|current|total|net)\./.test(id) && value === null && this.getCapabilityValue(id) != null
    ))) {
      this.markUnavailable('waiting_stale');
      for (const cancel of this.cancelWrites) cancel();
    }
    if (this.expiry) this.homey.clearTimeout(this.expiry);
    this.expiry = view.nextExpiryMs === null ? null : this.homey.setTimeout(() => {
      this.expiry = null; this.render(generation);
    }, view.nextExpiryMs);
  }

  private markUnavailable(reason: string): void {
    if (this.unavailablePending) return;
    const revision = ++this.availabilityRevision;
    const pending = this.setUnavailable(this.text(reason));
    this.unavailablePending = pending;
    pending.then(() => {
      if (this.unavailablePending === pending) this.unavailablePending = null;
      if (this.enabled && revision !== this.availabilityRevision) this.render(this.generation);
    }, () => {
      if (this.unavailablePending === pending) this.unavailablePending = null;
    });
  }

  /** A deadline cannot cancel the SDK. Keep its slot owned until actual settlement,
   * then reconcile late values/clears against the current scope. */
  private async writeDisplay(capability: string, value: string | number | null, generation: number): Promise<void> {
    if (this.pendingWrites.has(capability)) throw new Error('display_pending');
    if (capability === '@available') this.availabilityRevision++;
    const pending = capability === '@available' ? this.setAvailable() : this.setCapabilityValue(capability, value);
    this.pendingWrites.set(capability, pending);
    let abandoned = false; let cancel!: () => void; let timer!: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_resolve, reject) => {
      cancel = () => {
        abandoned = true; reject(new Error('display_pending'));
      };
      this.cancelWrites.add(cancel);
      timer = this.homey.setTimeout(cancel, 5000);
    });
    const settled = () => {
      if (this.pendingWrites.get(capability) === pending) this.pendingWrites.delete(capability);
      if (!abandoned) return;
      this.markUnavailable(this.enabled ? 'waiting_stale' : this.state);
      if (this.enabled) this.render(this.generation);
      else this.clearDisplays(this.generation, this.state).catch(() => {});
    };
    pending.then(settled, settled);
    try {
      await Promise.race([pending, deadline]);
      if (generation !== this.generation) throw new Error('display_scope');
    } finally {
      this.homey.clearTimeout(timer); this.cancelWrites.delete(cancel);
    }
  }

  private async stop(reason: string): Promise<void> {
    this.enabled = false;
    this.diagnosticEvents.record(reason);
    this.state = reason;
    this.acceptedPackets = 0; this.lastAcceptedAt = null;
    this.receivedFrames = 0; this.rejectedFrames = 0; this.lastFrameAt = null;
    const generation = ++this.generation;
    this.connectionEpoch = null;
    this.lastReceivedMonoMs = null;
    this.markUnavailable(reason);
    for (const cancel of this.cancelWrites) cancel();
    if (this.handler) (this.homey.app as any).unsubscribeAppRealtime(this.getData().sn, this.handler);
    this.handler = null; this.monitor?.clear(); this.monitor = null;
    if (this.ticker) this.homey.clearInterval(this.ticker);
    if (this.expiry) this.homey.clearTimeout(this.expiry);
    if (this.retry) this.homey.clearTimeout(this.retry);
    this.ticker = null; this.expiry = null; this.retry = null;
    await this.clearDisplays(generation, reason);
  }

  private async clearDisplays(generation: number, reason: string): Promise<void> {
    this.chain = this.chain.catch(() => {}).then(async () => {
      for (const capability of this.getCapabilities()) {
        if (generation !== this.generation) return;
        // eslint-disable-next-line no-await-in-loop
        await this.writeDisplay(capability, capability === 'dual_ct_preview_status' ? this.text(reason) : null, generation).catch(() => {});
      }
      if (generation === this.generation) this.markUnavailable(reason);
    });
    await this.chain.catch(async () => {
      if (generation === this.generation) {
        this.state = 'display_failed';
        await this.setUnavailable(this.text('display_failed')).catch(() => {});
      }
    });
  }

  async onSettings({ newSettings, changedKeys }: { newSettings: any; changedKeys: string[] }): Promise<void> {
    if (changedKeys.some((key) => DUAL_CT_DISPLAY_SETTINGS.includes(key))) await this.ensureDisplays(this.generation, newSettings);
    if (changedKeys.some((key) => ['ct1_role', 'ct2_role'].includes(key))) {
      this.displayRoles = {
        aRole: dualCtCircuitRole(newSettings.ct1_role), bRole: dualCtCircuitRole(newSettings.ct2_role),
      };
      if (!changedKeys.includes('preview_enabled')) this.render(this.generation);
    }
    if (!changedKeys.includes('preview_enabled')) return;
    const clear = this.stop('disabled');
    const { generation } = this;
    await clear;
    if (generation !== this.generation) return;
    if (newSettings.preview_enabled === true) {
      if (this.getStoreValue('dualCtPreviewConsent') !== DUAL_CT_PREVIEW_CONSENT) throw new Error(this.text('consent_required'));
      // A prior failed/partial startup upgrade must not be bypassed by toggling preview.
      try {
        await this.ensureDisplays(generation);
      } catch {
        if (generation !== this.generation) return;
        this.state = 'display_failed';
        await this.setUnavailable(this.text('display_failed'));
        throw new Error(this.text('display_failed'));
      }
      if (generation !== this.generation) return;
      this.enabled = true; this.retryDelay = 30000;
      await this.connect(generation);
    }
  }

  async resumeAppAccountAfterRepair(): Promise<void> {
    const clearing = this.stop('waiting');
    const { generation } = this;
    await clearing;
    if (generation !== this.generation || this.getSetting('preview_enabled') !== true) return;
    if (this.getStoreValue('dualCtPreviewConsent') !== DUAL_CT_PREVIEW_CONSENT
      || manifest.capabilities.some((capability) => !this.hasCapability(capability))) throw new Error(this.text('display_failed'));
    // Repair retains existing capability titles/options; it is not a device migration or renewed preview opt-in.
    this.enabled = true; this.retryDelay = 30000;
    await this.connect(generation);
  }

  async onUninit(): Promise<void> {
    this.homey.settings.removeListener('set', this.accountChanged);
    this.homey.settings.removeListener('unset', this.accountChanged);
    await this.stop('disabled');
  }

  /** Numeric-free ordinary support evidence; never capability values, IDs or packets. */
  getDualCtPreviewDiagnostics() {
    const age = this.lastAcceptedAt === null ? null : (Date.now() - this.lastAcceptedAt) / 1000;
    const frameAge = this.lastFrameAt === null ? null : (Date.now() - this.lastFrameAt) / 1000;
    return {
      enabled: this.enabled,
      status: this.state,
      transport: (this.homey.app as any).getAppRealtimeDiagnostics?.(this.getData().sn) || null,
      acceptedPackets: this.acceptedPackets,
      receivedFrames: this.receivedFrames,
      rejectedFrames: this.rejectedFrames,
      rejectionReasons: this.monitor?.getRejectionCounts() || {},
      recentEvents: this.diagnosticEvents.snapshot(),
      messageEvidence: this.messageEvidence.snapshot(),
      retryScheduled: this.retry !== null,
      lastFrameAgeSec: frameAge !== null && Number.isFinite(frameAge) && frameAge >= 0 ? frameAge : null,
      lastReceiptAgeSec: age !== null && Number.isFinite(age) && age >= 0 ? age : null,
      valuesIncluded: false,
      contributesToEnergy: false,
      controlsEnabled: false,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- teardown must finish before credentials are removed.
  async onDeleted(): Promise<void> {
    await this.onUninit();
    if (!hasOtherAppAuthDevices(this.homey, this) && hasSavedAppAuthCreds(this.homey)) clearSavedAppAuthCreds(this.homey);
  }
};
