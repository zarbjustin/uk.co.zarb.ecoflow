/** Dormant adapter foundation. No vendor field mapping, network, Homey writes or accounting. */
export type DualCtChannel = 'ct1' | 'ct2';
export type DualCtRole = 'unknown' | 'grid' | 'solar' | 'load';
export type DualCtSource = 'app_live' | 'developer_live' | 'device_snapshot';
type Metric = 'powerW' | 'voltageV' | 'currentA';
interface Reading { value: number; receivedAt: number; measuredAt: number; source: DualCtSource }
interface ChannelConfig { role: DualCtRole; source: DualCtSource | null; importSign: 'positive' | 'negative' | null }

const CHANNELS: DualCtChannel[] = ['ct1', 'ct2'];
const METRICS: Metric[] = ['powerW', 'voltageV', 'currentA'];
const SOURCES: DualCtSource[] = ['app_live', 'developer_live', 'device_snapshot'];
export const DUAL_CT_FIELD_STALE_MS = 90000;
// Broad input sanity bounds, not product ratings or electrical safety limits.
const LIMITS: Record<Metric, [number, number, string]> = {
  powerW: [-100000, 100000, 'W'], voltageV: [0, 1000, 'V'], currentA: [-1000, 1000, 'A'],
};

/** No verified vendor contract is registered. Names, prefixes and research shapes cannot enable it. */
export function verifiedDualCtContract(_identity: unknown): null {
  return null;
}

/** Receives ONLY normalized observations from a future decoder, not arbitrary quota payloads. */
export class DualCtChannels {
  private config: Record<DualCtChannel, ChannelConfig> = {
    ct1: { role: 'unknown', source: null, importSign: null },
    ct2: { role: 'unknown', source: null, importSign: null },
  };

  private readings = new Map<string, Reading>();
  private lastNow: number | null = null;

  private clock(now: number): boolean {
    if (!Number.isFinite(now) || now < 0) return false;
    if (this.lastNow !== null && now < this.lastNow) this.readings.clear();
    this.lastNow = now;
    return true;
  }

  /** Roles are explicit, never inferred from channel number. Only one grid role is allowed. */
  configure(input: Record<DualCtChannel, ChannelConfig>): boolean {
    if (!input || CHANNELS.some((channel) => {
      const item = input[channel];
      return !item || !['unknown', 'grid', 'solar', 'load'].includes(item.role)
        || !(item.source === null || SOURCES.includes(item.source))
        || ![null, 'positive', 'negative'].includes(item.importSign)
        || (item.role !== 'grid' && item.importSign !== null);
    }) || CHANNELS.filter((channel) => input[channel].role === 'grid').length > 1) return false;
    for (const channel of CHANNELS) {
      const next = input[channel]; const previous = this.config[channel];
      if (next.role !== previous.role || next.source !== previous.source || next.importSign !== previous.importSign) {
        for (const metric of METRICS) this.readings.delete(`${channel}:${metric}`);
      }
      this.config[channel] = { role: next.role, source: next.source, importSign: next.importSign };
    }
    return true;
  }

  observe(channel: DualCtChannel, metric: Metric, value: unknown, unit: unknown,
    source: DualCtSource, receivedAt: number, measuredAt: number, now: number): boolean {
    if (!this.clock(now) || !CHANNELS.includes(channel) || !METRICS.includes(metric)
      || !SOURCES.includes(source) || source !== this.config[channel].source) return false;
    const [min, max, expectedUnit] = LIMITS[metric];
    if (unit !== expectedUnit || typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max
      || !Number.isFinite(receivedAt) || !Number.isFinite(measuredAt) || measuredAt < 0 || receivedAt < 0
      || receivedAt > now || measuredAt > receivedAt || now - measuredAt > DUAL_CT_FIELD_STALE_MS) return false;
    const key = `${channel}:${metric}`; const previous = this.readings.get(key);
    // A cached value with a recent receipt does not become a fresh measurement.
    if (previous && (measuredAt <= previous.measuredAt || receivedAt < previous.receivedAt)) return false;
    this.readings.set(key, {
      value, source, receivedAt, measuredAt,
    });
    return true;
  }

  clear(): void {
    this.readings.clear(); this.lastNow = null;
  }

  snapshot(now: number): Record<string, unknown> {
    const validClock = this.clock(now);
    const channels = CHANNELS.map((channel) => {
      const config = this.config[channel];
      const metrics = Object.fromEntries(METRICS.map((metric) => {
        const reading = this.readings.get(`${channel}:${metric}`);
        const age = validClock && reading && reading.measuredAt <= now ? now - reading.measuredAt : null;
        const fresh = age !== null && age <= DUAL_CT_FIELD_STALE_MS;
        let status = 'missing';
        if (reading) status = fresh ? 'fresh' : 'stale';
        return [metric, {
          value: fresh ? reading!.value : null,
          unit: LIMITS[metric][2],
          status,
          measurementAgeSec: age === null ? null : age / 1000,
          receiptAgeSec: validClock && reading && reading.receivedAt <= now ? (now - reading.receivedAt) / 1000 : null,
          source: reading?.source || null,
        }];
      }));
      const power = metrics.powerW.value as number | null;
      const signedGrid = config.role === 'grid' && config.importSign && power !== null
        ? power * (config.importSign === 'positive' ? 1 : -1) : null;
      return {
        channel,
        role: config.role,
        selectedSource: config.source,
        metrics,
        // Diagnostic direction only, never exported to Homey Energy or protective controls.
        gridImportW: signedGrid === null ? null : Math.max(0, signedGrid),
        gridExportW: signedGrid === null ? null : Math.max(0, -signedGrid),
      };
    });
    return {
      adapterStatus: 'dormant_normalized_reading_foundation',
      channelMappingVerified: false,
      hardwareValidated: false,
      pairingEnabled: false,
      contributesToEnergy: false,
      controlsEnabled: false,
      combinedGridW: null,
      channels,
    };
  }
}
