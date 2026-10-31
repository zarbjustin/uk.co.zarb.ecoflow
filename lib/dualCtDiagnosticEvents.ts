/** Bounded in-memory classifications; no payloads, identifiers or absolute timestamps. */
export class DualCtDiagnosticEvents {
  private events: { reason: string; at: number; count: number }[] = [];
  private readonly allowed: readonly string[];
  constructor(allowed: readonly string[]) {
    this.allowed = allowed;
  }

  record(reason: string, now = Date.now()): void {
    if (!this.allowed.includes(reason) || !Number.isFinite(now) || now <= 0) return;
    const last = this.events[this.events.length - 1];
    if (last && now < last.at) this.events = [];
    const current = this.events[this.events.length - 1];
    if (current?.reason === reason) {
      current.at = now; current.count = Math.min(65535, current.count + 1); return;
    }
    this.events.push({ reason, at: now, count: 1 });
    if (this.events.length > 32) this.events.shift();
  }

  snapshot(now = Date.now()) {
    return this.events.filter((event) => Number.isFinite(now) && now >= event.at)
      .map((event) => ({ reason: event.reason, ageSec: (now - event.at) / 1000, count: event.count }));
  }
}

export function dualCtEventSnapshot(input: any, allowed: readonly string[]) {
  if (!Array.isArray(input)) return [];
  return input.slice(-32).filter((event) => allowed.includes(event?.reason)
    && Number.isFinite(event.ageSec) && event.ageSec >= 0 && Number.isSafeInteger(event.count) && event.count > 0 && event.count <= 65535)
    .map((event) => ({ reason: event.reason, ageSec: event.ageSec, count: event.count }));
}
export const DUAL_CT_MONITOR_EVENTS = ['topic_other', 'topic_property_other_device', 'topic_get_reply',
  'payload_not_buffer', 'payload_empty', 'payload_oversized', 'clock_invalid', 'receipt_invalid', 'receipt_future', 'receipt_expired',
  'scope_or_receipt_rejected', 'receipt_order_rejected', 'header_rejected', 'unsupported_encoding', 'unrelated_message',
  'decode_rejected', 'malformed_frame', 'packet_accepted', 'recent', 'waiting_stale', 'waiting', 'disabled',
  'account_changed', 'model_unavailable', 'connection_failed', 'display_failed'];
