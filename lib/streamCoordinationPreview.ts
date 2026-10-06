'use strict';

/** Advisory only: no transport, device lookup, persistence or control permission.
 * Positive battery watts mean charging. The caller must provide explicit,
 * timestamped readings and confirm controller ownership; no BYD integration is
 * inferred from account inventory. Defaults are research policy, not ratings.
 */
export function streamCoordinationPreview(input: any, previous: any = {}, options: any = {}): Record<string, unknown> {
  const config = {
    startSoc: 98,
    stopSoc: 97,
    dwellMs: 60000,
    cooldownMs: 60000,
    maxAgeMs: 60000,
    powerDeadbandW: 20,
  };
  // Project known numeric options only. Never echo caller-supplied data.
  if (!options || typeof options !== 'object' || Array.isArray(options)) options = { startSoc: NaN };
  for (const key of Object.keys(config) as Array<keyof typeof config>) {
    if (options[key] !== undefined) config[key] = options[key];
  }
  const now = input?.now;
  const result = (state: string, reason: string, candidateSince: number | null, lastTransitionAt: number | null) => ({
    advisoryOnly: true,
    controlsEnabled: false,
    commandWrites: 0,
    state,
    reason,
    candidateSince,
    lastTransitionAt,
  });
  const blocked = (reason: string) => result('blocked', reason, null, Number.isFinite(now) && now >= 0 ? now : null);
  if (!Number.isFinite(now) || now < 0) return blocked('invalid_clock');
  if (![config.startSoc, config.stopSoc].every((n) => Number.isFinite(n) && n >= 0 && n <= 100)
    || config.stopSoc >= config.startSoc
    || ![config.dwellMs, config.cooldownMs, config.maxAgeMs].every((n) => Number.isFinite(n) && n >= 1000 && n <= 86400000)
    || !Number.isFinite(config.powerDeadbandW) || config.powerDeadbandW <= 0 || config.powerDeadbandW > 10000) {
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
  const deadband = config.powerDeadbandW;
  if ((byd < -deadband && stream > deadband) || (stream < -deadband && byd > deadband)) return blocked('opposing_battery_flows');
  if (byd < -deadband) return blocked('byd_discharging');
  if (!previous || typeof previous !== 'object' || Array.isArray(previous)) return blocked('invalid_prior_state');
  const priorAt = previous.lastTransitionAt;
  if (priorAt !== undefined && priorAt !== null && (!Number.isFinite(priorAt) || priorAt < 0 || priorAt > now)) return blocked('invalid_prior_clock');
  if (previous.state === 'review_candidate' && input.bydSoc.value > config.stopSoc) {
    return result('review_candidate', 'review_surplus_before_control', null, priorAt ?? now);
  }
  if (input.bydSoc.value < config.startSoc) {
    return result('waiting', 'byd_priority', null,
      previous.state === 'waiting' ? priorAt ?? now : now);
  }
  const since = Number.isFinite(previous.candidateSince) && previous.candidateSince >= 0
    && previous.candidateSince <= now && previous.state === 'waiting' ? previous.candidateSince : now;
  const cooldownElapsed = priorAt === undefined || priorAt === null || now - priorAt >= config.cooldownMs;
  const ready = now - since >= config.dwellMs && cooldownElapsed;
  return result(ready ? 'review_candidate' : 'waiting', ready ? 'review_surplus_before_control' : 'dwell_or_cooldown',
    ready ? null : since, ready ? now : priorAt ?? now);
}
