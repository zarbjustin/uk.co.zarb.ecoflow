import type { Es21MeterReading } from './streamAc5000Protocol';
import type { EcoFlowClient } from './EcoFlowClient';
import type { AppDevice } from './appDevices';
import { isSmartMeter } from './ecoflowDevices';
import { dualCtDiscoveryIdentity } from './dualCtSources';
import { DUAL_CT_LIVE_INTERVAL_MS } from './dualCtLiveDelivery';

export const LINKED_GRID_CAPABILITY = 'dual_ct_linked_grid_power';
export const LINKED_POWER_STATUSES = [
  'source_inactive', 'direct_ct1_active', 'meter_scope_unverified', 'link_unverified',
  'tile_unavailable', 'tag_protection_unconfirmed', 'unit_monitor_not_unique',
  'waiting_for_meter_field', 'unit_connection_changed', 'sample_expired', 'sample_predates_link',
  'sample_invalid', 'unit_read_failed', 'eligible_awaiting_display', 'display_write_failed', 'displaying_linked_watts', 'phase_relay_available',
] as const;
export type LinkedPowerStatus = typeof LINKED_POWER_STATUSES[number];
export type WithholdLinkedPower = (reason: LinkedPowerStatus) => null;

type LinkClient = Pick<EcoFlowClient, 'getDeviceList' | 'getMainSn'>;
export type LinkedGridSample = Es21MeterReading & { receivedAt: number; until: number; host: string };

/** An owned meter-to-main relation from both inventories, never a zone/name or the first paired battery. */
export async function resolveLinkedEs21(client: LinkClient, meter: string, appDevices: AppDevice[]): Promise<string | null> {
  const devices = await client.getDeviceList();
  if (devices.length > 256 || appDevices.length > 256) return null;
  const owned = (sn: string) => appDevices.filter((d) => d.sn === sn).length === 1
    && appDevices.some((d) => d.sn === sn && d.shared === false) && devices.filter((d) => d.sn === sn).length === 1;
  if (!owned(meter) || !appDevices.some((d) => d.sn === meter && dualCtDiscoveryIdentity(d))) return null;
  const signal = AbortSignal.timeout(10000);
  const main = (sn: string) => client.getMainSn(sn, { fresh: true, signal });
  const host = await main(meter);
  if (!/^ES21[A-Z0-9]{4,60}$/.test(host) || !owned(host)) return null;
  const others = new Set([...devices.filter((d) => dualCtDiscoveryIdentity(d) || isSmartMeter(d)).map((d) => d.sn),
    ...appDevices.filter((d) => dualCtDiscoveryIdentity(d) || isSmartMeter(d)).map((d) => d.sn)]);
  others.delete(meter);
  if (others.size > 8) return null;
  const peers = await Promise.all(Array.from(others, main));
  if (peers.some((peer) => !/^[A-Z0-9]{8,64}$/.test(peer) || peer === host) || await main(host) !== host || await main(meter) !== host) return null;
  return host;
}

/** A new proof requires a new field receipt. No persistence, integration or Flow inputs. */
export class DualCtLinkedEs21 {
  private revision = 0;
  private binding: { host: string; from: number; until: number } | null = null;

  reset(): void {
    ++this.revision;
    this.binding = null;
  }

  async refresh(resolve: () => Promise<string | null>): Promise<void> {
    this.reset();
    const { revision } = this;
    const started = Date.now();
    try {
      const host = await resolve();
      const now = Date.now();
      if (revision === this.revision && host && now >= started && now - started < 15000) {
        this.binding = { host, from: now, until: started + 75000 };
      }
    } catch { /* An unavailable link only withdraws the display fallback. */ }
  }

  host(now: number): string | null {
    const b = this.binding;
    return b && now >= b.from && now < b.until ? b.host : null;
  }

  sample(now: number, read: (host: string) => LinkedGridSample | null, withhold: WithholdLinkedPower = () => null): LinkedGridSample | null {
    const host = this.host(now);
    if (!host || !this.binding) return withhold('link_unverified');
    const sample = read(host);
    if (!sample) return null; // The unit reader classifies missing or disconnected samples.
    if (sample.host !== host || !Number.isFinite(sample.watts) || Math.abs(sample.watts) > 100000
      || !Number.isFinite(sample.receivedAt) || sample.receivedAt > now || !Number.isFinite(sample.until)) return withhold('sample_invalid');
    if (sample.receivedAt <= this.binding.from) return withhold('sample_predates_link');
    if (now - sample.receivedAt >= DUAL_CT_LIVE_INTERVAL_MS || now >= sample.until) return withhold('sample_expired');
    return { ...sample, until: Math.min(sample.until, this.binding.until, sample.receivedAt + DUAL_CT_LIVE_INTERVAL_MS) };
  }
}
