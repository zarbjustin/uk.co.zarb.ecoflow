'use strict';

export interface ReservePilotTarget {
  targetKey: string;
  installationKey: string;
  model: 'STREAM_5000' | 'STREAM_5000_AC';
  firmware: string;
  scope: 'unit' | 'system';
  routing: 'qualified_unit' | 'qualified_system_main';
  commandTargetSn: string;
  generation: number;
}

export interface ReservePilotQualification {
  action: 'backup_reserve_percent';
  source: 'official_native';
  targetKey: string;
  installationKey: string;
  model: ReservePilotTarget['model'];
  firmware: string;
  scope: ReservePilotTarget['scope'];
  routing: ReservePilotTarget['routing'];
  commandTargetSn: string;
  routingEvidenceRef: string;
  evidenceRef: string;
}

export interface ReservePilotContext {
  now: number;
  target: ReservePilotTarget;
  authority: { revision: number; exclusive: boolean; nativeAiCoordinated: boolean };
  configuration: {
    source: 'official_native' | 'captured_app_protocol' | 'cloud_latest';
    generation: number;
    commandTargetSn: string;
    receivedAt: number;
    reserveEnabled: boolean;
    reservePercent: number;
    companionSnapshotId: string;
  };
}

export interface PilotApproval {
  operationId: string;
  forwardApproved: boolean;
  restoreApproved: boolean;
  reservePercent: number;
}

export type PilotStatus = 'idle' | 'awaiting_ack' | 'awaiting_configuration' | 'observing'
  | 'observed' | 'awaiting_restore_ack' | 'awaiting_restore_configuration' | 'restored' | 'unknown';

export type ReservePilotEvent =
  | { kind: 'tick' }
  | { kind: 'ack'; operationId: string; code: number }
  | { kind: 'configuration'; operationId: string; receivedAt: number; independent: boolean;
    source: 'official_native_selective'; queryId: string; queriedAt: number;
    reserveEnabled: boolean; reservePercent: number }
  | { kind: 'outcome'; operationId: string; independentPhysicalObservation: boolean;
    observedAt: number; targetKey: string; generation: number; scope: ReservePilotTarget['scope'];
    source: 'independent_native_policy' | 'grid_watts_inference'; evidenceRef: string };

export function boundedReference(value: unknown, maximum = 128): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maximum;
}

export interface ReservePilotOperationOwner {
  claim(target: ReservePilotTarget, authorityRevision: number, operationId: string): number;
  owns(installationKey: string, claimId: number): boolean;
  markUnknown(installationKey: string, claimId: number): void;
  complete(installationKey: string, claimId: number): void;
}

export function snapshotReservePilotQualifications(
  qualifications: readonly ReservePilotQualification[],
): readonly ReservePilotQualification[] {
  if (!Array.isArray(qualifications) || qualifications.length > 64
    || !qualifications.every((record) => record
      && record.action === 'backup_reserve_percent' && record.source === 'official_native'
      && ['targetKey', 'installationKey', 'firmware', 'commandTargetSn'].every((key) => boundedReference((record as any)[key]))
      && ['STREAM_5000', 'STREAM_5000_AC'].includes(record.model)
      && ['unit', 'system'].includes(record.scope)
      && record.routing === (record.scope === 'system' ? 'qualified_system_main' : 'qualified_unit')
      && boundedReference(record.routingEvidenceRef, 1024)
      && boundedReference(record.evidenceRef, 1024))) throw new Error('Invalid native qualification');
  return Object.freeze(qualifications.map((record) => Object.freeze({
    action: record.action,
    source: record.source,
    targetKey: record.targetKey,
    installationKey: record.installationKey,
    model: record.model,
    firmware: record.firmware,
    scope: record.scope,
    routing: record.routing,
    commandTargetSn: record.commandTargetSn,
    routingEvidenceRef: record.routingEvidenceRef,
    evidenceRef: record.evidenceRef,
  })));
}

export function reservePilotContextQualified(
  context: ReservePilotContext, qualifications: readonly ReservePilotQualification[],
): boolean {
  if (!context) return false;
  const {
    target, configuration, authority, now,
  } = context;
  return Number.isFinite(now) && now >= 0
    && !!target && ['STREAM_5000', 'STREAM_5000_AC'].includes(target.model)
    && ['unit', 'system'].includes(target.scope)
    && Number.isSafeInteger(target.generation) && target.generation >= 0
    && boundedReference(target.targetKey)
    && boundedReference(target.installationKey)
    && boundedReference(target.firmware)
    && boundedReference(target.commandTargetSn)
    && target.routing === (target.scope === 'system' ? 'qualified_system_main' : 'qualified_unit')
    && qualifications.some((record) => record.action === 'backup_reserve_percent'
      && record.source === 'official_native'
      && ['targetKey', 'installationKey', 'model', 'firmware', 'scope', 'routing', 'commandTargetSn'].every(
        (key) => (record as any)[key] === (target as any)[key],
      ))
    && !!authority && authority.exclusive === true && authority.nativeAiCoordinated === true
    && Number.isSafeInteger(authority.revision) && authority.revision >= 0
    && !!configuration && configuration.source === 'official_native'
    && configuration.generation === target.generation
    && configuration.commandTargetSn === target.commandTargetSn
    && Number.isFinite(configuration.receivedAt) && configuration.receivedAt >= 0
    && now >= configuration.receivedAt && now - configuration.receivedAt < 5000
    && configuration.reserveEnabled === true
    && Number.isInteger(configuration.reservePercent)
    && configuration.reservePercent >= 0 && configuration.reservePercent <= 100
    && boundedReference(configuration.companionSnapshotId, 1024);
}

/** Offline only: no transport, timers, SDK binding, live registry or command authority. */
export class Stream5000ReservePilot {
  private currentStatus: PilotStatus = 'idle';
  private target: ReservePilotTarget | null = null;
  private authorityRevision = -1;
  private companions = '';
  private approval: PilotApproval | null = null;
  private lastNow = 0;
  private dispatchedAt = 0;
  private acknowledgedAt = 0;
  private deadline = 0;
  private configurationFrontier: Readonly<{ receivedAt: number; reservePercent: number }> = Object.freeze({
    receivedAt: 0, reservePercent: 50,
  });

  private confirmedConfigurationAt = 0;
  private phaseTargetReceivedAt: number | null = null;
  private claimId = -1;
  private readonly qualifications: readonly ReservePilotQualification[];

  constructor(
    qualifications: readonly ReservePilotQualification[] = [],
    private readonly owner?: ReservePilotOperationOwner,
  ) {
    this.qualifications = snapshotReservePilotQualifications(qualifications);
  }

  get status(): PilotStatus {
    return this.currentStatus;
  }

  private qualified(context: ReservePilotContext): boolean {
    return reservePilotContextQualified(context, this.qualifications);
  }

  begin(context: ReservePilotContext, approval: PilotApproval): { operationId: string; reservePercent: 51 } {
    if (this.currentStatus !== 'idle') throw new Error('Pilot already used; no queue or automatic retry');
    if (!this.owner || !this.qualified(context) || !approval || approval.forwardApproved !== true
      || !boundedReference(approval.operationId) || !boundedReference(`${approval.operationId}:restore`)
      || approval.reservePercent !== 51
      || context.configuration.reservePercent !== 50) throw new Error('Reserve pilot preflight blocked');
    this.claimId = this.owner.claim(context.target, context.authority.revision, approval.operationId);
    this.target = {
      targetKey: context.target.targetKey,
      installationKey: context.target.installationKey,
      model: context.target.model,
      firmware: context.target.firmware,
      scope: context.target.scope,
      routing: context.target.routing,
      commandTargetSn: context.target.commandTargetSn,
      generation: context.target.generation,
    };
    this.authorityRevision = context.authority.revision;
    this.companions = context.configuration.companionSnapshotId;
    this.approval = {
      operationId: approval.operationId,
      forwardApproved: approval.forwardApproved,
      restoreApproved: approval.restoreApproved,
      reservePercent: approval.reservePercent,
    };
    this.lastNow = context.now;
    this.recordConfiguration(context);
    this.dispatchedAt = context.now;
    this.deadline = context.now + 10000;
    this.phaseTargetReceivedAt = null;
    this.currentStatus = 'awaiting_ack';
    return { operationId: approval.operationId, reservePercent: 51 };
  }

  private current(context: ReservePilotContext): boolean {
    return this.qualified(context) && context.now >= this.lastNow
      && (context.configuration.receivedAt > this.configurationFrontier.receivedAt
        || (context.configuration.receivedAt === this.configurationFrontier.receivedAt
          && context.configuration.reservePercent === this.configurationFrontier.reservePercent))
      && !!this.target && ['targetKey', 'installationKey', 'model', 'firmware', 'scope', 'generation', 'routing', 'commandTargetSn'].every(
      (key) => (this.target as any)[key] === (context.target as any)[key],
    ) && !!this.owner?.owns(this.target.installationKey, this.claimId)
      && context.authority.revision === this.authorityRevision
      && context.configuration.companionSnapshotId === this.companions;
  }

  private recordConfiguration(context: ReservePilotContext): void {
    // A receipt timestamp is not unique: equal receipts must retain the same reserve value.
    this.configurationFrontier = Object.freeze({
      receivedAt: context.configuration.receivedAt,
      reservePercent: context.configuration.reservePercent,
    });
  }

  private unknown(): PilotStatus {
    this.currentStatus = 'unknown';
    if (this.target) this.owner?.markUnknown(this.target.installationKey, this.claimId);
    return this.currentStatus;
  }

  step(context: ReservePilotContext, event: ReservePilotEvent): PilotStatus {
    if (['idle', 'restored', 'unknown'].includes(this.currentStatus)) return this.currentStatus;
    if (!this.current(context) || context.now >= this.deadline
      || ![50, 51].includes(context.configuration.reservePercent)
      || (['observing', 'observed'].includes(this.currentStatus) && context.configuration.reservePercent !== 51)) {
      return this.unknown();
    }
    const restoring = this.currentStatus.startsWith('awaiting_restore');
    const phaseTarget = restoring ? 50 : 51;
    if (this.phaseTargetReceivedAt !== null
      && context.configuration.receivedAt > this.phaseTargetReceivedAt
      && context.configuration.reservePercent !== phaseTarget) return this.unknown();
    if (context.configuration.receivedAt > this.configurationFrontier.receivedAt
      && context.configuration.reservePercent === phaseTarget) {
      this.phaseTargetReceivedAt = context.configuration.receivedAt;
    }
    this.lastNow = context.now;
    this.recordConfiguration(context);
    if (event.kind === 'tick') return this.currentStatus;
    const operationId = `${this.approval!.operationId}${restoring ? ':restore' : ''}`;
    if (event.operationId !== operationId) return this.currentStatus;
    if (event.kind === 'ack') {
      if (event.code !== 0) return this.unknown();
      if (!['awaiting_ack', 'awaiting_restore_ack'].includes(this.currentStatus)) return this.currentStatus;
      this.acknowledgedAt = context.now;
      this.deadline = context.now + 30000;
      this.currentStatus = restoring ? 'awaiting_restore_configuration' : 'awaiting_configuration';
    } else if (event.kind === 'configuration') {
      if (!['awaiting_configuration', 'awaiting_restore_configuration'].includes(this.currentStatus)) return this.currentStatus;
      if (event.independent !== true || event.reserveEnabled !== true
        || event.source !== 'official_native_selective' || !boundedReference(event.queryId)
        || !Number.isFinite(event.queriedAt) || event.queriedAt < this.acknowledgedAt
        || event.queriedAt < this.dispatchedAt || event.queriedAt > event.receivedAt
        || event.reservePercent !== (restoring ? 50 : 51)
        || event.reservePercent !== context.configuration.reservePercent
        || event.receivedAt !== context.configuration.receivedAt
        || event.receivedAt <= this.dispatchedAt || event.receivedAt < this.acknowledgedAt) return this.unknown();
      this.currentStatus = restoring ? 'restored' : 'observing';
      this.confirmedConfigurationAt = event.receivedAt;
      this.deadline = context.now + 120000;
      if (restoring) this.owner!.complete(this.target!.installationKey, this.claimId);
    } else if (event.kind === 'outcome' && this.currentStatus === 'observing') {
      if (event.independentPhysicalObservation === true && event.source === 'independent_native_policy'
        && event.targetKey === this.target!.targetKey && event.generation === this.target!.generation
        && event.scope === this.target!.scope && boundedReference(event.evidenceRef, 1024)
        && Number.isFinite(event.observedAt) && event.observedAt > this.confirmedConfigurationAt
        && event.observedAt <= context.now && context.now - event.observedAt < 5000) this.currentStatus = 'observed';
    }
    return this.currentStatus;
  }

  prepareRestore(context: ReservePilotContext): { operationId: string; reservePercent: 50 } {
    if (!['observing', 'observed'].includes(this.currentStatus) || this.approval?.restoreApproved !== true
      || !this.current(context) || context.now >= this.deadline
      || context.configuration.reservePercent !== 51) {
      if (!['idle', 'restored'].includes(this.currentStatus)) this.unknown();
      throw new Error('Conditional restoration blocked; manual reconciliation required');
    }
    this.lastNow = context.now;
    this.recordConfiguration(context);
    this.dispatchedAt = context.now;
    this.deadline = context.now + 10000;
    this.phaseTargetReceivedAt = null;
    this.currentStatus = 'awaiting_restore_ack';
    return { operationId: `${this.approval.operationId}:restore`, reservePercent: 50 };
  }
}
