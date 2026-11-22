/** Owner-opted-in observations only. No commands, Energy adoption or persisted telemetry/consent. */
import { randomUUID } from 'crypto';
import {
  boundCoordinationView, CoordinationBindings, normalizeCoordinationBindings, coordinationSourceKind,
} from './coordinationBindings';
import { CoordinationReader } from './coordinationWorkspace';

export interface CoordinationFlowClock {
  now(): number;
  set(fn: () => void, ms: number): any;
  clear(handle: any): void;
}
type Observation = { observedAt: number; at: number; value: number };
type FlowEvent = 'coordination_assessment_changed' | 'coordination_readings_changed';
const ACKS = ['noManualOverride', 'noCompetingController', 'otherSourcesReviewed'];
const READING_FAILURES = new Set(['device_unavailable', 'capability_contract_changed', 'reading_unknown',
  'timestamp_unknown', 'reading_stale', 'reading_invalid', 'incoherent_reading_times']);
const flags = {
  advisoryOnly: true,
  controlsEnabled: false,
  contributesToEnergy: false,
  commandWrites: 0,
  measurementFreshnessVerified: false,
  solarOriginVerified: false,
};
const safeNumber = (value: any, low: number, high: number) => typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;

export class CoordinationFlowMonitor {
  private active = false;
  private stopped = false;
  private epoch = 0;
  private reader: CoordinationReader | null = null;
  private pollTimer: any;
  private expiryTimer: any;
  private deadlineTimer: any;
  private bindings: CoordinationBindings | null = null;
  private acknowledgements: any;
  private policy = { startSoc: 98, stopSoc: 97 };
  private session = '';
  private leaseEndsAt = 0;
  private lastNow = 0;
  private latest: any = null;
  private previous: any;
  private valid = false;
  private availability: boolean | null = null;
  private priority = false;
  private state = 'disabled';
  private reason = 'monitor_disabled';
  private history = new Map<string, Observation[]>();

  constructor(private readonly factory: () => Promise<CoordinationReader>,
    private readonly emit: (event: FlowEvent, tokens: Record<string, string>) => void,
    private readonly clock: CoordinationFlowClock) {
    this.lastNow = 0;
  }

  start(body: any): Record<string, any> {
    const bindings = normalizeCoordinationBindings(body?.bindings);
    const policy = body?.policy || { startSoc: 98, stopSoc: 97 };
    if (this.stopped || body?.flowConsent !== true || !bindings || !ACKS.every((key) => body?.acknowledgements?.[key] === true)
      || !safeNumber(policy.startSoc, 1, 100) || !safeNumber(policy.stopSoc, 0, 99) || policy.stopSoc >= policy.startSoc) {
      this.stop('monitor_invalid_setup');
      throw new Error('coordination_flow_invalid_setup');
    }
    if (Object.values(bindings.sources).some((row) => coordinationSourceKind(row!) === 'candidate_preview')) {
      this.stop('monitor_unverified_preview_source');
      throw new Error('coordination_flow_unverified_preview_source');
    }
    this.stop('monitor_reconfigured');
    this.bindings = bindings;
    this.acknowledgements = Object.fromEntries(ACKS.map((key) => [key, true]));
    this.policy = { startSoc: policy.startSoc, stopSoc: policy.stopSoc };
    this.lastNow = this.clock.now();
    if (!safeNumber(this.lastNow, 1, Number.MAX_SAFE_INTEGER)) {
      this.stop('monitor_clock_changed'); throw new Error('coordination_flow_invalid_clock');
    }
    this.active = true; this.session = randomUUID(); this.leaseEndsAt = this.lastNow + 1800000;
    this.state = 'waiting'; this.reason = 'monitor_starting'; this.availability = null;
    this.schedule(0);
    return this.status();
  }

  stop(reason = 'monitor_disabled'): void {
    this.active = false; this.epoch += 1;
    [this.pollTimer, this.expiryTimer, this.deadlineTimer].forEach((timer) => {
      if (timer !== undefined) this.clock.clear(timer);
    });
    this.pollTimer = undefined; this.expiryTimer = undefined; this.deadlineTimer = undefined;
    this.closeReader(); this.latest = null; this.previous = undefined;
    this.bindings = null; this.acknowledgements = null; this.history.clear(); this.priority = false;
    this.valid = false; this.availability = null; this.state = 'disabled'; this.reason = reason; this.leaseEndsAt = 0;
  }

  shutdown(): void {
    this.stop('monitor_stopped'); this.stopped = true;
  }

  status(): Record<string, any> {
    this.checkClock();
    return {
      ...flags,
      active: this.active,
      state: this.state,
      reason: this.reason,
      readingsCurrent: this.valid,
      leaseEndsAt: this.active ? this.leaseEndsAt : null,
      priorityStartSoc: this.policy.startSoc,
      priorityStopSoc: this.policy.stopSoc,
    };
  }

  /** Synchronous checks never fetch, start a session, or treat unknown as a false invertible result. */
  condition(kind: string, args: any = {}): boolean {
    if (!this.checkClock() || !this.valid || !this.latest) throw new Error('coordination_flow_readings_unavailable');
    if (kind === 'current') return true;
    if (kind === 'priority') return this.priority;
    if (!safeNumber(args.watts, 21, 100000) || !safeNumber(args.seconds, 1, 1800)) throw new Error('coordination_flow_invalid_threshold');
    if (kind === 'export') return this.sustained('grid', -1, args.watts, args.seconds);
    if (kind === 'circuit') {
      if (!this.bindings || args.role !== this.bindings.secondaryRole || this.bindings.secondaryRole === 'none'
        || !['to_house', 'from_house'].includes(args.direction)) throw new Error('coordination_flow_circuit_scope_unavailable');
      return this.sustained('secondary', args.direction === 'to_house' ? 1 : -1, args.watts, args.seconds);
    }
    throw new Error('coordination_flow_unknown_condition');
  }

  private sustained(slot: string, sign: number, watts: number, seconds: number): boolean {
    const rows = this.history.get(slot) || [];
    let first = rows.length - 1;
    while (first >= 0 && sign * rows[first].value > watts) first -= 1;
    const qualified = rows.slice(first + 1);
    return qualified.length >= 2 && qualified[qualified.length - 1].observedAt - qualified[0].observedAt >= seconds * 1000
      && qualified.every((row, index) => index === 0 || row.observedAt - qualified[index - 1].observedAt <= 30000);
  }

  private checkClock(): boolean {
    if (!this.active) return false;
    const now = this.clock.now();
    if (!Number.isFinite(now) || now < this.lastNow || now >= this.leaseEndsAt) {
      this.stop(now >= this.leaseEndsAt ? 'monitor_expired' : 'monitor_clock_changed'); return false;
    }
    this.lastNow = now;
    if (this.latest && now >= this.latest.expiresAt) this.unavailable('reading_stale');
    return this.active;
  }

  private schedule(ms: number): void {
    if (!this.active) return;
    this.pollTimer = this.clock.set(() => {
      this.pollTimer = undefined; this.poll().catch(() => this.stop('monitor_internal_failure'));
    }, Math.min(ms, Math.max(0, this.leaseEndsAt - this.clock.now())));
  }

  private closeReader(): void {
    try {
      this.reader?.close();
    } catch { /* Provider details never enter Flow tokens/logs. */ }
    this.reader = null;
  }

  private transition(state: string, reason: string): void {
    if (state === this.state && reason === this.reason) return;
    this.state = state; this.reason = reason;
    this.send('coordination_assessment_changed', { state, reason });
  }

  private markAvailability(available: boolean, reason: string): void {
    if (this.availability === available) return;
    this.availability = available;
    this.send('coordination_readings_changed', { availability: available ? 'available' : 'unavailable', reason });
  }

  private send(event: FlowEvent, tokens: Record<string, string>): void {
    try {
      this.emit(event, tokens);
    } catch { /* A user Flow failure cannot corrupt observation state. */ }
  }

  private unavailable(reason: string): void {
    this.valid = false; this.latest = null; this.previous = undefined; this.priority = false; this.history.clear();
    if (this.expiryTimer !== undefined) this.clock.clear(this.expiryTimer);
    this.expiryTimer = undefined;
    this.transition('blocked', reason); if (this.active) this.markAvailability(false, reason);
  }

  private async poll(): Promise<void> {
    if (!this.checkClock() || !this.bindings) return;
    const { epoch } = this;
    const live = () => this.active && this.epoch === epoch;
    let settled = false;
    const finish = () => {
      if (settled || !live()) return false;
      settled = true;
      if (this.deadlineTimer !== undefined) this.clock.clear(this.deadlineTimer);
      this.deadlineTimer = undefined;
      return true;
    };
    this.deadlineTimer = this.clock.set(() => {
      if (!finish()) return;
      this.epoch += 1; this.closeReader(); this.session = randomUUID();
      this.unavailable('read_timeout'); this.schedule(15000);
    }, 10000);
    try {
      if (!this.reader) {
        const reader = await this.factory();
        if (!live() || settled) {
          reader.close(); return;
        }
        this.reader = reader;
      }
      const devices = new Map<string, any>();
      for (const id of new Set(Object.values(this.bindings.sources).map((row) => row!.deviceId))) {
        if (!live() || settled) return;
        // eslint-disable-next-line no-await-in-loop
        const device = await this.reader.read(id);
        if (!live() || settled) return;
        devices.set(id, device);
      }
      if (!this.checkClock() || !live() || settled || !this.bindings) return;
      const now = this.clock.now();
      const view = boundCoordinationView(this.bindings, devices, now, this.session, this.acknowledgements,
        this.previous, 'homey', undefined, this.policy);
      const rows = view.readings || [];
      const usable = rows.length >= 4 && rows.every((row: any) => row.status === 'recent' && Number.isFinite(row.value))
        && Math.max(...rows.map((row: any) => row.at)) - Math.min(...rows.map((row: any) => row.at)) <= 5000;
      if (!finish()) return;
      if (!usable) this.unavailable(READING_FAILURES.has(view.reason) ? view.reason : 'selected_readings_unavailable');
      else {
        this.latest = view; this.valid = true; this.previous = view.decision;
        for (const row of rows) {
          const prior = this.history.get(row.slot) || [];
          const tail = prior[prior.length - 1];
          const continuous = tail && row.at > tail.at && now - tail.observedAt <= 30000;
          const history = continuous ? prior : [];
          history.push({ observedAt: now, at: row.at, value: row.value });
          this.history.set(row.slot, history.filter((sample) => now - sample.observedAt <= 1830000).slice(-128));
        }
        const soc = rows.find((row: any) => row.slot === 'externalSoc').value;
        const power = rows.find((row: any) => row.slot === 'externalPower').value;
        this.priority = Math.abs(power) <= 20 && (this.priority ? soc > this.policy.stopSoc : soc >= this.policy.startSoc);
        this.transition(view.state, view.reason);
        if (!live()) return;
        this.markAvailability(true, 'selected_readings_current');
        if (!live()) return;
        if (this.expiryTimer !== undefined) this.clock.clear(this.expiryTimer);
        this.expiryTimer = this.clock.set(() => {
          this.expiryTimer = undefined; if (live()) this.checkClock();
        },
        Math.min(view.expiresAt, this.leaseEndsAt) - now);
      }
      this.schedule(15000);
    } catch {
      if (!finish()) return;
      this.closeReader(); this.session = randomUUID(); this.unavailable('read_failed'); this.schedule(15000);
    }
  }
}
