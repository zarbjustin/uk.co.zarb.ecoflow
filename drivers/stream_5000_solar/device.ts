import Homey from 'homey';
import { EnergyCheckpoint } from '../../lib/EnergyCheckpoint';
import { getApp } from '../../lib/appApi';
import { appAccountBinding, appAuthClientFromSettings, clearSavedAppAuthCreds } from '../../lib/appAuthPairing';
import { hasOtherAppAuthDevices } from '../../lib/appAuthConsumers';
import {
  listenSolar, SolarGeneration, solarStoredWh, isSolarUnit,
} from '../../lib/stream5000Solar';

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
  // Keeps this unit's own topic open. The shared solar dispatcher also receives
  // attributed peer readings from other subscribed ES21 property topics.
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
      this.refresh();
      this.attach()?.catch(() => this.error('Solar connection retry failed'));
    }, 5000);
    this.refresh();
    await this.attach();
  }

  private readonly accountChanged = (key: string) => {
    if (!['appAuthEmail', 'appAuthPassword', 'appAuthHost'].includes(key)) return;
    this.detach();
    this.retryAfter = 0;
    this.refresh();
  };

  private attach(): Promise<void> | undefined {
    if (this.stopped || this.unlisten || !this.generation || this.attaching) return this.attaching;
    if (Date.now() < this.retryAfter) return undefined;
    this.retryAfter = Date.now() + 60000;
    const { revision } = this;
    const active = () => !this.stopped && revision === this.revision;
    const { sn } = this.getData();
    this.attaching = (async () => {
      const client = appAuthClientFromSettings(this.homey);
      if (!client || appAccountBinding(await client.getSession()) !== this.getStoreValue('solarAccountBinding') || !active()) return;
      const app = getApp(this.homey);
      if (!await app.subscribeAppRealtime(sn, this.topicOwner, active)) return;
      if (!active()) {
        app.unsubscribeAppRealtime(sn, this.topicOwner); return;
      }
      this.unlisten = listenSolar(this.homey.app, sn, (reporter, watts, receipt) => {
        if (!active() || !this.generation) return;
        const before = this.generation.wh;
        if (!this.generation.observe(reporter, watts, receipt, Date.now())) return;
        if (this.generation.wh !== before) this.checkpoint?.mark();
        this.refresh();
      });
    })().catch(() => this.error('Solar source connection unavailable')).finally(() => {
      this.attaching = undefined;
    });
    return this.attaching;
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

  private detach(): void {
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
