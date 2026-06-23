'use strict';

import { EcoFlowClient } from './EcoFlowClient';
import { classifyDevice } from './ecoflowDevices';
import { EcoFlowDevice } from './types';

export interface StreamUnit {
  device: EcoFlowDevice;
  mainSn: string;
  quota: Record<string, any>;
}

/**
 * Discover the controllable STREAM units (Ultra/Pro/AC/AC Pro/Max/Ultra X) on the
 * account, each resolved to its system main SN with its current quota. Shared by
 * the stream, stream_unit, stream_solar and stream_socket pairing flows. The
 * Smart Meter and Microinverter are excluded.
 */
export async function collectStreamUnits(client: EcoFlowClient): Promise<StreamUnit[]> {
  const devices = await client.getDeviceList();
  const out: StreamUnit[] = [];
  for (const d of devices) {
    let quota: Record<string, any> = {};
    try {
      quota = await client.getQuotaAll(d.sn);
    } catch {
      quota = {};
    }
    if (classifyDevice(d, quota) !== 'stream_unit') continue;
    let mainSn = d.sn;
    try {
      mainSn = await client.getMainSn(d.sn);
    } catch {
      mainSn = d.sn;
    }
    out.push({ device: d, mainSn, quota });
  }
  return out;
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
