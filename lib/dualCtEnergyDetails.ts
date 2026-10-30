/** Optional display cache on the existing owned Energy subscription. No accounting or network port. */
import { DualCtMonitor } from './dualCtMonitor';
import { AppFrameDelivery } from './EcoFlowAppMqtt';
import {
  DUAL_CT_ENERGY_DETAIL_CAPABILITIES, DualCtDisplaySettings, dualCtDisplayOptions, dualCtDisplayVisible,
} from './dualCtDisplaySettings';
import energyManifest from '../drivers/smartmeter_dual_ct_energy/driver.compose.json';

export class DualCtEnergyDetails {
  private generation = 0;
  private monitor: DualCtMonitor | null = null;
  private chain: Promise<void> = Promise.resolve();
  private pending: Promise<void> | null = null;
  private readonly port: any;
  private readonly now: () => number;

  constructor(port: any, now: () => number = () => Date.now()) {
    this.port = port; this.now = now;
  }

  private enqueue(work: () => Promise<void>) {
    const result = this.chain.catch(() => {}).then(work); this.chain = result; return result;
  }

  configure(settings: DualCtDisplaySettings, threePhase: boolean): Promise<void> {
    const { generation } = this;
    return this.enqueue(async () => {
      for (const id of DUAL_CT_ENERGY_DETAIL_CAPABILITIES) {
        if (generation !== this.generation) return;
        if (!this.port.hasCapability(id)) {
          // eslint-disable-next-line no-await-in-loop
          await this.port.addCapability(id);
        }
        if (generation !== this.generation) return;
        const base = (energyManifest.capabilitiesOptions as any)[id];
        const current = this.port.getCapabilityOptions?.(id) || {};
        // eslint-disable-next-line no-await-in-loop
        await this.port.setCapabilityOptions(id, dualCtDisplayOptions(base, current, dualCtDisplayVisible(id, settings, true, threePhase)));
      }
    });
  }

  start(scope: { account: string; device: string; session: string }) {
    ++this.generation; this.monitor?.clear(); this.monitor = new DualCtMonitor(scope);
  }

  observe(payload: Buffer, topic: string, delivery: Readonly<AppFrameDelivery> | undefined, now: number) {
    if (!this.monitor || !delivery || delivery.retained !== false || delivery.duplicate !== false
      || !Number.isFinite(delivery.receivedAt) || delivery.receivedAt <= 0 || !Number.isFinite(now)
      || now < delivery.receivedAt || now - delivery.receivedAt >= 90000) return;
    this.monitor.observe(payload, topic, delivery.receivedAt, now); this.render().catch(() => {});
  }

  render(): Promise<void> {
    if (this.pending) return this.pending;
    if (!this.monitor) return Promise.resolve();
    const { generation } = this;
    const pending = this.enqueue(async () => {
      if (generation !== this.generation || !this.monitor) return;
      for (const id of DUAL_CT_ENERGY_DETAIL_CAPABILITIES) {
        if (generation !== this.generation || !this.monitor) return;
        const { values } = this.monitor.snapshot(this.now(), (key) => key);
        if (this.port.hasCapability(id) && this.port.getCapabilityValue(id) !== values[id]) {
          // eslint-disable-next-line no-await-in-loop
          await this.port.setCapabilityValue(id, values[id] ?? null);
        }
      }
    }).catch(() => { /* Optional detail failures never revoke Energy accounting. */ }).finally(() => {
      if (this.pending === pending) this.pending = null;
    });
    this.pending = pending; return pending;
  }

  stop(): Promise<void> {
    ++this.generation; this.monitor?.clear(); this.monitor = null;
    return this.enqueue(async () => {
      for (const id of DUAL_CT_ENERGY_DETAIL_CAPABILITIES) {
        if (this.port.hasCapability?.(id) && this.port.getCapabilityValue(id) !== null) {
          // eslint-disable-next-line no-await-in-loop
          await this.port.setCapabilityValue(id, null).catch(() => {});
        }
      }
    }).catch(() => { /* A failed optional clear must not prevent core Energy shutdown/recovery. */ });
  }
}
