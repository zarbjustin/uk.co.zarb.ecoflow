'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Stream5000ReservePilot } = require('../.homeybuild/lib/stream5000ReservePilot');
const {
  Stream5000InstallationOperationOwner: Owner,
  Stream5000ReserveControlContract: Contract,
  encodeStream5000ReservePercentage: encode,
  normalizeStream5000ReserveAck: ack,
  normalizeStream5000ReserveConfiguration: configuration,
} = require('../.homeybuild/lib/stream5000ControlContract');

function fixture(changes = {}, owner = new Owner()) {
  const target = {
    targetKey: 'synthetic-unit', installationKey: 'synthetic-installation',
    model: 'STREAM_5000_AC', firmware: 'synthetic-unqualified-hardware',
    scope: 'unit', routing: 'qualified_unit', commandTargetSn: 'ES22SYNTHETICUNIT',
    generation: 1, ...changes,
  };
  const qualification = {
    ...target, action: 'backup_reserve_percent', source: 'official_native',
    evidenceRef: 'synthetic-offline-only-action-evidence',
    routingEvidenceRef: 'synthetic-only-not-unit-scope-or-main-device-proof',
  };
  const context = (now = 1000, reservePercent = 50) => ({
    now, target: { ...target },
    authority: { revision: 1, exclusive: true, nativeAiCoordinated: true },
    configuration: {
      source: 'official_native', generation: target.generation, commandTargetSn: target.commandTargetSn,
      receivedAt: now, reserveEnabled: true, reservePercent, companionSnapshotId: 'synthetic-companions',
    },
  });
  const approval = {
    operationId: `operation-${target.targetKey}`, forwardApproved: true, restoreApproved: true, reservePercent: 51,
  };
  const controller = new Contract(owner, [qualification]);
  const query = (at, operationId = approval.operationId) => ({
    operationId, queryId: `synthetic-query-${at}`, requestedAt: at,
  });
  const observation = (at, reservePercent = 51) => ({
    queryId: `synthetic-query-${at}`, receivedAt: at, source: 'official_native_selective', independent: true,
    target: { ...target }, authorityRevision: 1,
    body: { code: '0', data: { 'bpBackupConfig-backupSocOnOff': true, 'bpBackupConfig-backupSoc': reservePercent } },
  });
  const confirm = (at, reservePercent = 51, operationId = approval.operationId) =>
    configuration(context(at, reservePercent), query(at, operationId), observation(at, reservePercent));
  return { owner, target, qualification, context, approval, controller, query, observation, confirm };
}

test('default-empty action registry and absent shared owner never admit operational plans', () => {
  const f = fixture();
  assert.throws(() => encode(f.context(), 51), /blocked/);
  assert.throws(() => new Contract(f.owner).begin(f.context(), f.approval), /blocked/);
  assert.throws(() => new Contract(undefined, [f.qualification]), /owner required/);
  assert.throws(() => new Stream5000ReservePilot([f.qualification]).begin(f.context(), f.approval), /blocked/);
});

test('reserve-only golden body uses documented routing, exact BKW3 envelope and both selective fields', () => {
  const f = fixture();
  for (const value of [0, 100]) {
    assert.deepEqual(encode(f.context(), value, [f.qualification]), {
      set: {
        sn: f.target.commandTargetSn, cmdId: 38, cmdFunc: 254, dirSrc: 1, dirDest: 1, dest: 2, needAck: true,
        params: { bpBackupConfig: { backupSoc: value } },
      },
      get: {
        sn: f.target.commandTargetSn,
        params: { quotas: ['bpBackupConfig-backupSocOnOff', 'bpBackupConfig-backupSoc'] },
      },
    });
  }
  for (const value of [-1, 101, 50.1, '51', true, NaN, Infinity]) {
    assert.throws(() => encode(f.context(), value, [f.qualification]), /blocked/);
  }
  for (const enabled of [false, undefined, 1, 'true']) {
    const ctx = f.context(); ctx.configuration.reserveEnabled = enabled;
    assert.throws(() => encode(ctx, 51, [f.qualification]), /blocked/);
  }
});

test('action/source/firmware/scope/routing qualifications are exact immutable snapshots', () => {
  for (const key of ['action', 'source', 'routingEvidenceRef']) {
    const f = fixture(); f.qualification[key] = key === 'routingEvidenceRef' ? ' ' : 'different-action-or-source';
    assert.throws(() => new Contract(f.owner, [f.qualification]), /Invalid native qualification/);
  }
  for (const key of ['firmware', 'model', 'targetKey', 'installationKey', 'scope', 'routing', 'commandTargetSn']) {
    const f = fixture(); const ctx = f.context(); ctx.target[key] = 'unqualified-alias';
    assert.throws(() => f.controller.begin(ctx, f.approval), /blocked/);
  }
  const f = fixture(); const records = [f.qualification]; const controller = new Contract(f.owner, records);
  records[0].commandTargetSn = 'ES22OTHERALIAS'; records[0].action = 'work_mode'; records.length = 0;
  assert.equal(controller.begin(f.context(), f.approval).commands.set.sn, f.target.commandTargetSn);
  const empty = []; const disabled = new Contract(new Owner(), empty); empty.push(f.qualification);
  assert.throws(() => disabled.begin(f.context(), f.approval), /blocked/);
});

test('system reserve requires an exact independently qualified main route, never a paired-unit alias', () => {
  const f = fixture({
    targetKey: 'synthetic-system', scope: 'system', routing: 'qualified_system_main',
    commandTargetSn: 'ES21SYNTHETICMAIN',
  });
  assert.equal(f.controller.begin(f.context(), f.approval).commands.set.sn, 'ES21SYNTHETICMAIN');
  const alias = f.context(); alias.target.commandTargetSn = 'ES21SYNTHETICPAIRED';
  alias.configuration.commandTargetSn = alias.target.commandTargetSn;
  assert.throws(() => encode(alias, 51, [f.qualification]), /blocked/);
  const wrongReceipt = f.context(); wrongReceipt.configuration.commandTargetSn = 'ES21SYNTHETICPAIRED';
  assert.throws(() => encode(wrongReceipt, 51, [f.qualification]), /blocked/);
  assert.throws(() => fixture({ scope: 'system', routing: 'qualified_unit' }), /Invalid native qualification/);
});

test('operational admission remains only explicitly approved 50 to 51, not generic percentage syntax', () => {
  const f = fixture();
  assert.throws(() => f.controller.begin(f.context(1000, 49), f.approval), /blocked/);
  assert.throws(() => f.controller.begin(f.context(), { ...f.approval, reservePercent: 52 }), /blocked/);
  assert.throws(() => f.controller.begin(f.context(), { ...f.approval, forwardApproved: false }), /blocked/);
  assert.equal(f.controller.begin(f.context(), f.approval).commands.set.params.bpBackupConfig.backupSoc, 51);
  assert.throws(() => f.controller.begin(f.context(), f.approval), /already used/);
});

test('shared owner serializes paired-unit and raw-pilot aliases while different installations proceed', () => {
  const first = fixture(); first.controller.begin(first.context(), first.approval);
  const second = fixture({ targetKey: 'synthetic-second-unit', commandTargetSn: 'ES22SYNTHETICSECOND' }, first.owner);
  assert.throws(() => second.controller.begin(second.context(), second.approval), /Installation operation busy/);
  assert.throws(() => new Stream5000ReservePilot([second.qualification], first.owner)
    .begin(second.context(), second.approval), /Installation operation busy/);
  const other = fixture({
    installationKey: 'synthetic-other-installation', commandTargetSn: 'ES22SYNTHETICOTHERINSTALLATION',
  }, first.owner);
  assert.equal(other.controller.begin(other.context(), other.approval).commands.set.params.bpBackupConfig.backupSoc, 51);
});

test('uncertain operations retain bounded ownership until explicit claim-specific manual reconciliation', () => {
  const f = fixture(); f.controller.begin(f.context(), f.approval);
  assert.equal(f.controller.step(f.context(11000), { kind: 'tick' }), 'unknown');
  const held = f.owner.snapshot(f.target.installationKey);
  assert.equal(held.status, 'unknown');
  assert.throws(() => { held.target.commandTargetSn = 'tampered'; }, TypeError);
  const next = fixture({}, f.owner);
  assert.throws(() => next.controller.begin(next.context(11001), next.approval), /busy/);
  f.owner.complete(f.target.installationKey, held.claimId);
  assert.throws(() => next.controller.begin(next.context(11002), next.approval), /busy/);
  for (const approval of [{ manuallyApproved: false, evidenceRef: 'manual' },
    { manuallyApproved: true, evidenceRef: ' ' }]) {
    assert.throws(() => f.owner.reconcileUnknown(f.target.installationKey, held.claimId, approval), /reconciliation/);
  }
  assert.throws(() => f.owner.reconcileUnknown(f.target.installationKey, held.claimId + 1,
    { manuallyApproved: true, evidenceRef: 'synthetic-manual' }), /reconciliation/);
  f.owner.reconcileUnknown(f.target.installationKey, held.claimId,
    { manuallyApproved: true, evidenceRef: 'synthetic-manual-resolution-not-device-proof' });
  next.controller.begin(next.context(11003), next.approval);
  assert.equal(f.controller.step(f.context(11004, 51), ack(f.approval.operationId,
    { transport: 'http', body: { code: '0' } })), 'unknown');
  assert.equal(f.owner.snapshot(f.target.installationKey).status, 'active', 'late old callbacks cannot revoke the new claim');
  f.owner.markUnknown(f.target.installationKey, held.claimId);
  assert.equal(f.owner.snapshot(f.target.installationKey).status, 'active');
});

test('ownership capacity rejects without queue growth, and active claims cannot be manually reconciled', () => {
  const owner = new Owner(1); const f = fixture({}, owner);
  f.controller.begin(f.context(), f.approval);
  const other = fixture({
    installationKey: 'synthetic-other-installation', commandTargetSn: 'ES22SYNTHETICOTHERINSTALLATION',
  }, owner);
  assert.throws(() => other.controller.begin(other.context(), other.approval), /capacity exhausted/);
  assert.equal(owner.snapshot(other.target.installationKey), null);
  const held = owner.snapshot(f.target.installationKey);
  assert.throws(() => owner.reconcileUnknown(f.target.installationKey, held.claimId,
    { manuallyApproved: true, evidenceRef: 'synthetic-manual' }), /reconciliation/);
  for (const capacity of [0, 65, 1.5, NaN]) assert.throws(() => new Owner(capacity), /Invalid installation capacity/);
});

test('ACK normalization distinguishes exact HTTP string status and MQTT reply id/boolean status', () => {
  assert.equal(ack('op', { transport: 'http', body: { code: '0' } }).code, 0);
  for (const body of [null, [], {}, { code: 0 }, { code: '1' }, { code: true }, { code: '00' }]) {
    assert.equal(ack('op', { transport: 'http', body }).code, 1);
  }
  assert.equal(ack('op', { transport: 'mqtt', replyId: 123, body: { id: 123, data: { cmdOk: true } } }).code, 0);
  assert.equal(ack('op', { transport: 'mqtt', replyId: '123', body: { id: '123', data: { cmdOk: true } } }).code, 0);
  for (const cmdOk of [false, 1, 'true', undefined]) {
    assert.equal(ack('op', { transport: 'mqtt', replyId: 123, body: { id: 123, data: { cmdOk } } }).code, 1);
  }
  for (const body of [{ id: '123', data: { cmdOk: true } }, { id: 124, data: { cmdOk: true } }, {}]) {
    assert.equal(ack('op', { transport: 'mqtt', replyId: 123, body }), null);
  }
  assert.equal(ack('op', { transport: 'mqtt', replyId: ' ', body: { id: ' ', data: { cmdOk: true } } }), null);
  assert.throws(() => ack(' ', { transport: 'http', body: { code: '0' } }), /reference/);
});

test('restart recovers active and uncertain persisted claims as held unknown without replay or alias admission', () => {
  for (const status of ['active', 'unknown']) {
    const f = fixture(); f.controller.begin(f.context(), f.approval);
    const held = f.owner.snapshot(f.target.installationKey);
    const saved = { version: 1, nextClaimId: held.claimId, operations: [{ ...held, status }] };
    const recovered = new Owner(64, saved);
    saved.operations[0].target = { ...held.target, commandTargetSn: 'ES22TAMPERED' };
    saved.operations.length = 0;
    assert.equal(recovered.snapshot(f.target.installationKey).status, 'unknown');
    assert.equal(recovered.snapshot(f.target.installationKey).target.commandTargetSn, f.target.commandTargetSn);
    recovered.complete(f.target.installationKey, held.claimId);
    const alias = fixture({ targetKey: 'synthetic-alias' }, recovered);
    assert.throws(() => alias.controller.begin(alias.context(), alias.approval), /busy/);
  }
});

test('recovery keeps claim numbering monotonic and stale completion cannot release a successor', () => {
  const f = fixture(); f.controller.begin(f.context(), f.approval);
  const held = f.owner.snapshot(f.target.installationKey);
  const recovered = new Owner(64, {
    version: 1, nextClaimId: 27, operations: [{ ...held, claimId: 27 }],
  });
  recovered.reconcileUnknown(f.target.installationKey, 27,
    { manuallyApproved: true, evidenceRef: 'synthetic-manual-not-native-qualification' });
  const next = fixture({}, recovered); next.controller.begin(next.context(), next.approval);
  assert.equal(recovered.snapshot(f.target.installationKey).claimId, 28);
  recovered.markUnknown(f.target.installationKey, 27);
  recovered.complete(f.target.installationKey, 27);
  assert.equal(recovered.snapshot(f.target.installationKey).status, 'active');
});

test('journal recovery refuses malformed, conflicting or over-capacity records rather than treating them as empty', () => {
  const f = fixture(); f.controller.begin(f.context(), f.approval);
  const held = f.owner.snapshot(f.target.installationKey);
  const seed = () => ({ version: 1, nextClaimId: 1, operations: [{ ...held, target: { ...held.target } }] });
  for (const change of [
    (j) => { j.version = 2; }, (j) => { j.nextClaimId = 0; },
    (j) => { j.operations[0].claimId = -1; }, (j) => { j.operations[0].status = 'completed'; },
    (j) => { j.operations[0].target.generation = NaN; }, (j) => { j.operations[0].target.routing = 'qualified_system_main'; },
    (j) => { j.operations[0].operationId = ' '.repeat(1024); },
    (j) => { j.operations.push({ ...j.operations[0] }); },
  ]) {
    const saved = seed(); change(saved);
    assert.throws(() => new Owner(64, saved), /Invalid|busy|Conflicting/);
  }
  for (const saved of [null, [], {}, { version: 1, nextClaimId: 0, operations: null }]) {
    assert.throws(() => new Owner(64, saved), /Invalid/);
  }
  const oversized = seed(); oversized.operations.push({ ...held, claimId: 2 });
  oversized.nextClaimId = 2;
  assert.throws(() => new Owner(1, oversized), /Invalid/);
});

test('the same command target cannot evade serialization by claiming a different installation identity', () => {
  const f = fixture(); f.controller.begin(f.context(), f.approval);
  const alias = fixture({ installationKey: 'synthetic-conflicting-installation' }, f.owner);
  assert.throws(() => alias.controller.begin(alias.context(), alias.approval), /Conflicting installation mapping/);
  const held = f.owner.snapshot(f.target.installationKey);
  assert.throws(() => new Owner(64, {
    version: 1, nextClaimId: 2, operations: [
      held, { ...held, claimId: 2, target: { ...held.target, installationKey: 'synthetic-conflicting-installation' } },
    ],
  }), /Conflicting installation mapping/);
});

test('selective native readback requires exact query/route/source/freshness and both typed configuration fields', () => {
  const f = fixture();
  assert.equal(f.confirm(1002).independent, true);
  for (const change of ['query', 'source', 'independent', 'target', 'routing', 'generation', 'authority',
    'code', 'partial', 'boolean', 'percent', 'value', 'old', 'future', 'stale', 'request', 'receipt-source']) {
    const ctx = f.context(1002, 51); const q = f.query(1002); const o = f.observation(1002);
    if (change === 'query') o.queryId = 'foreign';
    else if (change === 'source') o.source = 'captured_app_protocol';
    else if (change === 'independent') o.independent = false;
    else if (change === 'target') o.target.targetKey = 'foreign';
    else if (change === 'routing') o.target.commandTargetSn = 'ES22FOREIGNALIAS';
    else if (change === 'generation') o.target.generation++;
    else if (change === 'authority') o.authorityRevision++;
    else if (change === 'code') o.body.code = 0;
    else if (change === 'partial') delete o.body.data['bpBackupConfig-backupSocOnOff'];
    else if (change === 'boolean') o.body.data['bpBackupConfig-backupSocOnOff'] = 1;
    else if (change === 'percent') o.body.data['bpBackupConfig-backupSoc'] = 51.5;
    else if (change === 'value') o.body.data['bpBackupConfig-backupSoc'] = 50;
    else if (change === 'old') o.receivedAt = 1001;
    else if (change === 'future') o.receivedAt = ctx.configuration.receivedAt = 1003;
    else if (change === 'stale') ctx.now = 6002;
    else if (change === 'request') q.requestedAt = 1003;
    else ctx.configuration.source = 'cloud_latest';
    assert.equal(configuration(ctx, q, o), null, change);
  }
});

test('ACK and accepted configuration do not claim a physical effect, and restoration retains the same claim', () => {
  const f = fixture(); const plan = f.controller.begin(f.context(), f.approval);
  const held = f.owner.snapshot(f.target.installationKey);
  assert.equal(f.controller.step(f.context(1001), ack(plan.operationId,
    { transport: 'http', body: { code: '0' } })), 'awaiting_configuration');
  assert.equal(f.controller.step(f.context(1002, 51), f.confirm(1002)), 'observing');
  assert.equal(f.controller.status, 'observing');
  const restore = f.controller.prepareRestore(f.context(1003, 51));
  assert.equal(restore.operationId, `${plan.operationId}:restore`);
  assert.equal(restore.commands.set.params.bpBackupConfig.backupSoc, 50);
  assert.equal(f.owner.snapshot(f.target.installationKey).claimId, held.claimId);
  const other = fixture({ targetKey: 'synthetic-other-unit' }, f.owner);
  assert.throws(() => other.controller.begin(other.context(1004), other.approval), /busy/);
  f.controller.step(f.context(1004, 51), ack(restore.operationId,
    { transport: 'mqtt', replyId: 123, body: { id: 123, data: { cmdOk: true } } }));
  assert.equal(f.controller.step(f.context(1005, 50), f.confirm(1005, 50, restore.operationId)), 'restored');
  assert.equal(f.owner.snapshot(f.target.installationKey), null);
  assert.equal(other.controller.begin(other.context(1006), other.approval).commands.set.params.bpBackupConfig.backupSoc, 51);
});

test('pre-ACK selective query and authority/generation/companion changes cannot advance or release ownership', () => {
  const stale = fixture(); stale.controller.begin(stale.context(), stale.approval);
  stale.controller.step(stale.context(1002), ack(stale.approval.operationId,
    { transport: 'http', body: { code: '0' } }));
  const event = stale.confirm(1003); event.queriedAt = 1001;
  assert.equal(stale.controller.step(stale.context(1003, 51), event), 'unknown');
  for (const change of ['authority', 'generation', 'companions', 'withdrawal']) {
    const f = fixture(); f.controller.begin(f.context(), f.approval);
    const ctx = f.context(1001);
    if (change === 'authority') ctx.authority.revision++;
    else if (change === 'generation') { ctx.target.generation++; ctx.configuration.generation++; }
    else if (change === 'companions') ctx.configuration.companionSnapshotId = 'new';
    else ctx.authority.nativeAiCoordinated = false;
    assert.equal(f.controller.step(ctx, { kind: 'tick' }), 'unknown');
    assert.equal(f.owner.snapshot(f.target.installationKey).status, 'unknown');
    assert.throws(() => f.controller.prepareRestore(f.context(1002, 51)), /blocked/);
  }
});
