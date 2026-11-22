'use strict';

import {
  InstallationOperationJournal,
  Stream5000InstallationOperationOwner,
  encodeStream5000ReservePercentage,
  normalizeStream5000ReserveAck,
  normalizeStream5000ReserveConfiguration,
} from './stream5000ControlContract';
import {
  PilotApproval,
  ReservePilotContext,
  ReservePilotQualification,
  ReservePilotTarget,
  boundedReference,
  reservePilotContextQualified,
  snapshotReservePilotQualifications,
} from './stream5000ReservePilot';

export interface ReserveRuntimeJournalStore {
  load(signal: AbortSignal): Promise<{ revision: number; journal: unknown }>;
  /** Must acknowledge an atomic, durable commit; ordinary settings writes are not CAS. */
  compareAndSwap(expectedRevision: number, journal: InstallationOperationJournal, signal: AbortSignal): Promise<number>;
}

export interface ReserveRuntimeTransport {
  set(payload: Record<string, any>, options: { signal: AbortSignal; timeoutMs: number }): Promise<unknown>;
  get(sn: string, quotas: string[], options: { signal: AbortSignal; timeoutMs: number }): Promise<unknown>;
}

export interface ReserveRuntimeClock {
  now(): number;
  setTimeout(callback: () => void, milliseconds: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface ReserveRuntimeOptions {
  enabled?: boolean;
  installationKey: string;
  qualifications?: readonly ReservePilotQualification[];
  readContext?: (targetKey: string, signal: AbortSignal) => Promise<ReservePilotContext>;
  transport?: ReserveRuntimeTransport;
  journal?: ReserveRuntimeJournalStore;
  clock?: ReserveRuntimeClock;
}

export interface ReserveRuntimeRestoreApproval {
  operationId: string;
  restoreApproved: boolean;
  reservePercent: 50;
}

export type ReserveRuntimeStatus = 'disabled' | 'uninitialized' | 'initializing' | 'ready'
  | 'preflight' | 'persisting' | 'awaiting_ack' | 'awaiting_configuration'
  | 'observing' | 'restored' | 'unknown' | 'stopped';

/** ACK/selective configuration acceptance, not physical enforcement or durable closure. */
export interface ReserveRuntimeResult {
  operationId: string;
  queryId: string;
  reservePercent: 50 | 51;
  status: 'observing' | 'restored';
  /** Configuration acceptance never clears the conservative restart obligation. */
  recoveryObligation: 'held';
}

interface Operation {
  operationId: string;
  target: ReservePilotTarget;
  authorityRevision: number;
  companions: string;
  claimId: number;
  receivedAt: number;
  reservePercent: number;
  phaseTargetSeen: boolean;
  restoring: boolean;
}

// Adapter identity additionally fences ambiguous storage completion in-process.
const fencedStores = new WeakSet<ReserveRuntimeJournalStore>();

const targetFields = [
  'targetKey', 'installationKey', 'model', 'firmware', 'scope',
  'routing', 'commandTargetSn', 'generation',
] as const;

const defaultClock: ReserveRuntimeClock = {
  now: () => Date.now(),
  // eslint-disable-next-line homey-app/global-timers -- Unbound injectable runtime, not a Homey device.
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
  // eslint-disable-next-line homey-app/global-timers -- Matches the injected runtime timer seam.
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

function copyContext(context: ReservePilotContext): ReservePilotContext {
  if (!context || !context.target || !context.authority || !context.configuration) {
    throw new Error('Authoritative reserve context unavailable');
  }
  return Object.freeze({
    now: context.now,
    target: Object.freeze({ ...context.target }),
    authority: Object.freeze({ ...context.authority }),
    configuration: Object.freeze({ ...context.configuration }),
  });
}

/** Unbound, default-disabled executor. Share one runtime/store domain across installation aliases. */
export class Stream5000ReserveRuntime {
  private readonly enabled: boolean;
  private readonly installationKey: string;
  private readonly qualifications: readonly ReservePilotQualification[];
  private readonly readContext?: ReserveRuntimeOptions['readContext'];
  private readonly transport?: ReserveRuntimeTransport;
  private readonly store?: ReserveRuntimeJournalStore;
  private readonly clock: ReserveRuntimeClock;
  private owner: Stream5000InstallationOperationOwner | null = null;
  private revision = -1;
  private currentStatus: ReserveRuntimeStatus;
  private operation: Operation | null = null;
  private terminalOperation: Operation | null = null;
  private reserved = false;
  private storageFence = false;
  private epoch = 0;
  private querySequence = 0;
  private lastNow = 0;
  private cancelStage: ((error: Error) => void) | null = null;
  private observationTimer: unknown = null;
  private observationDeadline = 0;

  constructor(options: ReserveRuntimeOptions) {
    if (!options || !boundedReference(options.installationKey)) throw new Error('Installation identity required');
    this.enabled = options.enabled === true;
    this.installationKey = options.installationKey;
    this.qualifications = snapshotReservePilotQualifications(options.qualifications || []);
    const mappings = new Map<string, ReservePilotQualification>();
    for (const record of this.qualifications) {
      const prior = mappings.get(record.targetKey);
      if (record.installationKey !== this.installationKey
        || (prior && targetFields.filter((key) => key !== 'generation')
          .some((key) => prior[key] !== record[key]))) throw new Error('Conflicting installation alias mapping');
      mappings.set(record.targetKey, record);
    }
    this.readContext = options.readContext;
    this.transport = options.transport;
    this.store = options.journal;
    this.clock = options.clock || defaultClock;
    this.currentStatus = this.enabled ? 'uninitialized' : 'disabled';
  }

  get status(): ReserveRuntimeStatus {
    return this.currentStatus;
  }

  get storageBlocked(): boolean {
    return this.storageFence || (!!this.store && fencedStores.has(this.store));
  }

  private now(): number {
    const now = this.clock.now();
    if (!Number.isSafeInteger(now) || now < this.lastNow || now < 0) {
      throw new Error('Reserve runtime clock invalid or reversed');
    }
    this.lastNow = now;
    return now;
  }

  private assertEpoch(epoch: number): void {
    if (epoch !== this.epoch || ['unknown', 'stopped', 'disabled'].includes(this.currentStatus)) {
      throw new Error('Reserve operation withdrawn');
    }
  }

  private within<T>(deadline: number, epoch: number, action: (signal: AbortSignal) => Promise<T>): Promise<T> {
    this.assertEpoch(epoch);
    if (this.cancelStage) throw new Error('Reserve runtime busy; no queue');
    const remaining = deadline - this.now();
    if (remaining <= 0) return Promise.reject(new Error('Reserve stage deadline exceeded'));
    return new Promise<T>((resolve, reject) => {
      const controller = new AbortController();
      let settled = false;
      let timer: unknown = null;
      const finish = (error?: unknown, value?: T) => {
        if (settled) return;
        settled = true;
        if (timer !== null) this.clock.clearTimeout(timer);
        this.cancelStage = null;
        if (error) {
          controller.abort();
          reject(error);
        } else resolve(value as T);
      };
      this.cancelStage = (error) => finish(error);
      timer = this.clock.setTimeout(() => finish(new Error('Reserve stage deadline exceeded')), remaining);
      try {
        action(controller.signal).then((value) => {
          try {
            this.assertEpoch(epoch);
            if (this.now() >= deadline) throw new Error('Reserve stage deadline exceeded');
            finish(undefined, value);
          } catch (error) {
            finish(error);
          }
        }, (error) => finish(error || new Error('Reserve dependency rejected')));
      } catch (error) {
        finish(error);
      }
    });
  }

  private stopObservation(): void {
    if (this.observationTimer !== null) this.clock.clearTimeout(this.observationTimer);
    this.observationTimer = null;
  }

  private fail(error: Error, stopped = false): void {
    this.epoch += 1;
    this.currentStatus = stopped ? 'stopped' : 'unknown';
    this.reserved = true;
    const operation = this.operation || this.terminalOperation;
    if (operation) this.owner?.markUnknown(this.installationKey, operation.claimId);
    this.stopObservation();
    this.cancelStage?.(error);
  }

  revoke(): void {
    this.fail(new Error('Reserve authority withdrawn'));
  }

  shutdown(): void {
    this.fail(new Error('Reserve runtime stopped'), true);
  }

  async initialize(): Promise<ReserveRuntimeStatus> {
    if (!this.enabled) throw new Error('Reserve runtime disabled');
    if (this.currentStatus !== 'uninitialized') throw new Error('Reserve initialization already attempted');
    this.currentStatus = 'initializing';
    const { epoch } = this;
    try {
      if (!this.store || !this.transport || !this.readContext || !this.qualifications.length) {
        throw new Error('Qualified runtime dependencies unbound');
      }
      if (fencedStores.has(this.store)) throw new Error('Reserve storage adapter fenced');
      const loaded = await this.within(this.now() + 5000, epoch, (signal) => this.store!.load(signal));
      this.assertEpoch(epoch);
      if (!loaded || !Number.isSafeInteger(loaded.revision) || loaded.revision < 0
        || !loaded.journal || typeof loaded.journal !== 'object'
        || (loaded.journal as InstallationOperationJournal).version !== 1) {
        throw new Error('Initialized version 1 journal required');
      }
      this.owner = new Stream5000InstallationOperationOwner(64, loaded.journal);
      this.revision = loaded.revision;
      if (this.owner.journal().operations.length) {
        this.fail(new Error('Unresolved recovered operations require manual reconciliation'));
      } else this.currentStatus = 'ready';
      return this.currentStatus;
    } catch (error) {
      this.storageFence = true;
      if (this.store) fencedStores.add(this.store);
      if (epoch === this.epoch) this.fail(new Error('Reserve initialization failed closed'));
      throw error;
    }
  }

  private async context(targetKey: string, epoch: number, deadline: number): Promise<ReservePilotContext> {
    const supplied = await this.within(deadline, epoch, (signal) => this.readContext!(targetKey, signal));
    const context = copyContext(supplied);
    const now = this.now();
    if (!Number.isFinite(context.now) || context.now < 0 || context.now > now) {
      throw new Error('Authoritative context clock invalid');
    }
    const current = Object.freeze({ ...context, now });
    if (current.target.installationKey !== this.installationKey || current.target.targetKey !== targetKey
      || !reservePilotContextQualified(current, this.qualifications)) {
      throw new Error('Native reserve qualification or freshness unavailable');
    }
    this.assertEpoch(epoch);
    return current;
  }

  private check(context: ReservePilotContext, operation: Operation, expected?: 50 | 51): void {
    if (targetFields.some((key) => context.target[key] !== operation.target[key])
      || context.authority.revision !== operation.authorityRevision
      || context.configuration.companionSnapshotId !== operation.companions
      || !this.owner?.owns(this.installationKey, operation.claimId)
      || context.configuration.receivedAt < operation.receivedAt
      || (context.configuration.receivedAt === operation.receivedAt
        && context.configuration.reservePercent !== operation.reservePercent)
      || ![50, 51].includes(context.configuration.reservePercent)
      || (expected !== undefined && context.configuration.reservePercent !== expected)
      || (operation.phaseTargetSeen
        && context.configuration.reservePercent !== (operation.restoring ? 50 : 51))) {
      throw new Error('Reserve context drift or contradictory receipt');
    }
    if (context.configuration.receivedAt > operation.receivedAt
      && context.configuration.reservePercent === (operation.restoring ? 50 : 51)) operation.phaseTargetSeen = true;
    operation.receivedAt = context.configuration.receivedAt;
    operation.reservePercent = context.configuration.reservePercent;
  }

  private recoveryJournal(): InstallationOperationJournal {
    const journal = this.owner!.journal();
    return Object.freeze({
      version: 1,
      nextClaimId: journal.nextClaimId,
      operations: Object.freeze(journal.operations.map((operation) => Object.freeze({
        ...operation, status: 'unknown' as const,
      }))),
    });
  }

  private async persist(journal: InstallationOperationJournal, epoch: number): Promise<void> {
    if (fencedStores.has(this.store!)) throw new Error('Reserve storage adapter fenced');
    this.storageFence = true;
    fencedStores.add(this.store!);
    const expected = this.revision;
    const revision = await this.within(this.now() + 5000, epoch,
      (signal) => this.store!.compareAndSwap(expected, journal, signal));
    this.assertEpoch(epoch);
    if (!Number.isSafeInteger(revision) || revision <= expected) throw new Error('Journal CAS conflict or invalid revision');
    this.revision = revision;
    this.storageFence = false;
    fencedStores.delete(this.store!);
  }

  async execute(targetKey: string, approval: PilotApproval): Promise<ReserveRuntimeResult> {
    if (!this.enabled) throw new Error('Reserve runtime disabled');
    if (this.currentStatus !== 'ready' || this.reserved || this.storageBlocked) {
      throw new Error('Reserve runtime held or busy; no queue');
    }
    if (!approval || approval.forwardApproved !== true || approval.reservePercent !== 51
      || !boundedReference(approval.operationId) || !boundedReference(`${approval.operationId}:restore`)
      || !boundedReference(targetKey)) throw new Error('Exact forward approval required');
    const approved = Object.freeze({ operationId: approval.operationId, targetKey });
    this.reserved = true;
    this.currentStatus = 'preflight';
    const epoch = ++this.epoch;
    try {
      const initial = await this.context(approved.targetKey, epoch, this.now() + 5000);
      if (initial.configuration.reservePercent !== 50) throw new Error('Already-enabled native 50 baseline required');
      const claimId = this.owner!.claim(initial.target, initial.authority.revision, approved.operationId);
      this.operation = {
        operationId: approved.operationId,
        target: initial.target,
        authorityRevision: initial.authority.revision,
        companions: initial.configuration.companionSnapshotId,
        claimId,
        receivedAt: initial.configuration.receivedAt,
        reservePercent: 50,
        phaseTargetSeen: false,
        restoring: false,
      };
      const result = await this.dispatch(this.operation, epoch);
      this.assertEpoch(epoch);
      return result;
    } catch (error) {
      if (epoch === this.epoch) this.fail(new Error('Reserve forward operation unresolved'));
      throw error;
    }
  }

  /** Explicit authoritative observation, not an always-on native authority subscription. */
  async revalidate(): Promise<void> {
    const operation = this.operation || this.terminalOperation;
    if (!['observing', 'restored'].includes(this.currentStatus) || !operation || this.cancelStage) {
      throw new Error('Authoritative reserve observation unavailable');
    }
    const { epoch } = this;
    try {
      const context = await this.context(operation.target.targetKey, epoch,
        this.currentStatus === 'observing'
          ? Math.min(this.now() + 5000, this.observationDeadline) : this.now() + 5000);
      this.check(context, operation, operation.restoring ? 50 : 51);
    } catch (error) {
      if (epoch === this.epoch) this.fail(new Error('Authoritative reserve observation contradicted'));
      throw error;
    }
  }

  async restore(approval: ReserveRuntimeRestoreApproval): Promise<ReserveRuntimeResult> {
    if (this.currentStatus !== 'observing' || !this.operation || this.cancelStage || this.storageBlocked) {
      throw new Error('Conditional restoration unavailable');
    }
    if (!approval || approval.restoreApproved !== true || approval.reservePercent !== 50
      || approval.operationId !== this.operation.operationId) throw new Error('Separate exact restoration approval required');
    const approved = Object.freeze({ ...approval });
    const { operation, epoch } = this;
    this.currentStatus = 'preflight';
    try {
      if (this.now() >= this.observationDeadline) throw new Error('Reserve observation expired');
      const context = await this.context(operation.target.targetKey, epoch,
        Math.min(this.now() + 5000, this.observationDeadline));
      this.check(context, operation, 51);
      if (approved.operationId !== operation.operationId) throw new Error('Restoration approval changed');
      this.stopObservation();
      operation.restoring = true;
      operation.phaseTargetSeen = false;
      const result = await this.dispatch(operation, epoch);
      this.assertEpoch(epoch);
      return result;
    } catch (error) {
      if (epoch === this.epoch) this.fail(new Error('Reserve restoration unresolved'));
      throw error;
    }
  }

  private async dispatch(operation: Operation, epoch: number): Promise<ReserveRuntimeResult> {
    this.currentStatus = 'persisting';
    await this.persist(this.recoveryJournal(), epoch);
    const preflight = await this.context(operation.target.targetKey, epoch, this.now() + 5000);
    this.check(preflight, operation, operation.restoring ? 51 : 50);
    const percent = operation.restoring ? 50 : 51;
    const commands = encodeStream5000ReservePercentage(preflight, percent, this.qualifications);
    const operationId = `${operation.operationId}${operation.restoring ? ':restore' : ''}`;
    const ackDeadline = this.now() + 10000;
    this.currentStatus = 'awaiting_ack';
    const body = await this.within(ackDeadline, epoch, (signal) => this.transport!.set(commands.set, {
      signal, timeoutMs: ackDeadline - this.now(),
    }));
    const afterAck = await this.context(operation.target.targetKey, epoch, ackDeadline);
    this.check(afterAck, operation);
    const ack = normalizeStream5000ReserveAck(operationId, { transport: 'http', body });
    if (!ack || ack.code !== 0) throw new Error('Exact native HTTP ACK required');
    this.currentStatus = 'awaiting_configuration';
    const queryDeadline = this.now() + 30000;
    if (!Number.isSafeInteger(this.querySequence + 1)) throw new Error('Reserve query capacity exhausted');
    const queryId = `reserve-query-${++this.querySequence}`;
    const requestedAt = this.now();
    const readback = await this.within(queryDeadline, epoch, (signal) => this.transport!.get(
      commands.get.sn, [...commands.get.params.quotas], {
        signal, timeoutMs: Math.min(15000, queryDeadline - this.now()),
      },
    ));
    const receivedAt = this.now();
    const afterRead = await this.context(operation.target.targetKey, epoch, queryDeadline);
    this.check(afterRead, operation, percent);
    const observationContext = copyContext({
      ...afterRead,
      configuration: { ...afterRead.configuration, receivedAt },
    });
    const configuration = normalizeStream5000ReserveConfiguration(
      observationContext, { operationId, queryId, requestedAt },
      {
        queryId,
        receivedAt,
        source: 'official_native_selective',
        independent: true,
        target: operation.target,
        authorityRevision: operation.authorityRevision,
        body: readback,
      },
    );
    if (!configuration || configuration.reserveEnabled !== true || configuration.reservePercent !== percent) {
      throw new Error('Independent native reserve configuration required');
    }
    const result: ReserveRuntimeResult = Object.freeze({
      operationId,
      queryId,
      reservePercent: percent,
      status: operation.restoring ? 'restored' : 'observing',
      recoveryObligation: 'held',
    });
    if (operation.restoring) {
      this.currentStatus = 'persisting';
      // No terminal-clear protocol is bound: retain the durable obligation even on confirmed restoration.
      await this.persist(this.recoveryJournal(), epoch);
      this.storageFence = true;
      fencedStores.add(this.store!);
      const terminalContext = await this.context(operation.target.targetKey, epoch, this.now() + 5000);
      this.check(terminalContext, operation, 50);
      this.storageFence = false;
      fencedStores.delete(this.store!);
      this.terminalOperation = operation;
      this.operation = null;
      this.currentStatus = 'restored';
    } else {
      this.currentStatus = 'observing';
      this.observationDeadline = this.now() + 120000;
      this.observationTimer = this.clock.setTimeout(() => {
        if (epoch === this.epoch) this.fail(new Error('Reserve observation deadline exceeded'));
      }, 120000);
    }
    return result;
  }
}
