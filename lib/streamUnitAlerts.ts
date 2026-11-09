import { STREAM_LIVE_TTL_MS } from './StreamLiveReadings';

import type { MqttDelivery } from './EcoFlowMqtt';

export const UNIT_ALERT_CARDS = {
  soc: 'stream_unit_battery_level_crossed',
  charging: 'stream_unit_charging_started',
  discharging: 'stream_unit_discharging_started',
} as const;

type Reading = number | string;
type Sample<T> = { value: T; delivery: MqttDelivery; revision: number };
export type UnitAlertEvent = { previous: Reading; value: Reading; at: number; revision: number };

function fresh(at: number): boolean {
  const age = Date.now() - at;
  return at > 0 && age >= 0 && age <= STREAM_LIVE_TTL_MS;
}

/** A physical unit's alert baseline. Display updates and restored values never seed it. */
export class UnitAlertEdge<T extends Reading> {
  private sample?: Sample<T>;
  private revision = 0;

  reset(): void {
    this.sample = undefined;
  }

  observe(value: T | undefined, delivery?: MqttDelivery, discontinuity = false): UnitAlertEvent | undefined {
    if (discontinuity) this.reset();
    if (!delivery || delivery.retained !== false || delivery.duplicate !== false || !Number.isSafeInteger(delivery.connectionEpoch)
      || !delivery.isCurrent?.() || !fresh(delivery.receivedAt)) return undefined;
    const prior = this.sample;
    const sameSession = prior?.delivery.connectionEpoch === delivery.connectionEpoch && prior?.delivery.isCurrent?.();
    if (sameSession && prior && delivery.receivedAt < prior.delivery.receivedAt) return undefined;
    if (value === undefined) {
      this.reset();
      return undefined;
    }
    const continuous = sameSession && prior && fresh(prior.delivery.receivedAt);
    const revision = continuous && prior.value === value ? prior.revision : ++this.revision;
    this.sample = { value, delivery, revision };
    if (!continuous || prior.value === value) return undefined;
    return {
      previous: prior.value, value, at: delivery.receivedAt, revision,
    };
  }

  matches(event: UnitAlertEvent, displayed: unknown): boolean {
    const { sample } = this;
    return !!sample && sample.revision === event.revision && displayed === event.value && sample.value === event.value
      && !!sample.delivery.isCurrent?.() && fresh(sample.delivery.receivedAt) && fresh(event.at);
  }
}
