'use strict';

import {
  StreamCmd, OperatingMode, backupReserveSequence, RESERVE_OVER_DISCHARGE_MARGIN,
} from './streamProtocol';
import { StreamSetEnvelope } from './types';
import { toFiniteNumber } from './quota';
import { DeveloperApiQuarantineError } from './developerApiCompatibility';

export interface StreamControlState {
  'onoff.ac1'?: boolean;
  'onoff.ac2'?: boolean;
  charge_limit?: number;
  discharge_limit?: number;
  backup_reserve_soc?: number;
  feed_in_control?: boolean;
  operating_mode?: OperatingMode;
}
export type StreamControlKey = keyof StreamControlState;
export type StreamControlIntent =
  | { kind: 'charge' | 'discharge' | 'reserve' | 'cheap_import' | 'peak_export'; value: number }
  | { kind: 'feed' | 'ac1' | 'ac2'; value: boolean }
  | { kind: 'mode'; value: OperatingMode };
export interface StreamControlStep {
  key: StreamControlKey;
  value: number | boolean | OperatingMode;
  payload: StreamSetEnvelope;
}
export interface StreamControlPlan {
  steps: StreamControlStep[];
  watched: StreamControlKey[];
  before: StreamControlState;
}

const MODES: Array<[string, OperatingMode]> = [
  ['operateSelfPoweredOpen', 'self_powered'], ['operateIntelligentScheduleModeOpen', 'ai'],
  ['operateScheduledOpen', 'scheduled'], ['operateTouModeOpen', 'tou'],
];

/** Strict reported control state; malformed/ambiguous fields cannot confirm a write. */
export function readStreamControlState(quota: Record<string, unknown>): StreamControlState {
  const state: StreamControlState = {};
  for (const [key, field] of [['onoff.ac1', 'relay2Onoff'], ['onoff.ac2', 'relay3Onoff']] as const) {
    const value = quota[field];
    if (value === true || value === 1 || value === '1') state[key] = true;
    if (value === false || value === 0 || value === '0') state[key] = false;
  }
  for (const [key, field, min, max] of [
    ['charge_limit', 'cmsMaxChgSoc', 50, 100],
    ['discharge_limit', 'cmsMinDsgSoc', 0, 30],
    ['backup_reserve_soc', 'backupReverseSoc', 3, 100],
  ] as const) {
    const value = toFiniteNumber(quota[field]);
    if (value !== undefined && Number.isInteger(value) && value >= min && value <= max) state[key] = value;
  }
  const feed = toFiniteNumber(quota.feedGridMode);
  if (feed === 1 || feed === 2) state.feed_in_control = feed === 2;
  const selected = MODES.filter(([field]) => {
    const value = quota[`energyStrategyOperateMode.${field}`];
    return value === true || value === 1 || value === '1';
  });
  if (selected.length === 1) state.operating_mode = selected[0][1];
  return state;
}

function step(sn: string, key: StreamControlKey, value: number | boolean | OperatingMode): StreamControlStep {
  let payload: StreamSetEnvelope;
  if (key === 'onoff.ac1') payload = StreamCmd.ac1(sn, value as boolean);
  else if (key === 'onoff.ac2') payload = StreamCmd.ac2(sn, value as boolean);
  else if (key === 'charge_limit') payload = StreamCmd.chargeLimit(sn, value as number);
  else if (key === 'discharge_limit') payload = StreamCmd.dischargeLimit(sn, value as number);
  else if (key === 'backup_reserve_soc') payload = StreamCmd.backupReserve(sn, value as number);
  else if (key === 'feed_in_control') payload = StreamCmd.feedIn(sn, value as boolean);
  else payload = StreamCmd.operatingMode(sn, value as OperatingMode);
  // Read back the normalized command, never the unclamped caller's value.
  let normalized = value;
  if (key === 'charge_limit') normalized = payload.params.cfgMaxChgSoc;
  if (key === 'discharge_limit') normalized = payload.params.cfgMinDsgSoc;
  if (key === 'backup_reserve_soc') normalized = payload.params.cfgBackupReverseSoc;
  return { key, value: normalized, payload };
}

export function planStreamControl(sn: string, intent: StreamControlIntent, before: StreamControlState): StreamControlPlan {
  const steps: StreamControlStep[] = [];
  let watched: StreamControlKey[];
  if (intent.kind === 'reserve' || intent.kind === 'cheap_import' || intent.kind === 'peak_export') {
    // Validate input before considering state or producing a command.
    StreamCmd.backupReserve(sn, intent.value);
    watched = ['backup_reserve_soc', 'discharge_limit'];
    if (before.discharge_limit === undefined) throw new Error('Current discharge limit is unavailable; no commands sent.');
    if (intent.kind === 'cheap_import') {
      watched.push('charge_limit');
      steps.push(step(sn, 'charge_limit', 100));
    }
    const sequence = backupReserveSequence(sn, intent.value, before.discharge_limit);
    if (sequence.newDischargeLimit !== undefined) steps.push(step(sn, 'discharge_limit', sequence.newDischargeLimit));
    steps.push(step(sn, 'backup_reserve_soc', sequence.reserve));
    if (intent.kind === 'peak_export') {
      watched.push('feed_in_control');
      steps.push(step(sn, 'feed_in_control', true));
    }
  } else {
    const key: StreamControlKey = {
      charge: 'charge_limit',
      discharge: 'discharge_limit',
      feed: 'feed_in_control',
      mode: 'operating_mode',
      ac1: 'onoff.ac1',
      ac2: 'onoff.ac2',
    }[intent.kind] as StreamControlKey;
    watched = [key];
    steps.push(step(sn, key, intent.value));
  }
  for (const key of watched) {
    if (before[key] === undefined) throw new Error(`Current ${key} is unavailable; no commands sent.`);
  }
  return { steps: steps.filter((item) => before[item.key] !== item.value), watched, before: { ...before } };
}

/** Offline/manual recovery plan only. Never called as automatic rollback. */
export function planStreamControlRestore(
  sn: string, before: StreamControlState, current: StreamControlState, keys: StreamControlKey[],
): StreamControlStep[] {
  const steps: StreamControlStep[] = [];
  const working = { ...current };
  const add = (key: StreamControlKey) => {
    const value = before[key];
    if (value === undefined || working[key] === undefined) throw new Error('Restore needs complete previous and current settings.');
    if (working[key] !== value) {
      steps.push(step(sn, key, value));
      Object.assign(working, { [key]: value });
    }
  };
  // Disable feed first if restoring an off state; enable it only after limits.
  if (keys.includes('feed_in_control') && before.feed_in_control === false) add('feed_in_control');
  if (keys.includes('charge_limit')) add('charge_limit');
  if (keys.includes('backup_reserve_soc') || keys.includes('discharge_limit')) {
    const reserve = before.backup_reserve_soc;
    const discharge = before.discharge_limit;
    if (reserve === undefined || discharge === undefined || working.discharge_limit === undefined
      || reserve < discharge + RESERVE_OVER_DISCHARGE_MARGIN) throw new Error('Reserve/limit restore requires manual review.');
    const sequence = backupReserveSequence(sn, reserve, working.discharge_limit);
    if (sequence.newDischargeLimit !== undefined && sequence.newDischargeLimit !== working.discharge_limit) {
      steps.push(step(sn, 'discharge_limit', sequence.newDischargeLimit));
      working.discharge_limit = sequence.newDischargeLimit;
    }
    add('backup_reserve_soc');
    add('discharge_limit');
  }
  if (keys.includes('feed_in_control') && before.feed_in_control !== false) add('feed_in_control');
  if (keys.includes('operating_mode')) add('operating_mode');
  if (keys.includes('onoff.ac1')) add('onoff.ac1');
  if (keys.includes('onoff.ac2')) add('onoff.ac2');
  return steps;
}

export class StreamControlFailure extends Error {
  constructor(
    public readonly attempted: number,
    public readonly accepted: number,
    public readonly verified: number,
    public readonly before: StreamControlState,
    public readonly reason = 'unknown',
    public readonly requestedAction = 'unknown',
  ) {
    super(attempted
      ? `STREAM control incomplete: ${attempted} command(s) attempted, ${accepted} accepted, ${verified} read back. Settings may have changed; review them before retrying. No automatic rollback.`
      : 'STREAM control could not be verified safely; no commands sent. Check connection and reported settings.');
    this.name = 'StreamControlFailure';
    this.message += ` Diagnostic: ${requestedAction}/${reason}.`;
  }
}

interface ControlIO {
  read(): Promise<StreamControlState>;
  write(payload: StreamSetEnvelope): Promise<unknown>;
  wait(): Promise<void>;
  active(): boolean;
  observed(state: StreamControlState): Promise<void>;
}

// Shared per target, not per Homey device. Retired after all callers settle.
const queues = new Map<string, { tail: Promise<void>; pending: number }>();
const MAX_PENDING = 8;

function hasControlConflict(state: StreamControlState, expected: StreamControlState, keys: StreamControlKey[], currentKey: StreamControlKey): boolean {
  return keys.some((key) => key !== currentKey && state[key] !== undefined && state[key] !== expected[key]);
}

function controlsMatch(state: StreamControlState, expected: StreamControlState, keys: StreamControlKey[]): boolean {
  return keys.every((key) => state[key] !== undefined && state[key] === expected[key]);
}

export async function executeStreamControl(
  sn: string, intent: StreamControlIntent, io: ControlIO,
): Promise<{ before: StreamControlState; final: StreamControlState; accepted: number; verified: number }> {
  const target = sn.trim().toUpperCase();
  if (!target) throw new Error('STREAM control target unavailable.');
  const queue = queues.get(target) ?? { tail: Promise.resolve(), pending: 0 };
  if (queue.pending >= MAX_PENDING) throw new Error('Too many pending STREAM controls; wait before retrying.');
  queues.set(target, queue);
  queue.pending += 1;
  const run = async () => {
    let attempted = 0;
    let accepted = 0;
    let verified = 0;
    let before: StreamControlState = {};
    let reason = 'read_failed';
    const active = () => {
      if (!io.active()) {
        reason = 'cancelled';
        throw new Error('Control cancelled.');
      }
    };
    const read = async () => {
      active();
      reason = 'read_failed';
      const state = await io.read();
      active();
      reason = 'observation_failed';
      await io.observed(state);
      active();
      return state;
    };
    try {
      before = await read();
      reason = 'preflight_rejected';
      const plan = planStreamControl(target, intent, before);
      let expected = { ...before };
      let final = before;
      for (const item of plan.steps) {
        active();
        attempted += 1;
        reason = 'write_failed';
        await io.write(item.payload);
        accepted += 1;
        active();
        expected = { ...expected, [item.key]: item.value };
        let confirmed = false;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          reason = 'wait_failed';
          await io.wait();
          final = await read();
          // Unrelated settings touched by this operation changing underneath us
          // indicate another authority; do not continue the remaining writes.
          if (hasControlConflict(final, expected, plan.watched, item.key)) {
            reason = 'conflicting_readback';
            throw new Error('Conflicting control state.');
          }
          if (controlsMatch(final, expected, plan.watched)) {
            confirmed = true;
            break;
          }
        }
        if (!confirmed) {
          reason = 'readback_mismatch';
          throw new Error('No matching fresh readback.');
        }
        verified += 1;
      }
      return {
        before, final, accepted, verified,
      };
    } catch (error) {
      if (!attempted && error instanceof DeveloperApiQuarantineError) throw error;
      // Do not expose server errors, credentials, serials or raw payloads.
      const action = ['charge', 'discharge', 'reserve', 'cheap_import', 'peak_export', 'feed', 'ac1', 'ac2', 'mode']
        .includes(intent.kind) ? intent.kind : 'unknown';
      throw new StreamControlFailure(attempted, accepted, verified, before, reason, action);
    }
  };
  const result = queue.tail.then(run, run);
  queue.tail = result.then(() => {}, () => {});
  try {
    return await result;
  } finally {
    queue.pending -= 1;
    if (!queue.pending && queues.get(target) === queue) queues.delete(target);
  }
}
