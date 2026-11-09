'use strict';

export interface SustainedGridObservation {
  powerW: number;
  receivedAt: number;
  validUntil: number;
  generation: number;
}

export function gridNotificationObservationMatches(
  event: SustainedGridObservation | null,
  current: SustainedGridObservation | null,
  now: number,
): boolean {
  return !!event && !!current && Number.isFinite(now)
    && ['powerW', 'receivedAt', 'validUntil', 'generation'].every((key) => (
      Number.isFinite((event as any)[key]) && (event as any)[key] === (current as any)[key]
    )) && now >= current.receivedAt && now < current.validUntil;
}

interface GridRule {
  direction: 'import' | 'export';
  watts: number;
  seconds: number;
  hysteresis: number;
  cooldown: number;
}

export function gridNotificationRule(args: any): GridRule {
  if (!args || !['import', 'export'].includes(args.direction)
    || !['watts', 'seconds', 'hysteresis', 'cooldown'].every(
      (key) => typeof args[key] === 'number' && Number.isFinite(args[key]),
    )
    || args.watts < 0 || args.watts > 100000
    || args.seconds < 1 || args.seconds > 1800
    || args.hysteresis < 0 || args.hysteresis > args.watts
    || args.cooldown < 0 || args.cooldown > 86400) throw new Error('Invalid grid notification rule');
  return {
    direction: args.direction,
    watts: args.watts,
    seconds: args.seconds,
    hysteresis: args.hysteresis,
    cooldown: args.cooldown,
  };
}

export function gridNotificationKey(args: unknown): string {
  const rule = gridNotificationRule(args);
  return JSON.stringify([rule.direction, rule.watts, rule.seconds, rule.hysteresis, rule.cooldown]);
}

export function gridNotificationMatches(args: unknown, state: any): boolean {
  try {
    return typeof state?.ruleKey === 'string' && state.ruleKey === gridNotificationKey(args);
  } catch {
    return false;
  }
}

export class SustainedGridRule {
  private previous: SustainedGridObservation | null = null;
  private lastNow: number | null = null;
  private startedAt: number | null = null;
  private fired = false;
  private lastEmittedAt: number | null = null;
  private readonly rule: GridRule;

  constructor(args: unknown, private readonly below = false) {
    this.rule = gridNotificationRule(args);
  }

  reset(): void {
    this.previous = null;
    this.lastNow = null;
    this.startedAt = null;
    this.fired = false;
  }

  observe(observation: SustainedGridObservation | null, now: number, allowEmit = true, commit = true): boolean {
    if (!Number.isFinite(now) || !observation
      || !Number.isFinite(observation.powerW)
      || !Number.isFinite(observation.receivedAt) || !Number.isFinite(observation.validUntil)
      || !Number.isSafeInteger(observation.generation) || observation.generation < 0
      || observation.validUntil <= observation.receivedAt
      || now < observation.receivedAt || now >= observation.validUntil) {
      this.reset();
      return false;
    }
    if (this.lastNow !== null && now < this.lastNow) this.reset();
    if (this.previous && (observation.generation !== this.previous.generation
      || observation.receivedAt < this.previous.receivedAt
      || observation.receivedAt >= this.previous.validUntil
      || now >= this.previous.validUntil)) this.reset();
    this.lastNow = now;
    if (this.previous && observation.receivedAt === this.previous.receivedAt) return false;
    this.previous = { ...observation };
    const directed = observation.powerW * (this.rule.direction === 'export' ? -1 : 1);
    // Both comparisons use the same dwell/rearm logic on opposite axes.
    const score = this.below ? -Math.max(0, directed) : directed;
    const threshold = this.below ? -this.rule.watts : this.rule.watts;
    if (score <= threshold - this.rule.hysteresis) {
      this.startedAt = null;
      this.fired = false;
      return false;
    }
    if (!this.fired && score <= threshold) {
      this.startedAt = null;
      return false;
    }
    if (this.startedAt === null) {
      if (score > threshold) this.startedAt = now;
      return false;
    }
    if (!allowEmit || this.fired || observation.receivedAt - this.startedAt < this.rule.seconds * 1000
      || (this.lastEmittedAt !== null && now - this.lastEmittedAt < this.rule.cooldown * 1000)) return false;
    return !commit || this.commitEmission(observation, now);
  }

  commitEmission(observation: SustainedGridObservation, now: number): boolean {
    if (this.lastNow !== null && now < this.lastNow) {
      this.reset();
      return false;
    }
    if (!gridNotificationObservationMatches(observation, this.previous, now)
      || this.startedAt === null || this.fired
      || observation.receivedAt - this.startedAt < this.rule.seconds * 1000
      || (this.lastEmittedAt !== null && now - this.lastEmittedAt < this.rule.cooldown * 1000)) return false;
    this.fired = true;
    this.lastEmittedAt = now;
    return true;
  }
}

interface NotificationPorts {
  loadRules: () => Promise<unknown>;
  readCurrent: () => { observation: SustainedGridObservation | null; now: number };
  trigger: (tokens: Record<string, string | number>, state: {
    ruleKey: string; observation: SustainedGridObservation;
  }) => Promise<unknown>;
  onError: () => void;
}

/** Uses only the device's existing qualified telemetry/ticker; owns no readers or timers. */
export class QualifiedGridNotifications {
  private active = false;
  private revision = 0;
  private loading = false;
  private dirty = false;
  private emitting = false;
  private rules = new Map<string, { rule: GridRule; observer: SustainedGridRule }>();

  private readonly ports: NotificationPorts;

  constructor(ports: NotificationPorts, private readonly below = false) {
    this.ports = ports;
  }

  start(): void {
    this.active = true; this.reload();
  }

  stop(): void {
    this.active = false;
    this.revision += 1;
    for (const entry of this.rules.values()) entry.observer.reset();
  }

  reload(): void {
    if (!this.active) return;
    this.revision += 1;
    this.dirty = true;
    for (const entry of this.rules.values()) entry.observer.reset();
    if (this.loading) return;
    this.load();
  }

  private load(): void {
    const { revision } = this;
    this.loading = true;
    this.dirty = false;
    Promise.resolve().then(() => this.ports.loadRules()).then((args) => {
      if (!this.active || revision !== this.revision) return;
      if (!Array.isArray(args) || args.length > 256) throw new Error('Too many grid notification rules');
      const next = new Map<string, { rule: GridRule; observer: SustainedGridRule }>();
      for (const value of args) {
        const rule = gridNotificationRule(value);
        const key = gridNotificationKey(rule);
        next.set(key, this.rules.get(key) || { rule, observer: new SustainedGridRule(rule, this.below) });
        if (next.size > 64) throw new Error('Too many grid notification rules');
      }
      this.rules = next;
    }).catch(() => {
      if (!this.active || revision !== this.revision) return;
      this.rules.clear();
      this.ports.onError();
    })
      .finally(() => {
        this.loading = false;
        if (this.active && this.dirty) this.load();
      });
  }

  tick(observation: SustainedGridObservation | null, now: number): void {
    if (!this.active || this.loading || this.dirty) return;
    for (const [ruleKey, entry] of this.rules) {
      if (!entry.observer.observe(observation, now, !this.emitting, false)) continue;
      this.emitting = true;
      const { revision } = this;
      const eventObservation = { ...observation! };
      const directed = observation!.powerW * (entry.rule.direction === 'export' ? -1 : 1);
      const tokens = {
        direction: entry.rule.direction,
        power: this.below ? Math.max(0, directed) : directed,
        grid_power: observation!.powerW,
      };
      Promise.resolve().then(() => {
        if (!this.active || this.loading || this.dirty || revision !== this.revision) return undefined;
        const current = this.ports.readCurrent();
        if (gridNotificationObservationMatches(eventObservation, current.observation, current.now)
          && entry.observer.commitEmission(eventObservation, current.now)) {
          return this.ports.trigger(tokens, { ruleKey, observation: eventObservation });
        }
        this.tick(current.observation, current.now);
        return undefined;
      }).catch(() => this.ports.onError()).finally(() => {
        this.emitting = false;
      });
    }
  }
}
