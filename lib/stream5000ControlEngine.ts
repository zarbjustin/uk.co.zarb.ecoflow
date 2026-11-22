'use strict';

import {
  ControlLedgerApproval,
  ControlLedgerOptions,
  NativeControlEvidence,
  Stream5000ControlJournal,
  Stream5000ControlLedger,
} from './stream5000ControlLedger';
import {
  ReservePilotContext,
  ReservePilotTarget,
  boundedReference,
  reservePilotContextQualified,
  snapshotReservePilotQualifications,
} from './stream5000ReservePilot';

export interface ControlStorageRecord {
  installationKey: string;
  incarnation: string;
  revision: number;
  journal: unknown;
}

export interface ControlStoragePort {
  load(installationKey: string, signal: AbortSignal): Promise<ControlStorageRecord>;
  compareAndSwap(installationKey: string, expected: Readonly<{ incarnation: string; revision: number }>,
    journal: Readonly<Stream5000ControlJournal>, signal: AbortSignal): Promise<ControlStorageRecord>;
}

export interface ControlDispatchRequest {
  installationKey: string;
  storageIncarnation: string;
  storageRevision: number;
  claimId: number;
  commandId: string;
  nativeEpoch: string;
  target: Readonly<ReservePilotTarget>;
  authorityRevision: number;
  companions: string;
  expectedFieldRevision: number;
  expectedReservePercent: 50 | 51;
  configurationReceivedAt: number;
  reservePercent: 50 | 51;
}

export interface ControlLiveContext extends ReservePilotContext {
  nativeEpoch: string;
  fieldRevision: number;
}

export interface ControlEngineOptions extends Omit<ControlLedgerOptions, 'journal'> {
  store: ControlStoragePort;
  readContext: () => ControlLiveContext;
  now?: () => number;
  /** Trusted actual binding qualification, not evidence manufactured by this engine. */
  bindingsQualified?: () => boolean;
  dispatch?: (request: Readonly<ControlDispatchRequest>, signal: AbortSignal) => Promise<void>;
}

export interface ControlEngineSnapshot {
  held: boolean;
  busy: boolean;
  opened: boolean;
  storageUncertain: boolean;
  revision: number | null;
  durableJournal: unknown;
}

function snapshot<T>(value: T): T {
  const result = JSON.parse(JSON.stringify(value));
  const freeze = (item: any) => {
    if (item && typeof item === 'object') {
      Object.values(item).forEach(freeze);
      Object.freeze(item);
    }
  };
  freeze(result);
  return result;
}

const targetKeys = [
  'targetKey', 'installationKey', 'model', 'firmware', 'scope', 'routing', 'commandTargetSn', 'generation',
] as const;

/**
 * Unbound asynchronous bridge. Ports must independently qualify durable CAS and
 * native execution fencing; no Homey store, transport or battery writer is supplied.
 */
export class Stream5000ControlEngine {
  private readonly options: ControlLedgerOptions;
  private readonly load: ControlStoragePort['load'];
  private readonly cas: ControlStoragePort['compareAndSwap'];
  private readonly readContext: ControlEngineOptions['readContext'];
  private readonly now: () => number;
  private readonly qualification?: ControlEngineOptions['bindingsQualified'];
  private readonly dispatchPort?: ControlEngineOptions['dispatch'];
  private readonly controller = new AbortController();
  private ledger: Stream5000ControlLedger | null = null;
  private confirmed: ControlStorageRecord | null = null;
  private busy = false;
  private held = false;
  private storageUncertain = false;
  private lastNow = 0;

  constructor(options: ControlEngineOptions) {
    this.options = {
      installationKey: options.installationKey,
      enabled: options.enabled === true,
      qualifications: snapshotReservePilotQualifications(options.qualifications || []),
      verifyEvidence: options.verifyEvidence,
    };
    // Validate the fixed identity/options before calling either external port.
    new Stream5000ControlLedger(this.options).journal();
    this.load = options.store.load.bind(options.store);
    this.cas = options.store.compareAndSwap.bind(options.store);
    this.readContext = options.readContext;
    this.now = options.now || Date.now;
    this.qualification = options.bindingsQualified;
    this.dispatchPort = options.dispatch;
  }

  snapshot(): Readonly<ControlEngineSnapshot> {
    return snapshot({
      held: this.held,
      busy: this.busy,
      opened: this.ledger !== null,
      storageUncertain: this.storageUncertain,
      revision: this.confirmed?.revision ?? null,
      durableJournal: this.confirmed?.journal ?? null,
    });
  }

  stop(): void {
    this.held = true;
    this.ledger?.hold();
    this.controller.abort();
  }

  private alive(): void {
    if (this.held) throw new Error('Control engine held; fresh recovery required');
  }

  private qualified(): void {
    this.alive();
    if (this.options.enabled !== true || !this.dispatchPort || this.qualification?.() !== true) {
      throw new Error('Control engine bindings disabled or unqualified');
    }
    this.alive();
  }

  private current(): ControlLiveContext {
    const observed = snapshot(this.readContext());
    const now = this.now();
    if (!Number.isFinite(now) || now < 0 || now < this.lastNow) {
      throw new Error('Control engine clock invalid or reversed');
    }
    this.lastNow = now;
    const current = snapshot({ ...observed, now });
    this.alive();
    return current;
  }

  private activeContext(percent?: 50 | 51): ControlLiveContext {
    const operation = this.requireLedger().journal().active;
    return this.operationContext(operation, percent);
  }

  private operationContext(operation: Stream5000ControlJournal['active'], percent?: 50 | 51,
    fieldRevision?: number): ControlLiveContext {
    const current = this.current();
    if (!operation || !reservePilotContextQualified(current, this.options.qualifications || [])
      || targetKeys.some((key) => operation.target[key] !== current.target[key])
      || current.authority.revision !== operation.authorityRevision
      || current.configuration.companionSnapshotId !== operation.companions
      || current.nativeEpoch !== operation.nativeEpoch
      || !Number.isSafeInteger(current.fieldRevision) || current.fieldRevision < operation.baselineRevision
      || (percent !== undefined && (current.configuration.reservePercent !== percent
        || current.fieldRevision !== (fieldRevision ?? (percent === 51 ? operation.forwardRevision
          : operation.restoreRevision ?? operation.baselineRevision))))) {
      throw new Error('Live control context changed or expired');
    }
    return current;
  }

  private requireLedger(): Stream5000ControlLedger {
    if (!this.ledger || !this.confirmed) throw new Error('Control engine must load qualified storage first');
    return this.ledger;
  }

  private observation(current: ControlLiveContext, evidence: NativeControlEvidence): void {
    if (current.nativeEpoch !== evidence.nativeEpoch || current.fieldRevision !== evidence.fieldRevision) {
      throw new Error('Native evidence does not match the current own-field observation');
    }
    this.alive();
  }

  private async io<T>(value: Promise<T>): Promise<T> {
    const { signal } = this.controller;
    return new Promise<T>((resolve, reject) => {
      const aborted = () => reject(new Error('Control engine IO withdrawn; outcome may be unknown'));
      signal.addEventListener('abort', aborted, { once: true });
      Promise.resolve(value).then(
        (result) => {
          signal.removeEventListener('abort', aborted); resolve(result);
        },
        (error) => {
          signal.removeEventListener('abort', aborted); reject(error);
        },
      );
      if (signal.aborted) {
        signal.removeEventListener('abort', aborted);
        aborted();
      }
    });
  }

  private async run(work: () => Promise<void>): Promise<Readonly<ControlEngineSnapshot>> {
    this.alive();
    if (this.busy) throw new Error('Control engine busy; no queue or retry');
    this.busy = true;
    try {
      await work();
      this.alive();
    } catch (error) {
      this.stop();
      throw error;
    } finally {
      this.busy = false;
    }
    return this.snapshot();
  }

  private record(value: ControlStorageRecord): ControlStorageRecord {
    const row = snapshot(value);
    this.alive();
    if (row?.installationKey !== this.options.installationKey
      || !boundedReference(row.incarnation)
      || !Number.isSafeInteger(row.revision) || row.revision < 0 || row.journal === undefined) {
      throw new Error('Invalid qualified storage record');
    }
    new Stream5000ControlLedger({ ...this.options, journal: row.journal }).journal();
    this.alive();
    return row;
  }

  private async persist(journal: Readonly<Stream5000ControlJournal>): Promise<void> {
    const { revision } = (this.confirmed!);
    if (revision === Number.MAX_SAFE_INTEGER) throw new Error('Control storage revision exhausted');
    this.storageUncertain = true;
    const expected = snapshot({ incarnation: this.confirmed!.incarnation, revision });
    const result = await this.io(this.cas(this.options.installationKey, expected, journal, this.controller.signal));
    this.alive();
    const row = this.record(result);
    if (row.incarnation !== this.confirmed!.incarnation || row.revision !== revision + 1
      || JSON.stringify(row.journal) !== JSON.stringify(journal)) {
      throw new Error('Durable control commit acknowledgement mismatch');
    }
    this.confirmed = row;
    this.storageUncertain = false;
    this.qualified();
  }

  async open(): Promise<Readonly<ControlEngineSnapshot>> {
    return this.run(async () => {
      if (this.ledger) throw new Error('Control storage already loaded');
      this.storageUncertain = true;
      const row = this.record(await this.io(this.load(this.options.installationKey, this.controller.signal)));
      this.ledger = new Stream5000ControlLedger({ ...this.options, journal: row.journal });
      this.confirmed = row;
      this.storageUncertain = false;
    });
  }

  async begin(approval: ControlLedgerApproval, baseline: NativeControlEvidence): Promise<Readonly<ControlEngineSnapshot>> {
    return this.run(async () => {
      this.qualified();
      baseline = snapshot(baseline);
      const current = this.current();
      this.observation(current, baseline);
      const journal = this.requireLedger().begin(current, approval, baseline);
      await this.persist(journal);
      this.activeContext(50);
    });
  }

  async dispatch(claimId: number): Promise<Readonly<ControlEngineSnapshot>> {
    return this.run(async () => {
      this.qualified();
      const ledger = this.requireLedger();
      const restoring = ledger.journal().active?.phase === 'restore_intent';
      this.activeContext(restoring ? 51 : 50);
      await this.persist(ledger.dispatchPossible(claimId));
      this.qualified();
      const current = this.activeContext(restoring ? 51 : 50);
      const operation = ledger.journal().active!;
      const request = snapshot({
        installationKey: this.options.installationKey,
        storageIncarnation: this.confirmed!.incarnation,
        storageRevision: this.confirmed!.revision,
        claimId,
        commandId: restoring ? operation.restoreCommandId : operation.forwardCommandId,
        nativeEpoch: operation.nativeEpoch,
        target: operation.target,
        authorityRevision: operation.authorityRevision,
        companions: operation.companions,
        expectedFieldRevision: restoring ? operation.forwardRevision! : operation.baselineRevision,
        expectedReservePercent: (restoring ? 51 : 50) as 50 | 51,
        configurationReceivedAt: current.configuration.receivedAt,
        reservePercent: (restoring ? 50 : 51) as 50 | 51,
      });
      this.qualified();
      await this.io(this.dispatchPort!(request, this.controller.signal));
      this.alive();
      this.activeContext();
      this.qualified();
      // Dispatch acceptance is not terminal execution/application evidence.
    });
  }

  async terminal(claimId: number, evidence: NativeControlEvidence): Promise<Readonly<ControlEngineSnapshot>> {
    return this.run(async () => {
      this.qualified();
      const ledger = this.requireLedger();
      const percent = ledger.journal().active?.phase === 'restore_possible' ? 50 : 51;
      evidence = snapshot(evidence);
      const current = this.current();
      this.observation(current, evidence);
      await this.persist(ledger.terminal(current, claimId, evidence));
      this.activeContext(percent);
    });
  }

  async restore(approval: ControlLedgerApproval): Promise<Readonly<ControlEngineSnapshot>> {
    return this.run(async () => {
      this.qualified();
      const ledger = this.requireLedger();
      await this.persist(ledger.restoreIntent(this.current(), approval));
      this.activeContext(51);
    });
  }

  async close(claimId: number, evidence: NativeControlEvidence): Promise<Readonly<ControlEngineSnapshot>> {
    return this.run(async () => {
      this.qualified();
      const ledger = this.requireLedger();
      const operation = ledger.journal().active;
      evidence = snapshot(evidence);
      const current = this.current();
      this.observation(current, evidence);
      await this.persist(ledger.close(current, claimId, evidence));
      this.operationContext(operation, 50, evidence.fieldRevision);
    });
  }
}
