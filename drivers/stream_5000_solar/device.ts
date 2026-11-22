import Homey from 'homey';
import { EnergyCheckpoint } from '../../lib/EnergyCheckpoint';
import { getApp } from '../../lib/appApi';
import { appAccountBinding, appAuthClientFromSettings, clearSavedAppAuthCreds } from '../../lib/appAuthPairing';
import { clientFromSettings, getSavedCreds } from '../../lib/pairing';
import type { EcoFlowAppAuthClient } from '../../lib/EcoFlowAppAuthClient';
import { hasOtherAppAuthDevices } from '../../lib/appAuthConsumers';
import {
  listenSolar, SolarGeneration, solarStoredWh, isSolarUnit, resolveSolarRelay,
} from '../../lib/stream5000Solar';

const RELAY_RECHECK_MS = 60000;
const RELAY_MAX_AGE_MS = 2 * RELAY_RECHECK_MS;

module.exports = class Stream5000SolarDevice extends Homey.Device {
  private generation?: SolarGeneration;
  private checkpoint?: EnergyCheckpoint;
  private timer?: NodeJS.Timeout;
  private unlisten?: () => void;
  private attaching?: Promise<void>;
  private projecting?: Promise<void>;
  private dirty = false;
  private stopped = true;
  private revision = 0;
  private retryAfter = 0;
  private relay?: string;
  private relayCheckedAt = 0;
  // Each tile owns just its handlers; MQTT shares the broker subscriptions.
  private readonly topicOwner = () => {};

  async onInit(): Promise<void> {
    const { sn } = this.getData();
    const wh = solarStoredWh(this.getStoreValue('solarGeneration'), this.getCapabilityValue('meter_power'), sn);
    this.stopped = false;
    await this.setUnavailable(this.homey.__('solar5000.waiting')).catch(() => this.error('Solar availability update failed'));
    await this.setCapabilityValue('measure_power', null).catch(() => this.error('Solar power clear failed'));
    if (this.stopped) return;
    if (!isSolarUnit(sn) || wh === null) {
      await this.setUnavailable(this.homey.__('solar5000.history'));
      return;
    }
    const generation = new SolarGeneration(wh);
    this.generation = generation;
    this.checkpoint = new EnergyCheckpoint(this.homey, () => this.setStoreValue('solarGeneration', {
      version: 1, sn, wh: generation.wh,
    }));
    if (wh > 0 && this.getStoreValue('solarGeneration')?.wh !== wh) this.checkpoint.mark();
    this.homey.settings.on('set', this.accountChanged);
    this.homey.settings.on('unset', this.accountChanged);
    this.timer = this.homey.setInterval(() => {
      this.expireRelay();
      this.refresh();
      this.attach()?.catch(() => this.error('Solar connection retry failed'));
    }, 5000);
    this.refresh();
    await this.attach();
  }

  private readonly accountChanged = (key: string) => {
    if (!['appAuthEmail', 'appAuthPassword', 'appAuthHost', 'accessKey', 'secretKey', 'host'].includes(key)) return;
    this.detach();
    this.retryAfter = 0;
    this.refresh();
  };

  private attach(): Promise<void> | undefined {
    if (this.stopped || !this.generation || this.attaching) return this.attaching;
    const untilRetry = this.retryAfter - Date.now();
    if (untilRetry > 0 && untilRetry <= RELAY_RECHECK_MS) return undefined;
    this.retryAfter = Date.now() + RELAY_RECHECK_MS;
    const { revision } = this;
    const active = () => !this.stopped && revision === this.revision;
    const { sn } = this.getData();
    this.attaching = (async () => {
      const client = appAuthClientFromSettings(this.homey);
      if (!active()) return;
      if (!client || appAccountBinding(await client.getSession()) !== this.getStoreValue('solarAccountBinding')) {
        if (active()) this.detach();
        return;
      }
      if (!active()) return;
      const app = getApp(this.homey);
      if (!this.unlisten) {
        if (!await app.subscribeAppRealtime(sn, this.topicOwner, active)) return;
        if (!active()) {
          app.unsubscribeAppRealtime(sn, this.topicOwner);
          return;
        }
        this.unlisten = listenSolar(this.homey.app, sn, (reporter, watts, receipt) => {
          if (!active() || !this.generation) return;
          this.expireRelay();
          if (reporter !== sn && reporter !== this.relay) return;
          const before = this.generation.wh;
          if (!this.generation.observe(reporter, watts, receipt, Date.now())) return;
          if (this.generation.wh !== before) this.checkpoint?.mark();
          this.refresh();
        });
      }
      await this.refreshRelay(client, sn, active);
    })().catch(() => {
      if (active()) this.releaseRelay();
      this.error('Solar source connection unavailable');
    }).finally(() => {
      this.attaching = undefined;
    });
    return this.attaching;
  }

  private async refreshRelay(client: EcoFlowAppAuthClient, sn: string, active: () => boolean): Promise<void> {
    const started = Date.now();
    const inventory = await client.getDeviceList();
    if (!active()) return;
    const creds = getSavedCreds(this.homey);
    const main = await resolveSolarRelay(sn, inventory, creds.accessKey || creds.secretKey
      ? () => clientFromSettings(this).getMainSn(sn, { fresh: true, signal: AbortSignal.timeout(10000) })
      : undefined);
    if (!active()) return;
    const elapsed = Date.now() - started;
    if (elapsed < 0 || elapsed >= RELAY_RECHECK_MS) {
      this.releaseRelay();
      return;
    }
    if (this.relay !== main) {
      const app = getApp(this.homey);
      this.releaseRelay();
      if (main && await app.subscribeAppRealtime(main, this.topicOwner, active)) {
        if (!active()) {
          app.unsubscribeAppRealtime(main, this.topicOwner);
          return;
        }
        this.relay = main;
      }
    }
    this.relayCheckedAt = started;
  }

  /** Account every accepted receipt synchronously. Coalesce only SDK projections. */
  private refresh(): void {
    if (this.stopped || !this.generation) return;
    this.dirty = true;
    if (this.projecting) return;
    this.projecting = (async () => {
      while (this.dirty && !this.stopped) {
        this.dirty = false;
        const watts = this.generation!.power(Date.now());
        const kWh = this.generation!.wh / 1000;
        const old = this.getCapabilityValue('meter_power');
        if (typeof old !== 'number' || (old < kWh && old !== Math.round(this.generation!.wh) / 1000)) {
          await this.setCapabilityValue('meter_power', kWh);
        }
        if (this.getCapabilityValue('measure_power') !== watts) await this.setCapabilityValue('measure_power', watts);
        if (watts === null && this.getAvailable()) await this.setUnavailable(this.homey.__('solar5000.waiting'));
        if (watts !== null && this.generation!.power(Date.now()) === watts && !this.getAvailable()) await this.setAvailable();
      }
    })().catch(async () => {
      this.error('Solar reading projection failed');
      await this.setUnavailable(this.homey.__('solar5000.waiting')).catch(() => {});
    }).finally(() => {
      this.projecting = undefined;
    });
  }

  private expireRelay(): void {
    const age = Date.now() - this.relayCheckedAt;
    if (this.relay && (age < 0 || age >= RELAY_MAX_AGE_MS)) this.releaseRelay();
  }

  private releaseRelay(): void {
    if (!this.relay) return;
    const previous = this.relay;
    this.relay = undefined;
    this.generation?.invalidate(previous);
    getApp(this.homey).unsubscribeAppRealtime(previous, this.topicOwner);
    this.refresh();
  }

  private detach(): void {
    this.releaseRelay();
    this.revision++;
    this.unlisten?.();
    this.unlisten = undefined;
    this.generation?.invalidate();
    getApp(this.homey)?.unsubscribeAppRealtime(this.getData().sn, this.topicOwner);
  }

  async onUninit(): Promise<void> {
    this.stopped = true;
    if (this.timer) this.homey.clearInterval(this.timer);
    this.homey.settings.removeListener('set', this.accountChanged);
    this.homey.settings.removeListener('unset', this.accountChanged);
    this.detach();
    await Promise.all([this.attaching, this.projecting]);
    await this.checkpoint?.close();
  }

  // eslint-disable-next-line @typescript-eslint/no-misused-promises -- finish the final checkpoint before clearing shared credentials.
  async onDeleted(): Promise<void> {
    await this.onUninit();
    if (!hasOtherAppAuthDevices(this.homey, this)) clearSavedAppAuthCreds(this.homey);
  }
};
