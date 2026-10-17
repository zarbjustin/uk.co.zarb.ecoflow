import Homey from 'homey';
import { randomUUID } from 'crypto';
import { appAuthClientFromSettings, clearSavedAppAuthCreds, hasSavedAppAuthCreds } from '../../lib/appAuthPairing';
import { dualCtAccountBinding, dualCtPreviewDevices, DUAL_CT_PREVIEW_CONSENT } from '../../lib/dualCtPreviewPairing';
import { hasOtherAppAuthDevices } from '../../lib/appAuthConsumers';
import { DualCtMonitor } from '../../lib/dualCtMonitor';

module.exports = class DualCtPreviewDevice extends Homey.Device {
  private generation = 0;
  private monitor: DualCtMonitor | null = null;
  private handler: ((payload: Buffer, topic: string) => void) | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private expiry: ReturnType<typeof setTimeout> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 30000;
  private chain: Promise<void> = Promise.resolve();
  private enabled = false;
  private renderQueuedGeneration: number | null = null;
  private acceptedPackets = 0;
  private lastAcceptedAt: number | null = null;
  private state = 'waiting';
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
    await this.setWarning(this.text('warning'));
    if (generation !== this.generation) return;
    if (consented) {
      this.enabled = true;
      await this.connect(generation);
    }
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
      this.monitor = new DualCtMonitor({ account, device: sn, session: randomUUID() });
      const app = this.homey.app as any;
      const handler = (payload: Buffer, topic: string) => {
        if (!this.enabled || generation !== this.generation || this.handler !== handler) return;
        const now = Date.now();
        if (this.monitor?.observe(payload, topic, now)) {
          this.acceptedPackets = Math.min(65535, this.acceptedPackets + 1);
          this.lastAcceptedAt = now;
          this.render(generation);
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
    if (this.renderQueuedGeneration === generation) return;
    this.renderQueuedGeneration = generation;
    this.chain = this.chain.catch(() => {}).then(async () => {
      if (this.renderQueuedGeneration === generation) this.renderQueuedGeneration = null;
      if (!this.enabled || generation !== this.generation || !this.monitor) return;
      const view = this.monitor.snapshot(Date.now(), (key) => this.text(key));
      this.state = view.recent ? 'recent' : 'waiting_stale';
      if (this.expiry) this.homey.clearTimeout(this.expiry);
      this.expiry = view.nextExpiryMs === null ? null : this.homey.setTimeout(() => {
        this.expiry = null; this.render(generation);
      }, view.nextExpiryMs);
      for (const [capability, value] of Object.entries(view.values)) {
        if (!this.enabled || generation !== this.generation) return;
        if (this.getCapabilityValue(capability) !== value) {
          // eslint-disable-next-line no-await-in-loop
          await this.setCapabilityValue(capability, value);
        }
      }
      if (!this.enabled || generation !== this.generation) return;
      if (view.recent) await this.setAvailable();
      else await this.setUnavailable(this.text('waiting_stale'));
    }).catch(async () => {
      if (generation === this.generation) {
        this.state = 'display_failed';
        await this.setUnavailable(this.text('display_failed')).catch(() => {});
      }
    });
  }

  private async stop(reason: string): Promise<void> {
    this.enabled = false;
    this.state = reason;
    this.acceptedPackets = 0; this.lastAcceptedAt = null;
    const generation = ++this.generation;
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
        await this.setCapabilityValue(capability, capability === 'dual_ct_preview_status' ? this.text(reason) : null);
      }
      if (generation === this.generation) await this.setUnavailable(this.text(reason));
    });
    await this.chain.catch(async () => {
      if (generation === this.generation) {
        this.state = 'display_failed';
        await this.setUnavailable(this.text('display_failed')).catch(() => {});
      }
    });
  }

  async onSettings({ newSettings, changedKeys }: { newSettings: any; changedKeys: string[] }): Promise<void> {
    if (!changedKeys.includes('preview_enabled')) return;
    const clear = this.stop('disabled');
    const { generation } = this;
    await clear;
    if (generation !== this.generation) return;
    if (newSettings.preview_enabled === true) {
      if (this.getStoreValue('dualCtPreviewConsent') !== DUAL_CT_PREVIEW_CONSENT) throw new Error(this.text('consent_required'));
      this.enabled = true; this.retryDelay = 30000;
      await this.connect(generation);
    }
  }

  async onUninit(): Promise<void> {
    this.homey.settings.removeListener('set', this.accountChanged);
    this.homey.settings.removeListener('unset', this.accountChanged);
    await this.stop('disabled');
  }

  /** Numeric-free ordinary support evidence; never capability values, IDs or packets. */
  getDualCtPreviewDiagnostics() {
    const age = this.lastAcceptedAt === null ? null : (Date.now() - this.lastAcceptedAt) / 1000;
    return {
      enabled: this.enabled,
      status: this.state,
      acceptedPackets: this.acceptedPackets,
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
