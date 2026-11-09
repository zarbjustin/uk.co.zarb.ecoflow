'use strict';

import {
  boundedReference,
  PilotApproval,
  ReservePilotContext,
  ReservePilotEvent,
  ReservePilotOperationOwner,
  ReservePilotQualification,
  ReservePilotTarget,
  reservePilotContextQualified,
  snapshotReservePilotQualifications,
  Stream5000ReservePilot,
} from './stream5000ReservePilot';

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

export interface InstallationOperation {
  claimId: number;
  operationId: string;
  target: ReservePilotTarget;
  authorityRevision: number;
  status: 'active' | 'unknown';
}

export interface InstallationOperationJournal {
  version: 1;
  nextClaimId: number;
  operations: readonly Readonly<InstallationOperation>[];
}

/** Cooperative ownership and recovery schema; callers must durably commit before dispatch. */
export class Stream5000InstallationOperationOwner implements ReservePilotOperationOwner {
  private readonly operations = new Map<string, InstallationOperation>();
  private nextClaimId = 0;

  constructor(private readonly maximumInstallations = 64, journal?: unknown) {
    if (!Number.isSafeInteger(maximumInstallations)
      || maximumInstallations < 1 || maximumInstallations > 64) throw new Error('Invalid installation capacity');
    if (journal === undefined) return;
    const saved = object(journal);
    if (!saved || saved.version !== 1 || !Number.isSafeInteger(saved.nextClaimId)
      || Number(saved.nextClaimId) < 0 || !Array.isArray(saved.operations)
      || saved.operations.length > maximumInstallations) throw new Error('Invalid installation journal');
    const claimIds = new Set<number>();
    for (const value of saved.operations) {
      const operation = object(value);
      if (!operation || !Number.isSafeInteger(operation.claimId) || Number(operation.claimId) < 1
        || Number(operation.claimId) > Number(saved.nextClaimId)
        || claimIds.has(Number(operation.claimId))
        || (operation.status !== 'active' && operation.status !== 'unknown')) throw new Error('Invalid installation journal claim');
      this.claim(operation.target as ReservePilotTarget, operation.authorityRevision as number, operation.operationId as string);
      const target = operation.target as ReservePilotTarget;
      const recovered = this.operations.get(target.installationKey)!;
      recovered.claimId = operation.claimId as number;
      recovered.status = 'unknown';
      claimIds.add(recovered.claimId);
    }
    this.nextClaimId = saved.nextClaimId as number;
  }

  claim(target: ReservePilotTarget, authorityRevision: number, operationId: string): number {
    if (!target || !['targetKey', 'installationKey', 'firmware', 'commandTargetSn'].every(
      (key) => boundedReference((target as any)[key]),
    ) || !['STREAM_5000', 'STREAM_5000_AC'].includes(target.model)
      || !['unit', 'system'].includes(target.scope)
      || target.routing !== (target.scope === 'system' ? 'qualified_system_main' : 'qualified_unit')
      || !Number.isSafeInteger(target.generation) || target.generation < 0
      || !Number.isSafeInteger(authorityRevision) || authorityRevision < 0
      || !boundedReference(operationId) || !boundedReference(`${operationId}:restore`)) {
      throw new Error('Invalid installation operation');
    }
    if (this.operations.has(target.installationKey)) throw new Error('Installation operation busy; no queue');
    if ([...this.operations.values()].some((operation) => operation.target.commandTargetSn === target.commandTargetSn)) {
      throw new Error('Conflicting installation mapping for command target');
    }
    if (this.operations.size >= this.maximumInstallations
      || !Number.isSafeInteger(this.nextClaimId + 1)) throw new Error('Installation operation capacity exhausted');
    this.nextClaimId += 1;
    this.operations.set(target.installationKey, {
      claimId: this.nextClaimId,
      operationId,
      target: {
        targetKey: target.targetKey,
        installationKey: target.installationKey,
        model: target.model,
        firmware: target.firmware,
        scope: target.scope,
        routing: target.routing,
        commandTargetSn: target.commandTargetSn,
        generation: target.generation,
      },
      authorityRevision,
      status: 'active',
    });
    return this.nextClaimId;
  }

  owns(installationKey: string, claimId: number): boolean {
    const operation = this.operations.get(installationKey);
    return operation?.claimId === claimId && operation.status === 'active';
  }

  markUnknown(installationKey: string, claimId: number): void {
    const operation = this.operations.get(installationKey);
    if (operation?.claimId === claimId) operation.status = 'unknown';
  }

  complete(installationKey: string, claimId: number): void {
    if (this.owns(installationKey, claimId)) this.operations.delete(installationKey);
  }

  snapshot(installationKey: string): Readonly<InstallationOperation> | null {
    const operation = this.operations.get(installationKey);
    return operation ? Object.freeze({ ...operation, target: Object.freeze({ ...operation.target }) }) : null;
  }

  journal(): Readonly<InstallationOperationJournal> {
    return Object.freeze({
      version: 1,
      nextClaimId: this.nextClaimId,
      operations: Object.freeze([...this.operations.keys()].map((key) => this.snapshot(key)!)),
    });
  }

  reconcileUnknown(
    installationKey: string, claimId: number, approval: { manuallyApproved: boolean; evidenceRef: string },
  ): void {
    const operation = this.operations.get(installationKey);
    if (!operation || operation.claimId !== claimId || operation.status !== 'unknown'
      || approval?.manuallyApproved !== true || !boundedReference(approval.evidenceRef, 1024)) {
      throw new Error('Explicit manual reconciliation required');
    }
    this.operations.delete(installationKey);
  }
}

export interface ReservePercentageCommands {
  set: {
    sn: string;
    cmdId: 38;
    cmdFunc: 254;
    dirSrc: 1;
    dirDest: 1;
    dest: 2;
    needAck: true;
    params: { bpBackupConfig: { backupSoc: number } };
  };
  get: { sn: string; params: { quotas: ['bpBackupConfig-backupSocOnOff', 'bpBackupConfig-backupSoc'] } };
}

/** Syntax only: PUT set / POST selective read; no authentication wrapper or physical outcome. */
export function encodeStream5000ReservePercentage(
  context: ReservePilotContext,
  reservePercent: number,
  qualifications: readonly ReservePilotQualification[] = [],
): ReservePercentageCommands {
  const registry = snapshotReservePilotQualifications(qualifications);
  if (!reservePilotContextQualified(context, registry)
    || !Number.isInteger(reservePercent) || reservePercent < 0 || reservePercent > 100) {
    throw new Error('Reserve configuration encoding blocked');
  }
  return {
    set: {
      sn: context.target.commandTargetSn,
      cmdId: 38,
      cmdFunc: 254,
      dirSrc: 1,
      dirDest: 1,
      dest: 2,
      needAck: true,
      params: { bpBackupConfig: { backupSoc: reservePercent } },
    },
    get: {
      sn: context.target.commandTargetSn,
      params: { quotas: ['bpBackupConfig-backupSocOnOff', 'bpBackupConfig-backupSoc'] },
    },
  };
}

type ReserveAck = Extract<ReservePilotEvent, { kind: 'ack' }>;
type ReserveConfigurationEvent = Extract<ReservePilotEvent, { kind: 'configuration' }>;

/** HTTP association is caller-supplied; MQTT id equality is exact. Neither proves application. */
export function normalizeStream5000ReserveAck(
  operationId: string,
  response: { transport: 'http'; body: unknown }
    | { transport: 'mqtt'; replyId: string | number; body: unknown },
): ReserveAck | null {
  if (!boundedReference(operationId)) throw new Error('Invalid operation reference');
  const body = object(response?.body);
  if (response?.transport === 'http') {
    return { kind: 'ack', operationId, code: body?.code === '0' ? 0 : 1 };
  }
  if (response?.transport !== 'mqtt'
    || !(boundedReference(response.replyId)
      || (Number.isSafeInteger(response.replyId) && Number(response.replyId) >= 0))
    || !body || body.id !== response.replyId) return null;
  return { kind: 'ack', operationId, code: object(body.data)?.cmdOk === true ? 0 : 1 };
}

export interface ReserveSelectiveQuery {
  operationId: string;
  queryId: string;
  requestedAt: number;
}

export interface ReserveSelectiveObservation {
  queryId: string;
  receivedAt: number;
  source: 'official_native_selective';
  independent: boolean;
  target: ReservePilotTarget;
  authorityRevision: number;
  body: unknown;
}

/** Validates asserted selective-query provenance; no device revision means no writer causality proof. */
export function normalizeStream5000ReserveConfiguration(
  context: ReservePilotContext, query: ReserveSelectiveQuery, observation: ReserveSelectiveObservation,
): ReserveConfigurationEvent | null {
  if (!context?.target || !context.configuration || !context.authority || !query || !observation) return null;
  const body = object(observation.body);
  const data = object(body?.data);
  if (!boundedReference(query.operationId) || !boundedReference(query.queryId)
    || observation.queryId !== query.queryId || observation.source !== 'official_native_selective'
    || observation.independent !== true || !observation.target
    || !['targetKey', 'installationKey', 'model', 'firmware', 'scope', 'generation', 'routing', 'commandTargetSn'].every(
      (key) => (observation.target as any)[key] === (context.target as any)[key],
    ) || observation.authorityRevision !== context.authority.revision
    || body?.code !== '0'
    || context.configuration.source !== 'official_native'
    || context.configuration.generation !== context.target.generation
    || context.configuration.commandTargetSn !== context.target.commandTargetSn
    || !Number.isFinite(query.requestedAt) || query.requestedAt < 0
    || !Number.isFinite(observation.receivedAt) || observation.receivedAt < query.requestedAt
    || !Number.isFinite(context.now) || context.now < observation.receivedAt
    || context.now - observation.receivedAt >= 5000
    || observation.receivedAt !== context.configuration.receivedAt
    || typeof data?.['bpBackupConfig-backupSocOnOff'] !== 'boolean'
    || !Number.isInteger(data['bpBackupConfig-backupSoc'])
    || Number(data['bpBackupConfig-backupSoc']) < 0 || Number(data['bpBackupConfig-backupSoc']) > 100
    || data['bpBackupConfig-backupSocOnOff'] !== context.configuration.reserveEnabled
    || data['bpBackupConfig-backupSoc'] !== context.configuration.reservePercent) return null;
  return {
    kind: 'configuration',
    operationId: query.operationId,
    queryId: query.queryId,
    queriedAt: query.requestedAt,
    receivedAt: observation.receivedAt,
    independent: true,
    source: 'official_native_selective',
    reserveEnabled: data['bpBackupConfig-backupSocOnOff'] as boolean,
    reservePercent: data['bpBackupConfig-backupSoc'] as number,
  };
}

/** Explicit shared owner required; all phases reuse the existing bounded reserve pilot. */
export class Stream5000ReserveControlContract {
  private readonly pilot: Stream5000ReservePilot;
  private readonly qualifications: readonly ReservePilotQualification[];

  constructor(owner: Stream5000InstallationOperationOwner, qualifications: readonly ReservePilotQualification[] = []) {
    if (!(owner instanceof Stream5000InstallationOperationOwner)) throw new Error('Shared installation owner required');
    this.qualifications = snapshotReservePilotQualifications(qualifications);
    this.pilot = new Stream5000ReservePilot(this.qualifications, owner);
  }

  get status() {
    return this.pilot.status;
  }

  begin(context: ReservePilotContext, approval: PilotApproval): { operationId: string; commands: ReservePercentageCommands } {
    const commands = encodeStream5000ReservePercentage(context, 51, this.qualifications);
    const intent = this.pilot.begin(context, approval);
    return { operationId: intent.operationId, commands };
  }

  step(context: ReservePilotContext, event: ReservePilotEvent) {
    return this.pilot.step(context, event);
  }

  prepareRestore(context: ReservePilotContext): { operationId: string; commands: ReservePercentageCommands } {
    const intent = this.pilot.prepareRestore(context);
    return {
      operationId: intent.operationId,
      commands: encodeStream5000ReservePercentage(context, 50, this.qualifications),
    };
  }
}
