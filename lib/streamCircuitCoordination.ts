/** Stateless, caller-supplied rehearsal only. No device lookup, storage, transport or control. */
import { createHash } from 'crypto';
import { streamCircuitMeaning, streamCircuitRole } from './streamCircuitRoles';

const object = (value: any): boolean => !!value && typeof value === 'object' && !Array.isArray(value);
const key = (value: any): boolean => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

export function streamCircuitCoordination(input: any, previous: any = {}, options: any = {}): Record<string, unknown> {
  const config = {
    startSoc: 98,
    stopSoc: 97,
    dwellMs: 60000,
    cooldownMs: 60000,
    maxAgeMs: 60000,
    maxSkewMs: 5000,
    powerDeadbandW: 20,
    minSurplusW: 100,
  };
  const now = input?.now;
  const result = (state: string, reason: string, extra: Record<string, unknown> = {}) => ({
    schemaVersion: 2,
    advisoryOnly: true,
    controlsEnabled: false,
    commandWrites: 0,
    contributesToEnergy: false,
    solarOriginVerified: false,
    sourceBasis: 'caller_asserted',
    state,
    reason,
    candidateSince: null,
    lastTransitionAt: Number.isFinite(now) && now >= 0 ? now : null,
    lastEvaluatedAt: Number.isFinite(now) && now >= 0 ? now : null,
    contextFingerprint: null,
    surplusAssessed: false,
    ...extra,
  });
  if (input?.schemaVersion !== undefined && input.schemaVersion !== 2) return result('blocked', 'unsupported_schema');
  if (!Number.isFinite(now) || now < 0) return result('blocked', 'invalid_clock');
  if (!object(options)) return result('blocked', 'invalid_policy');
  for (const name of Object.keys(config) as Array<keyof typeof config>) {
    if (options[name] !== undefined) config[name] = options[name];
  }
  if (![config.startSoc, config.stopSoc].every((n) => Number.isFinite(n) && n >= 0 && n <= 100)
    || config.stopSoc >= config.startSoc
    || ![config.dwellMs, config.cooldownMs, config.maxAgeMs].every((n) => Number.isFinite(n) && n >= 1000 && n <= 86400000)
    || !Number.isFinite(config.maxSkewMs) || config.maxSkewMs < 0 || config.maxSkewMs > config.maxAgeMs
    || !Number.isFinite(config.powerDeadbandW) || config.powerDeadbandW <= 0 || config.powerDeadbandW > 10000
    || !Number.isFinite(config.minSurplusW) || config.minSurplusW <= config.powerDeadbandW || config.minSurplusW > 100000) {
    return result('blocked', 'invalid_policy');
  }
  if (input.manualOverride !== false || input.controllerConflict !== false) return result('blocked', 'controller_ownership_unverified');
  if (input.otherSourcesReviewed !== true) return result('blocked', 'other_sources_unreviewed');
  const { circuits } = input;
  const external = input.externalBattery;
  const stream = input.streamBattery;
  if (!object(circuits) || !object(circuits.grid) || !object(external) || !object(stream)) return result('blocked', 'missing_sources');
  const { grid } = circuits;
  const { secondary } = circuits;
  if (streamCircuitRole(grid.role) !== 'grid' || grid.scope !== 'whole_installation'
    || !['import', 'export'].includes(grid.positiveMeans)) return result('blocked', 'grid_scope_or_direction_unconfirmed');
  if (secondary !== undefined && (!object(secondary) || !['hybrid_inverter', 'solar_inverter', 'load'].includes(streamCircuitRole(secondary.role))
    || secondary.scope !== 'branch' || !['to_house', 'from_house'].includes(secondary.positiveMeans))) {
    return result('blocked', 'secondary_scope_or_direction_unconfirmed');
  }
  const sources = [grid, external, stream, ...(secondary === undefined ? [] : [secondary])];
  if (sources.some((row) => !key(row.sourceKey) || !key(row.sessionKey) || !key(row.siteKey))) return result('blocked', 'source_identity_required');
  if (new Set(sources.map((row) => row.siteKey)).size !== 1) return result('blocked', 'different_installations');
  if (new Set(sources.map((row) => row.sourceKey)).size !== sources.length) return result('blocked', 'overlapping_source_aliases');
  const readings = [grid.powerW, external.soc, external.powerW, stream.powerW, ...(secondary === undefined ? [] : [secondary.powerW])];
  if (readings.some((row) => !object(row) || !Number.isFinite(row.value) || !Number.isFinite(row.at)
    || row.at < 0 || row.at > now || now - row.at >= config.maxAgeMs)) return result('blocked', 'missing_or_stale_input');
  if (Math.max(...readings.map((row) => row.at)) - Math.min(...readings.map((row) => row.at)) > config.maxSkewMs) {
    return result('blocked', 'incoherent_reading_times');
  }
  if (external.soc.value < 0 || external.soc.value > 100
    || readings.filter((row) => row !== external.soc).some((row) => Math.abs(row.value) > 100000)) return result('blocked', 'invalid_reading');
  const fingerprint = createHash('sha256').update(JSON.stringify({
    sources: sources.map((row) => [row.sourceKey, row.sessionKey, row.siteKey]),
    gridDirection: grid.positiveMeans,
    secondaryRole: streamCircuitRole(secondary?.role),
    secondaryDirection: secondary?.positiveMeans ?? null,
    config,
  })).digest('hex');
  const context = {
    contextFingerprint: fingerprint,
    circuitRoles: { grid: streamCircuitMeaning('grid'), secondary: streamCircuitMeaning(secondary?.role) },
    // Grid already includes branch flows. Never add/subtract CT2 or STREAM battery watts.
    secondaryIncludedInGrid: secondary !== undefined,
    powerObservationTimes: [grid.powerW.at, external.powerW.at, stream.powerW.at],
  };
  const respond = (state: string, reason: string, extra: Record<string, unknown> = {}) => result(state, reason, { ...context, ...extra });
  const externalW = external.powerW.value;
  const streamW = stream.powerW.value;
  const deadband = config.powerDeadbandW;
  if ((externalW < -deadband && streamW > deadband) || (streamW < -deadband && externalW > deadband)) {
    return respond('blocked', 'opposing_battery_flows');
  }
  if (externalW < -deadband) return respond('blocked', 'external_battery_discharging');
  if (streamW < -deadband) return respond('blocked', 'stream_discharging');
  if (!object(previous)) return respond('blocked', 'invalid_prior_state');
  const priorAt = previous.lastEvaluatedAt;
  if (previous.schemaVersion === 2 && (!Number.isFinite(priorAt) || priorAt < 0 || priorAt > now)) {
    return respond('blocked', 'invalid_prior_clock');
  }
  if (previous.schemaVersion === 2 && (!Number.isFinite(previous.lastTransitionAt)
    || previous.lastTransitionAt < 0 || previous.lastTransitionAt > priorAt)) return respond('blocked', 'invalid_prior_clock');
  const sameContext = previous.schemaVersion === 2 && previous.contextFingerprint === fingerprint;
  const continuous = sameContext && now - priorAt < config.maxAgeMs;
  const priorState = continuous ? previous.state : null;
  const socFloor = priorState === 'review_candidate' ? config.stopSoc : config.startSoc;
  if (external.soc.value < socFloor || (priorState === 'review_candidate' && external.soc.value === config.stopSoc)) {
    return respond('waiting', 'external_battery_priority');
  }
  if (externalW > deadband) return respond('waiting', 'external_battery_still_charging');
  const importW = grid.powerW.value * (grid.positiveMeans === 'import' ? 1 : -1);
  if (importW > deadband) return respond('waiting', 'grid_import_present', { surplusAssessed: true });
  if (-importW < config.minSurplusW) return respond('waiting', 'insufficient_observed_export', { surplusAssessed: true });
  if (continuous && (!Array.isArray(previous.powerObservationTimes) || previous.powerObservationTimes.length !== 3
    || previous.powerObservationTimes.some((at: any) => !Number.isFinite(at) || at < 0 || at > priorAt))) return respond('blocked', 'invalid_prior_observations');
  if (continuous && context.powerObservationTimes.some((at, i) => at <= previous.powerObservationTimes[i])) {
    return respond('waiting', 'unadvanced_power_readings');
  }
  // Only matched, recent calls with qualified surplus can maintain a dwell; replay cannot extend it.
  const priorSince = previous.candidateSince;
  const validDwell = continuous && priorState === 'waiting' && previous.reason === 'surplus_dwell_or_cooldown'
    && Number.isFinite(priorSince) && priorSince >= 0 && priorSince <= priorAt;
  const since = validDwell ? priorSince : now;
  const transition = continuous && Number.isFinite(previous.lastTransitionAt) && previous.lastTransitionAt >= 0
    && previous.lastTransitionAt <= priorAt ? previous.lastTransitionAt : now;
  if (continuous && now === priorAt) return respond('waiting', 'duplicate_evaluation');
  if (priorState === 'review_candidate') {
    return respond('review_candidate', 'observed_surplus_for_review', {
      surplusAssessed: true, lastTransitionAt: transition,
    });
  }
  const ready = now - since >= config.dwellMs && now - transition >= config.cooldownMs;
  return respond(ready ? 'review_candidate' : 'waiting', ready ? 'observed_surplus_for_review' : 'surplus_dwell_or_cooldown', {
    surplusAssessed: true, candidateSince: ready ? null : since, lastTransitionAt: ready ? now : transition,
  });
}
