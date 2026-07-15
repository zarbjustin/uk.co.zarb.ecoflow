'use strict';

import { EcoFlowClient } from './EcoFlowClient';
import { classifyDevice } from './ecoflowDevices';
import { EcoFlowDevice } from './types';

export interface StreamUnit {
  device: EcoFlowDevice;
  mainSn: string;
  quota: Record<string, any>;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, worker));
  return results;
}

/**
 * Discover the controllable STREAM units (Ultra/Pro/AC/AC Pro/Max/Ultra X) on the
 * account, each resolved to its system main SN with its current quota. Shared by
 * the stream, stream_unit, stream_solar and stream_socket pairing flows. The
 * Smart Meter and Microinverter are excluded.
 */
export async function collectStreamUnits(client: EcoFlowClient): Promise<StreamUnit[]> {
  const devices = await client.getDeviceList();
  const discovered = await mapWithConcurrency(devices, 4, async (d): Promise<StreamUnit | null> => {
    const metadataKind = classifyDevice(d);
    if (metadataKind !== 'stream_unit' && metadataKind !== 'other') return null;
    let quota: Record<string, any> = {};
    try {
      quota = await client.getQuotaAll(d.sn);
    } catch {
      quota = {};
    }
    if (classifyDevice(d, quota) !== 'stream_unit') return null;
    let mainSn = d.sn;
    try {
      mainSn = await client.getMainSn(d.sn);
    } catch {
      mainSn = d.sn;
    }
    return { device: d, mainSn, quota };
  });
  return discovered.filter((unit): unit is StreamUnit => unit !== null);
}

/** Group STREAM units by their system main SN. */
export function groupByMainSn(units: StreamUnit[]): Map<string, StreamUnit[]> {
  const groups = new Map<string, StreamUnit[]>();
  for (const u of units) {
    const g = groups.get(u.mainSn);
    if (g) g.push(u);
    else groups.set(u.mainSn, [u]);
  }
  return groups;
}

/** Best name for a system, preferring the main unit's device name. */
export function systemName(units: StreamUnit[], mainSn: string): string {
  const main = units.find((u) => u.device.sn === mainSn);
  return main?.device.deviceName || units[0]?.device.deviceName || 'EcoFlow STREAM';
}

export function householdBatteryName(
  units: StreamUnit[],
  mainSn: string,
  includeSystemName = false,
): string {
  const base = 'STREAM Home Battery';
  return includeSystemName ? `${base} (${systemName(units, mainSn)})` : base;
}
