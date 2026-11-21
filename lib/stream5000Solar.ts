import type { AppFrameDelivery } from './EcoFlowAppMqtt';
import { es21SolarTotals } from './streamAc5000Protocol';
import { STREAM_5000_POWER_FRESH_MS as TTL } from './stream5000Readings';

export const isSolarUnit = (sn: unknown): sn is string => typeof sn === 'string' && /^ES21[A-Z0-9]{4,60}$/.test(sn);
type Delivery = Readonly<AppFrameDelivery>;
type Listener = (reporter: string, watts: number | null, receipt: Delivery) => void;
const listeners = new WeakMap<object, Map<string, Listener>>();

/** One accounting owner per physical unit, independent of how many topics relay it. */
export function listenSolar(homey: object, unit: string, receive: Listener): () => void {
  let routes = listeners.get(homey);
  if (!routes) {
    routes = new Map();
    listeners.set(homey, routes);
  }
  if (routes.has(unit)) throw new Error('Duplicate solar source');
  routes.set(unit, receive);
  return () => {
    if (routes.get(unit) === receive) routes.delete(unit);
  };
}

export function offerSolarFrame(homey: object, frame: Buffer, topic: string, receipt?: Delivery): void {
  const routes = listeners.get(homey);
  if (!routes?.size || !receipt || receipt.retained !== false || receipt.duplicate !== false
    || !receipt.isCurrent?.() || !Number.isSafeInteger(receipt.connectionEpoch) || receipt.connectionEpoch! < 1
    || !Number.isFinite(receipt.receivedMonoMs) || receipt.receivedMonoMs < 0) return;
  const reporter = topic.slice('/app/device/property/'.length);
  if (!isSolarUnit(reporter) || topic !== `/app/device/property/${reporter}`) return;
  for (const [unit, watts] of es21SolarTotals(frame, reporter)) routes.get(unit)?.(reporter, watts, receipt);
}

type Sample = { reporter: string; watts: number; receipt: Delivery };
export class SolarGeneration {
  private previous?: Sample;
  private lastMono = -1;

  wh: number;

  constructor(restoredWh: number) {
    this.wh = restoredWh;
  }

  invalidate(): void {
    this.previous = undefined;
  }

  power(now: number): number | null {
    const sample = this.previous;
    if (!sample) return null;
    if (!sample.receipt.isCurrent?.() || now < sample.receipt.receivedAt || now - sample.receipt.receivedAt >= TTL) {
      this.invalidate();
      return null;
    }
    return sample.watts;
  }

  observe(reporter: string, watts: number | null, receipt: Delivery, now: number): boolean {
    const at = receipt.receivedAt;
    if (!Number.isFinite(at) || at <= 0 || at > now || now - at >= TTL || receipt.receivedMonoMs <= this.lastMono) return false;
    const { previous } = this;
    const continuous = previous && this.power(now) !== null && previous.receipt.connectionEpoch === receipt.connectionEpoch;
    // A relayed copy may arrive later than the direct copy. Keep one reporter
    // while fresh, then re-anchor on failover without transferring an interval.
    if (continuous && previous.reporter !== reporter) return false;
    if (continuous && at < previous.receipt.receivedAt) return false;
    this.lastMono = receipt.receivedMonoMs;
    if (watts === null) {
      this.invalidate();
      return true;
    }
    if (continuous) {
      const dt = receipt.receivedMonoMs - previous.receipt.receivedMonoMs;
      if (dt < TTL && at > previous.receipt.receivedAt) this.wh += ((previous.watts + watts) * dt) / 7200000;
    }
    this.previous = { reporter, watts, receipt };
    return true;
  }
}

export function solarStoredWh(stored: any, projection: unknown, sn: string): number | null {
  const valid = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  if (stored != null && (stored.version !== 1 || stored.sn !== sn || !valid(stored.wh))) return null;
  if (projection != null && (!valid(projection) || !Number.isFinite(projection * 1000))) return null;
  if (stored && projection === Math.round(stored.wh) / 1000) return stored.wh;
  return Math.max(stored?.wh ?? 0, typeof projection === 'number' ? projection * 1000 : 0);
}
