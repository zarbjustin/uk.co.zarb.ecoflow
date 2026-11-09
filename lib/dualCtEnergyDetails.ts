/** Optional display cache on the existing owned Energy subscription. No accounting or network port. */
import { DualCtMonitor } from './dualCtMonitor';
import { AppFrameDelivery } from './EcoFlowAppMqtt';
import {
  DUAL_CT_ENERGY_DETAIL_CAPABILITIES, DualCtDisplaySettings, dualCtDisplayOptions, dualCtDisplayVisible,
} from './dualCtDisplaySettings';
import energyManifest from '../drivers/smartmeter_dual_ct_energy/driver.compose.json';

type DetailSlot = {
  write: Promise<void> | null;
  clear: Promise<void> | null;
  revision: number;
  clearedRevision: number;
};

export class DualCtEnergyDetails {
  private generation = 0;
  private monitor: DualCtMonitor | null = null;
  private chain: Promise<void> = Promise.resolve();
  private pending: Promise<void> | null = null;
  private readonly slots = new Map<string, DetailSlot>();
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
    this.reconcile();
  }

  observe(payload: Buffer, topic: string, delivery: Readonly<AppFrameDelivery> | undefined, now: number) {
    if (!this.monitor || !delivery || delivery.retained !== false || delivery.duplicate !== false
      || !Number.isFinite(delivery.receivedAt) || delivery.receivedAt <= 0 || !Number.isFinite(now)
      || now < delivery.receivedAt || now - delivery.receivedAt >= 90000) return;
    this.monitor.observe(payload, topic, delivery.receivedAt, now); this.render().catch(() => {});
  }

  render(): Promise<void> {
    // Expiry/retirement never waits for configure(), another field or a held
    // numeric SDK write. Each known field owns at most one write and one clear.
    this.reconcile();
    if (this.pending) return this.pending;
    if (!this.monitor) return Promise.resolve();
    const pending = Promise.all([...this.slots.values()].flatMap((slot) => [slot.write, slot.clear])).then(() => {}).finally(() => {
      if (this.pending === pending) this.pending = null;
    });
    this.pending = pending; return pending;
  }

  private value(id: string): number | string | null {
    return this.monitor?.snapshot(this.now(), (key) => key).values[id] ?? null;
  }

  private reconcile(): void {
    for (const id of DUAL_CT_ENERGY_DETAIL_CAPABILITIES) this.reconcileField(id, 2);
  }

  private reconcileField(id: string, corrections: number): void {
    let value: number | string | null;
    let displayed: unknown;
    try {
      if (!this.port.hasCapability?.(id)) return;
      value = this.value(id);
      displayed = this.port.getCapabilityValue(id);
    } catch {
      // Metadata is optional SDK IO too. Retry this field later without
      // aborting sibling retirement or synchronous lifecycle withdrawal.
      return;
    }
    let slot = this.slots.get(id);
    if (!slot) {
      slot = {
        write: null, clear: null, revision: 0, clearedRevision: -1,
      };
      this.slots.set(id, slot);
    }
    if (value === null) {
      if (slot.clear || (displayed === null
        && (!slot.write || slot.clearedRevision === slot.revision))) return;
    } else if (slot.write || slot.clear || displayed === value) return;
    const lane = value === null ? 'clear' : 'write';
    if (lane === 'write') slot.revision++;
    const { revision } = slot;
    const owned = slot;
    let succeeded = false;
    // Promise wrapping also contains a synchronously throwing optional SDK seam.
    const pending = Promise.resolve().then(() => this.port.setCapabilityValue(id, value)).then(() => {
      succeeded = true;
      if (lane === 'clear') owned.clearedRevision = revision;
    }).catch(() => { /* Retry only on a later render; isolate each optional field. */ })
      .finally(() => {
        if (owned[lane] === pending) owned[lane] = null;
        // The field's current monitor, not a captured old generation, decides the
        // correction. Bound immediate catch-up; failures never self-spawn retries.
        if (succeeded && corrections > 0) this.reconcileField(id, corrections - 1);
      });
    owned[lane] = pending;
  }

  stop(): Promise<void> {
    ++this.generation; this.monitor?.clear(); this.monitor = null;
    this.reconcile();
    // Numeric/configuration IO is deliberately absent from the shutdown barrier.
    return Promise.all([...this.slots.values()].map((slot) => slot.clear)).then(() => {});
  }
}
