export const DUAL_CT_HISTORY_MAX = 24;
const SOURCES = ['session', 'app_mqtt', 'app_json', 'developer_mqtt', 'developer_rest', 'linked_host_rest'];
const STATUSES = ['discovering', 'listening', 'unavailable', 'empty', 'observed', 'host_not_verified',
  'json', 'protobuf', 'unrecognised', 'oversized', 'complete', 'stopped', 'no_explicit_model',
  'transport_unavailable', 'discovery_unavailable', 'sample_limit', 'account_changed'];
interface Event { deviceIndex: number | null; source: string; status: string; firstAt: number; lastAt: number; samples: number }

/** Fixed metadata and relative ages only. No readings, strings, identities or persisted state. */
export function dualCtHistorySnapshot(input: any): Array<Record<string, unknown>> {
  if (!Array.isArray(input)) return [];
  return input.slice(-DUAL_CT_HISTORY_MAX).filter((event) => (event?.deviceIndex === null || [0, 1].includes(event?.deviceIndex))
    && SOURCES.includes(event.source) && STATUSES.includes(event.status)
    && Number.isFinite(event.firstAgeSec) && event.firstAgeSec >= 0
    && Number.isFinite(event.lastAgeSec) && event.lastAgeSec >= 0 && event.firstAgeSec >= event.lastAgeSec
    && Number.isInteger(event.samples) && event.samples > 0 && event.samples <= 128)
    .map((event) => ({
      deviceIndex: event.deviceIndex,
      source: event.source,
      status: event.status,
      firstAgeSec: event.firstAgeSec,
      lastAgeSec: event.lastAgeSec,
      samples: event.samples,
    }));
}

export class DualCtHistory {
  private events: Event[] = [];
  private lastClock: number | null = null;

  clear(): void {
    this.events = []; this.lastClock = null;
  }

  record(deviceIndex: number | null, source: string, status: string, at: number): void {
    if (!(deviceIndex === null || [0, 1].includes(deviceIndex)) || !SOURCES.includes(source)
      || !STATUSES.includes(status) || !Number.isFinite(at) || at < 0) return;
    if (this.lastClock !== null && at < this.lastClock) this.clear();
    this.lastClock = at;
    const previous = this.events[this.events.length - 1];
    if (previous && previous.deviceIndex === deviceIndex && previous.source === source && previous.status === status) {
      previous.lastAt = at; previous.samples = Math.min(128, previous.samples + 1);
    } else {
      this.events.push({
        deviceIndex, source, status, firstAt: at, lastAt: at, samples: 1,
      });
      if (this.events.length > DUAL_CT_HISTORY_MAX) this.events.shift();
    }
  }

  snapshot(now: number): Array<Record<string, unknown>> {
    if (!Number.isFinite(now) || now < 0) return [];
    if (this.lastClock !== null && now < this.lastClock) {
      this.clear(); return [];
    }
    return dualCtHistorySnapshot(this.events.map((event) => ({
      deviceIndex: event.deviceIndex,
      source: event.source,
      status: event.status,
      samples: event.samples,
      firstAgeSec: (now - event.firstAt) / 1000,
      lastAgeSec: (now - event.lastAt) / 1000,
    })));
  }
}
