'use strict';

import {
  InstallationOperationJournal,
  Stream5000InstallationOperationOwner,
} from './stream5000ControlContract';
import {
  boundedReference,
  PilotApproval,
  ReservePilotContext,
  ReservePilotQualification,
  ReservePilotTarget,
  reservePilotContextQualified,
  snapshotReservePilotQualifications,
} from './stream5000ReservePilot';

export type ControlLedgerPhase = 'intent' | 'forward_possible' | 'forward_terminal'
  | 'restore_intent' | 'restore_possible' | 'restore_terminal';

export interface NativeControlEvidence {
  kind: 'baseline' | 'command_terminal' | 'closure';
  nativeEpoch: string;
  fieldRevision: number;
  reservePercent: 50 | 51;
  commandId?: string;
  terminal?: boolean;
  forwardCommandId?: string;
  restoreCommandId?: string;
  terminalThroughRevision?: number;
}

interface LedgerOperation {
  claimId: number;
  operationId: string;
  target: ReservePilotTarget;
  authorityRevision: number;
  companions: string;
  nativeEpoch: string;
  baselineRevision: number;
  phase: ControlLedgerPhase;
  held: boolean;
  forwardCommandId: string;
  restoreCommandId: string;
  forwardRevision: number | null;
  restoreRevision: number | null;
}

interface TerminalFrontier {
  claimId: number;
  operationId: string;
  target: ReservePilotTarget;
  nativeEpoch: string;
  baselineRevision: number;
  forwardRevision: number;
  restoreRevision: number;
  fieldRevision: number;
  forwardCommandId: string;
  restoreCommandId: string;
}

export interface ControlLedgerApproval extends PilotApproval {
  claimId: number;
}

export interface Stream5000ControlJournal {
  version: 2;
  installationKey: string;
  nextClaimId: number;
  active: Readonly<LedgerOperation> | null;
  frontier: Readonly<TerminalFrontier> | null;
  legacy: Readonly<InstallationOperationJournal> | null;
}

export interface ControlLedgerOptions {
  installationKey: string;
  enabled?: boolean;
  qualifications?: readonly ReservePilotQualification[];
  /** Trusted native proof producer, not ACK, local IDs, receipts or manual evidence references. */
  verifyEvidence?: (evidence: Readonly<NativeControlEvidence>, context: Readonly<ReservePilotContext>) => boolean;
  journal?: unknown;
}

const phases: readonly ControlLedgerPhase[] = [
  'intent', 'forward_possible', 'forward_terminal', 'restore_intent', 'restore_possible', 'restore_terminal',
];
const targetKeys = [
  'targetKey', 'installationKey', 'model', 'firmware', 'scope', 'routing', 'commandTargetSn', 'generation',
] as const;

function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid control journal');
  return value as Record<string, any>;
}

function revision(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function freeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => freeze(item));
    Object.freeze(value);
  }
  return value;
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function target(value: unknown, installationKey: string): ReservePilotTarget {
  const supplied = object(value);
  const owner = new Stream5000InstallationOperationOwner();
  owner.claim(supplied as ReservePilotTarget, 0, 'validate-control-target');
  if (supplied.installationKey !== installationKey) throw new Error('Control installation mismatch');
  return { ...owner.snapshot(installationKey)!.target };
}

/**
 * Source-only phase planner. Each returned journal needs qualified durable CAS before
 * dispatch or successor admission. It is not a store, transport, live provider or executor.
 */
export class Stream5000ControlLedger {
  private readonly installationKey: string;
  private readonly enabled: boolean;
  private readonly qualifications: readonly ReservePilotQualification[];
  private readonly verifier?: ControlLedgerOptions['verifyEvidence'];
  private nextClaimId = 0;
  private active: LedgerOperation | null = null;
  private frontier: TerminalFrontier | null = null;
  private legacy: Readonly<InstallationOperationJournal> | null = null;
  private validating = false;
  private planning = false;
  private epoch = 0;

  constructor(options: ControlLedgerOptions) {
    if (!options || !boundedReference(options.installationKey)) throw new Error('Control installation required');
    this.installationKey = options.installationKey;
    this.enabled = options.enabled === true;
    this.qualifications = snapshotReservePilotQualifications(options.qualifications || []);
    this.verifier = options.verifyEvidence;
    if (options.journal === undefined) return;
    const saved = object(options.journal);
    if (saved.version === 1) {
      const recovered = new Stream5000InstallationOperationOwner(64, saved).journal();
      this.nextClaimId = recovered.nextClaimId;
      // An old empty journal with used claims has lost its terminal frontier.
      if (recovered.nextClaimId || recovered.operations.length) this.legacy = recovered;
      return;
    }
    if (saved.version !== 2 || saved.installationKey !== this.installationKey
      || !revision(saved.nextClaimId) || !('active' in saved) || !('frontier' in saved) || !('legacy' in saved)) {
      throw new Error('Invalid control journal');
    }
    this.nextClaimId = saved.nextClaimId;
    if (saved.legacy !== null) {
      const recovered = new Stream5000InstallationOperationOwner(64, saved.legacy).journal();
      if (saved.active !== null || saved.frontier !== null || recovered.nextClaimId !== this.nextClaimId
        || (!recovered.nextClaimId && !recovered.operations.length)) throw new Error('Invalid legacy recovery journal');
      this.legacy = recovered;
      return;
    }
    if (saved.frontier !== null) {
      const previous = object(saved.frontier);
      this.frontier = {
        claimId: previous.claimId,
        operationId: previous.operationId,
        target: target(previous.target, this.installationKey),
        nativeEpoch: previous.nativeEpoch,
        baselineRevision: previous.baselineRevision,
        forwardRevision: previous.forwardRevision,
        restoreRevision: previous.restoreRevision,
        fieldRevision: previous.fieldRevision,
        forwardCommandId: previous.forwardCommandId,
        restoreCommandId: previous.restoreCommandId,
      };
      if (!revision(previous.claimId) || previous.claimId < 1
        || !boundedReference(previous.operationId) || !boundedReference(previous.nativeEpoch)
        || !revision(previous.baselineRevision) || !revision(previous.forwardRevision)
        || !revision(previous.restoreRevision) || !revision(previous.fieldRevision)
        || previous.claimId > Math.floor(Number.MAX_SAFE_INTEGER / 2)
        || previous.baselineRevision < 2 * (previous.claimId - 1)
        || previous.forwardRevision <= previous.baselineRevision
        || previous.restoreRevision <= previous.forwardRevision || previous.fieldRevision < previous.restoreRevision
        || previous.forwardCommandId !== `reserve-${previous.claimId}:forward`
        || previous.restoreCommandId !== `reserve-${previous.claimId}:restore`) throw new Error('Invalid terminal frontier');
    }
    if (saved.active !== null) {
      const current = object(saved.active);
      this.active = {
        claimId: current.claimId,
        operationId: current.operationId,
        target: target(current.target, this.installationKey),
        authorityRevision: current.authorityRevision,
        companions: current.companions,
        nativeEpoch: current.nativeEpoch,
        baselineRevision: current.baselineRevision,
        phase: current.phase,
        held: true,
        forwardCommandId: current.forwardCommandId,
        restoreCommandId: current.restoreCommandId,
        forwardRevision: current.forwardRevision,
        restoreRevision: current.restoreRevision,
      };
      if (!revision(current.claimId) || current.claimId < 1 || current.claimId !== this.nextClaimId
        || !boundedReference(current.operationId) || !revision(current.authorityRevision)
        || !boundedReference(current.companions, 1024) || !boundedReference(current.nativeEpoch)
        || !revision(current.baselineRevision) || !phases.includes(current.phase)
        || typeof current.held !== 'boolean'
        || current.forwardCommandId !== `reserve-${current.claimId}:forward`
        || current.restoreCommandId !== `reserve-${current.claimId}:restore`) throw new Error('Invalid control operation');
      const forwardSeen = phases.indexOf(current.phase) >= phases.indexOf('forward_terminal');
      const restoreSeen = current.phase === 'restore_terminal';
      if ((forwardSeen ? !revision(current.forwardRevision) || current.forwardRevision <= current.baselineRevision
        : current.forwardRevision !== null)
        || (restoreSeen ? !revision(current.restoreRevision) || current.restoreRevision <= current.forwardRevision
          : current.restoreRevision !== null)) throw new Error('Invalid control phase frontier');
    }
    const completedClaim = this.frontier?.claimId || 0;
    if (this.active ? completedClaim !== this.nextClaimId - 1 : completedClaim !== this.nextClaimId) {
      throw new Error('Control journal frontier gap');
    }
    if (this.active && this.frontier && (this.active.nativeEpoch !== this.frontier.nativeEpoch
      || this.active.operationId === this.frontier.operationId
      || this.active.baselineRevision < this.frontier.fieldRevision
      || targetKeys.some((key) => this.active!.target[key] !== this.frontier!.target[key]))) {
      throw new Error('Control frontier identity drift');
    }
  }

  journal(): Readonly<Stream5000ControlJournal> {
    return freeze(copy({
      version: 2 as const,
      installationKey: this.installationKey,
      nextClaimId: this.nextClaimId,
      active: this.active,
      frontier: this.frontier,
      legacy: this.legacy,
    }));
  }

  hold(): void {
    this.epoch += 1;
    if (this.active) this.active = { ...this.active, held: true };
  }

  private assertWritable(): void {
    if (!this.enabled || this.validating || this.planning) throw new Error('Control phase planner disabled or validating');
  }

  private plan<T>(work: (check: () => void) => T): T {
    this.assertWritable();
    const { epoch } = this;
    this.planning = true;
    const check = () => {
      if (epoch !== this.epoch) throw new Error('Control phase planning withdrawn');
    };
    try {
      return work(check);
    } finally {
      this.planning = false;
    }
  }

  private context(context: ReservePilotContext, percent: 50 | 51): ReservePilotContext {
    const current = freeze(copy(context));
    if (!reservePilotContextQualified(current, this.qualifications)
      || current.target.installationKey !== this.installationKey
      || current.configuration.reservePercent !== percent) throw new Error('Qualified native control context required');
    if (this.active && (targetKeys.some((key) => this.active!.target[key] !== current.target[key])
      || this.active.authorityRevision !== current.authority.revision
      || this.active.companions !== current.configuration.companionSnapshotId)) throw new Error('Control context drift');
    return current;
  }

  private evidence(value: NativeControlEvidence): NativeControlEvidence {
    const supplied = object(value);
    return freeze({
      kind: supplied.kind,
      nativeEpoch: supplied.nativeEpoch,
      fieldRevision: supplied.fieldRevision,
      reservePercent: supplied.reservePercent,
      commandId: supplied.commandId,
      terminal: supplied.terminal,
      forwardCommandId: supplied.forwardCommandId,
      restoreCommandId: supplied.restoreCommandId,
      terminalThroughRevision: supplied.terminalThroughRevision,
    });
  }

  private verify(evidence: NativeControlEvidence, context: ReservePilotContext): void {
    const supplied = freeze(copy(evidence));
    const { epoch, active } = this;
    if (!boundedReference(supplied.nativeEpoch) || !revision(supplied.fieldRevision) || !this.verifier) {
      throw new Error('Qualified native evidence provider required');
    }
    this.validating = true;
    try {
      if (this.verifier(supplied, context) !== true || epoch !== this.epoch || active !== this.active) {
        throw new Error('Native control evidence withdrawn or unqualified');
      }
    } finally {
      this.validating = false;
    }
  }

  begin(context: ReservePilotContext, approval: ControlLedgerApproval, baseline: NativeControlEvidence): Readonly<Stream5000ControlJournal> {
    return this.plan((check) => {
      if (this.active || this.legacy) throw new Error('Control recovery held; no queue or replay');
      const current = this.context(context, 50);
      approval = freeze(copy(approval));
      baseline = this.evidence(baseline);
      if (!approval || approval.forwardApproved !== true || approval.reservePercent !== 51
      || approval.claimId !== this.nextClaimId + 1
      || !boundedReference(approval.operationId) || !Number.isSafeInteger(this.nextClaimId + 1)
      || baseline?.kind !== 'baseline' || baseline.reservePercent !== 50
      || !revision(baseline.fieldRevision) || baseline.fieldRevision > Number.MAX_SAFE_INTEGER - 2) {
        throw new Error('Exact reserve pilot intent with native revision headroom required');
      }
      if (this.frontier && (baseline.nativeEpoch !== this.frontier.nativeEpoch
      || baseline.fieldRevision < this.frontier.fieldRevision || approval.operationId === this.frontier.operationId
      || targetKeys.some((key) => this.frontier!.target[key] !== current.target[key]))) {
        throw new Error('Control terminal frontier drift or replay');
      }
      check();
      this.verify(baseline, current);
      check();
      const claimId = this.nextClaimId + 1;
      this.active = {
        claimId,
        operationId: approval.operationId,
        target: { ...current.target },
        authorityRevision: current.authority.revision,
        companions: current.configuration.companionSnapshotId,
        nativeEpoch: baseline.nativeEpoch,
        baselineRevision: baseline.fieldRevision,
        phase: 'intent',
        held: false,
        forwardCommandId: `reserve-${claimId}:forward`,
        restoreCommandId: `reserve-${claimId}:restore`,
        forwardRevision: null,
        restoreRevision: null,
      };
      this.nextClaimId = claimId;
      return this.journal();
    });
  }

  dispatchPossible(claimId: number): Readonly<Stream5000ControlJournal> {
    return this.plan((check) => {
      const operation = this.active;
      if (!operation || operation.claimId !== claimId || operation.held
      || !['intent', 'restore_intent'].includes(operation.phase)) throw new Error('Control dispatch phase unavailable');
      if (operation.phase === 'intent' ? operation.baselineRevision > Number.MAX_SAFE_INTEGER - 2
        : operation.forwardRevision === Number.MAX_SAFE_INTEGER) throw new Error('Native revision headroom exhausted');
      check();
      this.active = {
        ...operation, phase: operation.phase === 'intent' ? 'forward_possible' : 'restore_possible',
      };
      return this.journal();
    });
  }

  terminal(context: ReservePilotContext, claimId: number, evidence: NativeControlEvidence): Readonly<Stream5000ControlJournal> {
    return this.plan((check) => {
      const operation = this.active;
      if (!operation || operation.claimId !== claimId
      || !['forward_possible', 'restore_possible'].includes(operation.phase)) throw new Error('Control terminal phase unavailable');
      const restoring = operation.phase === 'restore_possible';
      const percent = restoring ? 50 : 51;
      const current = this.context(context, percent);
      evidence = this.evidence(evidence);
      if (evidence?.kind !== 'command_terminal' || evidence.terminal !== true
      || evidence.commandId !== (restoring ? operation.restoreCommandId : operation.forwardCommandId)
      || evidence.nativeEpoch !== operation.nativeEpoch || evidence.reservePercent !== percent
      || !revision(evidence.fieldRevision)
      || evidence.fieldRevision <= (restoring ? operation.forwardRevision! : operation.baselineRevision)) {
        throw new Error('Causal terminal command evidence required');
      }
      check();
      this.verify(evidence, current);
      check();
      this.active = {
        ...operation,
        phase: restoring ? 'restore_terminal' : 'forward_terminal',
        forwardRevision: restoring ? operation.forwardRevision : evidence.fieldRevision,
        restoreRevision: restoring ? evidence.fieldRevision : null,
      };
      return this.journal();
    });
  }

  restoreIntent(context: ReservePilotContext, approval: ControlLedgerApproval): Readonly<Stream5000ControlJournal> {
    return this.plan((check) => {
      const operation = this.active;
      approval = freeze(copy(approval));
      if (!operation || operation.held || operation.phase !== 'forward_terminal'
      || approval?.claimId !== operation.claimId
      || approval?.restoreApproved !== true || approval.operationId !== operation.operationId
      || approval.reservePercent !== 50) throw new Error('Separate exact restoration approval required');
      if (operation.forwardRevision === Number.MAX_SAFE_INTEGER) throw new Error('Native revision headroom exhausted');
      this.context(context, 51);
      check();
      this.active = { ...operation, phase: 'restore_intent' };
      return this.journal();
    });
  }

  close(context: ReservePilotContext, claimId: number, evidence: NativeControlEvidence): Readonly<Stream5000ControlJournal> {
    return this.plan((check) => {
      const operation = this.active;
      if (!operation || operation.claimId !== claimId || operation.phase !== 'restore_terminal') {
        throw new Error('Control closure phase unavailable');
      }
      const current = this.context(context, 50);
      evidence = this.evidence(evidence);
      if (evidence?.kind !== 'closure' || evidence.terminal !== true || evidence.reservePercent !== 50
      || evidence.nativeEpoch !== operation.nativeEpoch
      || evidence.forwardCommandId !== operation.forwardCommandId || evidence.restoreCommandId !== operation.restoreCommandId
      || !revision(evidence.fieldRevision) || !revision(evidence.terminalThroughRevision)
      || evidence.terminalThroughRevision < operation.restoreRevision!
      || evidence.fieldRevision < evidence.terminalThroughRevision) throw new Error('Native terminal closure barrier required');
      check();
      this.verify(evidence, current);
      check();
      this.frontier = {
        claimId,
        operationId: operation.operationId,
        target: { ...operation.target },
        nativeEpoch: operation.nativeEpoch,
        baselineRevision: operation.baselineRevision,
        forwardRevision: operation.forwardRevision!,
        restoreRevision: operation.restoreRevision!,
        fieldRevision: evidence.fieldRevision,
        forwardCommandId: operation.forwardCommandId,
        restoreCommandId: operation.restoreCommandId,
      };
      this.active = null;
      return this.journal();
    });
  }
}
