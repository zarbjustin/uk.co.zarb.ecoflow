'use strict';

// OFFLINE ONLY: no transport, credentials, full command envelope or runtime import.
// Wire contract: shuette42/ecoflow-energy-ha, MIT, pinned revision
// 6f3c327fcd3bc2cdd22b7c006bb4d19607ef7e61. Full notice in
// docs/EXPERIMENTAL_STREAM_AC5000.md. Payload reproduction is not actuation proof.
const { fields } = require('./stream5000ContractAudit');

function uint(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('unsigned integer required');
  let n = BigInt(value);
  const bytes = [];
  do {
    let byte = Number(n & 127n);
    n >>= 7n;
    if (n) byte |= 128;
    bytes.push(byte);
  } while (n);
  return Buffer.from(bytes);
}

/** ES22 captured f1=10, f10.2=watts; deliberately no output companions. */
function gridInputPayload(watts) {
  const input = Buffer.concat([uint(16), uint(watts)]);
  return Buffer.concat([uint(8), uint(10), uint(82), uint(input.length), input]);
}

function inspectGridInputWrite(hex) {
  const envelope = fields(Buffer.from(hex, 'hex')).find(f => f.number === 1 && f.wire === 2);
  if (!envelope) throw new RangeError('missing envelope');
  const header = fields(envelope.value);
  const scalar = n => header.find(f => f.number === n && f.wire === 0)?.value;
  if (scalar(8) !== 254 || scalar(9) !== 38) throw new RangeError('not a configuration write');
  const payload = header.find(f => f.number === 1 && f.wire === 2)?.value;
  const body = fields(payload);
  const group = body.find(f => f.number === 10 && f.wire === 2);
  if (body.length !== 2 || body.find(f => f.number === 1)?.value !== 10 || !group) {
    throw new RangeError('not a grid-only payload');
  }
  const values = fields(group.value);
  if (values.length !== 1 || values[0].number !== 2 || values[0].wire !== 0) {
    throw new RangeError('output or unknown companions present');
  }
  return { watts: values[0].value, payloadHex: payload.toString('hex'), sequence: scalar(14) };
}

/** Review ledger, never a command-admission function. All controls remain off. */
function controlReview(model, setting) {
  const reasons = [];
  const captured = model === 'ES22' && setting === 'max_grid_input';
  if (!captured) reasons.push('model_specific_input_contract_not_verified');
  reasons.push('safe_input_ceiling_not_verified', 'zero_and_pv_blocking_not_verified',
    'linked_installation_scope_not_verified', 'physical_response_and_recovery_pending');
  if (setting === 'scheduled_charge') reasons.push('stored_setpoint_can_differ_from_measured_power');
  return {
    offlinePayloadEvidence: captured,
    scope: captured ? 'addressed_device_grid_input_not_total_charge' : 'unverified',
    acknowledgementMeaning: 'receipt_not_application',
    readbackMeaning: 'stored_setting_not_physical_response',
    controlsEnabled: false,
    blockingReasons: reasons,
  };
}

const MAX_RECORDS = 64;
const MAX_AGE_MS = 20 * 60 * 1000;
function sn(value) {
  return typeof value === 'string' && /^[A-Z0-9]{4,64}$/i.test(value) ? value.toUpperCase() : null;
}
function fresh(at, now) {
  return Number.isFinite(at) && at >= 0 && at <= now && now - at <= MAX_AGE_MS;
}

/** Explicit reported system grouping only, never account-list/SOC similarity inference.
 * Internal identities stay inside this test helper; output uses report-local indices.
 * Even a complete reported group is not authority to merge Homey Energy sources.
 */
function topologyReview(records, now) {
  if (!Array.isArray(records) || !Number.isFinite(now) || now < 0) throw new RangeError('invalid evidence');
  const normalized = records.slice(0, MAX_RECORDS).map((r, index) => ({
    index,
    address: sn(r?.addressSn),
    reportedSystem: sn(r?.reportedSystemId),
    members: Array.isArray(r?.memberSns) ? [...new Set(r.memberSns.slice(0, MAX_RECORDS).map(sn).filter(Boolean))].sort() : [],
    fresh: fresh(r?.observedAt, now),
    complete: r?.memberListComplete === true && Array.isArray(r?.memberSns)
      && r.memberSns.length > 0 && r.memberSns.length <= MAX_RECORDS
      && r.memberSns.every(v => sn(v) !== null),
  }));
  const groups = [];
  const handled = new Set();
  for (const a of normalized) {
    if (handled.has(a.index)) continue;
    const matches = a.reportedSystem
      ? normalized.filter(b => b.reportedSystem === a.reportedSystem)
      : [a];
    matches.forEach(b => handled.add(b.index));
    const reasons = [];
    if (!a.reportedSystem) reasons.push('explicit_system_identity_missing');
    if (matches.some(b => !b.fresh)) reasons.push('stale_or_future_evidence');
    if (matches.some(b => !b.complete || !b.address || !b.members.includes(b.address))) reasons.push('membership_incomplete');
    if (matches.some(b => JSON.stringify(b.members) !== JSON.stringify(a.members))) reasons.push('conflicting_member_lists');
    const other = normalized.filter(b => !matches.includes(b));
    if (other.some(b => b.members.some(member => a.members.includes(member)))) reasons.push('cross_system_overlap');
    if (new Set(matches.map(b => b.address)).size !== matches.length) reasons.push('duplicate_address');
    if (records.length > MAX_RECORDS) reasons.push('truncated_evidence');
    groups.push({ recordIndices: matches.map(b => b.index),
      status: reasons.length ? 'needs_evidence' : 'reported_group_for_review',
      reasons, autoMergeAllowed: false, capacitySummationAllowed: false, socAveragingAllowed: false });
  }
  return { groups, autoGroupingEnabled: false, truncated: records.length > MAX_RECORDS };
}

const PRODUCTS = ['expansion_5000', 'expansion_3000', 'stream_3000', 'gateway', 'dual_ct_meter'];
/** Product name/prefix hints are not identity or pairing admission. */
function productReview(product, evidence = {}) {
  if (!PRODUCTS.includes(product)) throw new RangeError('unknown research product');
  const required = ['identityContract', 'maskedCapture', 'fieldAttribution', 'hardwareValidation'];
  if (product.startsWith('expansion_')) required.push('hostInclusion', 'capacityUnits');
  if (product === 'gateway' || product === 'dual_ct_meter') required.push('measurementScope');
  if (product === 'stream_3000') required.push('modelSpecificAdapter', 'energyDirection');
  const missing = required.filter(key => evidence[key] !== true);
  return { product, status: missing.length ? 'evidence_pending' : 'ready_for_manual_admission_review',
    missing, pairingEnabled: false, contributesToEnergy: false };
}

/** Simulation only. Positive battery watts = charging, negative = discharging.
 * Permission is NOT a command and cannot enforce coordination on physical devices.
 * Default SOC hysteresis is a research choice, not manufacturer guidance.
 */
function prioritySimulation(input, previous = {}, options = {}) {
  const config = { startSoc: 98, stopSoc: 97, dwellMs: 60000, cooldownMs: 60000,
    maxAgeMs: 60000, powerDeadbandW: 20, ...options };
  const now = input?.now;
  const blocked = reason => ({ state: 'blocked', reason, candidateSince: null,
    lastTransitionAt: Number.isFinite(now) ? now : null, commandWrites: 0 });
  if (!Number.isFinite(now) || now < 0) return blocked('invalid_clock');
  if (![config.startSoc, config.stopSoc].every(n => Number.isFinite(n) && n >= 0 && n <= 100)
    || config.stopSoc >= config.startSoc
    || !['dwellMs', 'cooldownMs', 'maxAgeMs', 'powerDeadbandW'].every(k => Number.isFinite(config[k]) && config[k] > 0)) {
    return blocked('invalid_policy');
  }
  if (input.manualOverride !== false || input.controllerConflict !== false) return blocked('controller_ownership_unverified');
  for (const key of ['bydSoc', 'bydBatteryW', 'streamBatteryW']) {
    const reading = input[key];
    if (!reading || !Number.isFinite(reading.value) || !Number.isFinite(reading.at)
      || reading.at < 0 || reading.at > now || now - reading.at > config.maxAgeMs) return blocked('missing_or_stale_input');
  }
  if (input.bydSoc.value < 0 || input.bydSoc.value > 100
    || Math.abs(input.bydBatteryW.value) > 100000 || Math.abs(input.streamBatteryW.value) > 100000) return blocked('invalid_reading');
  const byd = input.bydBatteryW.value;
  const stream = input.streamBatteryW.value;
  const d = config.powerDeadbandW;
  if ((byd < -d && stream > d) || (stream < -d && byd > d)) return blocked('opposing_battery_flows');
  if (byd < -d) return blocked('byd_discharging');
  const priorAt = previous.lastTransitionAt;
  if (priorAt !== undefined && priorAt !== null && (!Number.isFinite(priorAt) || priorAt < 0 || priorAt > now)) return blocked('invalid_prior_clock');
  if (previous.state === 'permission_candidate' && input.bydSoc.value > config.stopSoc) {
    return { state: 'permission_candidate', reason: 'review_surplus_before_control',
      candidateSince: null, lastTransitionAt: priorAt ?? now, commandWrites: 0 };
  }
  if (input.bydSoc.value < config.startSoc) return { state: 'waiting', reason: 'byd_priority', candidateSince: null,
    lastTransitionAt: previous.state === 'waiting' ? priorAt ?? now : now, commandWrites: 0 };
  const since = Number.isFinite(previous.candidateSince) && previous.candidateSince >= 0
    && previous.candidateSince <= now && previous.state === 'waiting' ? previous.candidateSince : now;
  const cooldownElapsed = priorAt === undefined || priorAt === null || now - priorAt >= config.cooldownMs;
  const ready = now - since >= config.dwellMs && cooldownElapsed;
  return { state: ready ? 'permission_candidate' : 'waiting', reason: ready ? 'review_surplus_before_control' : 'dwell_or_cooldown',
    candidateSince: since, lastTransitionAt: ready ? now : priorAt ?? now, commandWrites: 0 };
}

module.exports = { gridInputPayload, inspectGridInputWrite, controlReview, topologyReview, productReview, prioritySimulation };
