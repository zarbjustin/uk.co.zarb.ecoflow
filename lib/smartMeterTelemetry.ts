'use strict';

import { mapSmartMeterQuota } from './smartMeterMapping';
import type { QuotaSampleContext } from './BaseEcoFlowDevice';
import { toFiniteNumber } from './quota';

export const METER_FRESH_MS = 90000;
export const METER_DETAIL_FRESH_MS = 180000;
const COUNTER_KEYS = ['todayActive', 'totalReactiveEnergy', 'totalActiveEnergy'] as const;

/** Direct BK21 MQTT evidence; no identifiers, counter migration or controls. */
export class SmartMeterTelemetry {
  private fields = new Map<string, { value: number; at: number }>();
  private counters = new Map<string, { value: number; at: number }>();
  private lastDirectGridAt = 0;
  private samples = 0;
  private grid: { value: number; at: number; source: 'mqtt' | 'rest' } | null = null;

  observe(quota: Record<string, any>, context: QuotaSampleContext, now = Date.now()): Record<string, number | null> {
    const at = context.receivedAt;
    if (!Number.isFinite(at) || at <= 0 || at > now || now - at > METER_DETAIL_FRESH_MS) return {};
    const mapped = mapSmartMeterQuota(quota);
    if (now - at > METER_FRESH_MS) delete mapped.measure_power;
    if (at < (this.grid?.at || 0)) delete mapped.measure_power;
    if (context.source === 'rest') {
      // A host response must not overwrite a recently observed direct meter.
      if (this.lastDirectGridAt > 0 && now >= this.lastDirectGridAt && now - this.lastDirectGridAt <= METER_FRESH_MS) delete mapped.measure_power;
      if (mapped.measure_power !== undefined && at >= (this.grid?.at || 0)) this.grid = { value: mapped.measure_power, at, source: 'rest' };
      else delete mapped.measure_power;
      // REST is an installation fallback, not evidence of this meter's phases.
      return mapped.measure_power === undefined ? {} : { measure_power: mapped.measure_power };
    }
    this.samples += 1;
    const out: Record<string, number | null> = {};
    for (const [key, value] of Object.entries(mapped)) {
      if (at < (this.fields.get(key)?.at || 0)) continue;
      this.fields.set(key, { value, at });
      out[key] = value;
      if (key === 'measure_power') {
        this.lastDirectGridAt = at;
        this.grid = { value, at, source: 'mqtt' };
      }
    }
    // A zero PF with observed non-zero power is not a credible measurement.
    const power = this.fields.get('measure_power');
    if (this.fields.get('power_factor')?.value === 0 && power && now - power.at <= METER_FRESH_MS && Math.abs(power.value) > 1) {
      this.fields.delete('power_factor');
      out.power_factor = null;
    }
    const record = quota.gridConnectionDataRecord;
    if (record && typeof record === 'object' && !Array.isArray(record)) {
      for (const key of COUNTER_KEYS) {
        const value = toFiniteNumber(record[key]);
        if (value !== undefined && (key === 'totalActiveEnergy' || value >= 0) && at >= (this.counters.get(key)?.at || 0)) {
          this.counters.set(key, { value, at });
        }
      }
    }
    for (const key of ['gridConnectionFlagL1', 'gridConnectionFlagL2', 'gridConnectionFlagL3', 'gridConnectionSta']) {
      const value = toFiniteNumber(quota[key]);
      if (value !== undefined && at >= (this.fields.get(key)?.at || 0)) this.fields.set(key, { value, at });
    }
    return out;
  }

  expired(now = Date.now()): string[] {
    return [...this.fields].filter(([key, value]) => key !== 'measure_power' && (value.at > now || now - value.at > METER_DETAIL_FRESH_MS))
      .map(([key]) => key);
  }

  freshGrid(now = Date.now()): number | null {
    return this.grid && this.grid.at <= now && now - this.grid.at <= METER_FRESH_MS ? this.grid.value : null;
  }

  snapshot(now = Date.now()): Record<string, unknown> {
    const project = (items: Map<string, { value: number; at: number }>) => Object.fromEntries([...items]
      .map(([key, item]) => [key, { value: item.value, ageSec: Math.max(0, (now - item.at) / 1000), stale: item.at > now || now - item.at > METER_DETAIL_FRESH_MS }]));
    return {
      transport: 'developer_mqtt',
      samples: this.samples,
      directGridFresh: this.lastDirectGridAt > 0 && now >= this.lastDirectGridAt && now - this.lastDirectGridAt <= METER_FRESH_MS,
      readings: project(this.fields),
      counterCandidates: project(this.counters),
      accountingSource: 'integrated_power',
      nativeCounterMigrationEnabled: false,
    };
  }
}
