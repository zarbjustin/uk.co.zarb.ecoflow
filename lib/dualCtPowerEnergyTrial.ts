/** Unwired, pure power-accounting rehearsal. Raw preview values MUST NOT enter this adapter. */
import { dualCtFreshAge, dualCtReadingTime } from './dualCtContract';

export interface DualCtPowerSample {
  source: string; // Future verified account/device/channel/session identity, not a bank guess.
  signedImportW: number; // Already normalized: positive import, negative export.
  unit: string;
  measuredAt: number | null;
  receivedAt: number;
}
export interface DualCtPowerEnergyState {
  version: 1;
  mode: 'power';
  source: string;
  importedWh: number;
  exportedWh: number;
  lastNow: number | null;
  baseline: { signedImportW: number; measuredAt: number; receivedAt: number } | null;
}
const sourceValid = (s: unknown): s is string => typeof s === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(s);
const energyValid = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1e12;
const timeValid = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const powerValid = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 100000;

/** Preserve explicitly supplied local totals, never seed them from guessed lifetime counters. */
export function initialDualCtPowerEnergyTrial(source: string, importedWh = 0, exportedWh = 0): DualCtPowerEnergyState | null {
  if (!sourceValid(source) || !energyValid(importedWh) || !energyValid(exportedWh)) return null;
  return {
    version: 1, mode: 'power', source, importedWh, exportedWh, lastNow: null, baseline: null,
  };
}

/** Restore/rebind keeps totals but never integrates downtime or a previous session. */
export function restoreDualCtPowerEnergyTrial(input: unknown, source: string): DualCtPowerEnergyState | null {
  const state = input as DualCtPowerEnergyState;
  if (state?.version !== 1 || state.mode !== 'power' || !sourceValid(state.source)) return null;
  return initialDualCtPowerEnergyTrial(source, state.importedWh, state.exportedWh);
}

/** Measurement and receipt clocks both need to be known/fresh. Receipt alone is not a measurement. */
export function dualCtPowerEnergyView(state: DualCtPowerEnergyState, now: number) {
  const old = state?.baseline;
  const valid = state?.version === 1 && state.mode === 'power' && sourceValid(state.source)
    && energyValid(state.importedWh) && energyValid(state.exportedWh);
  const fresh = valid && timeValid(now) && (state.lastNow === null || now >= state.lastNow)
    && old && powerValid(old.signedImportW) && timeValid(old.measuredAt) && timeValid(old.receivedAt)
    && old.measuredAt <= old.receivedAt && dualCtReadingTime(old.receivedAt, old.measuredAt, now).valid;
  return {
    signedImportW: fresh ? old.signedImportW : null,
    importW: fresh ? Math.max(0, old.signedImportW) : null,
    exportW: fresh ? Math.max(0, -old.signedImportW) : null,
    importedWh: valid ? state.importedWh : null,
    exportedWh: valid ? state.exportedWh : null,
    totalsBasis: 'derived_from_power' as const,
    contributesToEnergy: false as const,
    migrationAllowed: false as const,
  };
}

/** One selected source, one path, no native-counter mixing or inferred samples across a gap. */
export function previewDualCtPowerEnergyTransition(state: DualCtPowerEnergyState, sample: DualCtPowerSample, now: number) {
  const restored = restoreDualCtPowerEnergyTrial(state, state?.source);
  const result = (status: string, next: DualCtPowerEnergyState | null) => ({
    status,
    state: next,
    contributesToEnergy: false as const,
    migrationAllowed: false as const,
    view: next ? dualCtPowerEnergyView(next, now) : null,
  });
  if (!restored || !(state.lastNow === null || timeValid(state.lastNow))) return result('invalid_state', null);
  const old = state.baseline;
  if (old && (!powerValid(old.signedImportW) || !timeValid(old.measuredAt) || !timeValid(old.receivedAt)
    || old.measuredAt > old.receivedAt || state.lastNow === null || old.receivedAt > state.lastNow)) {
    return result('invalid_baseline', restored);
  }
  const cleared = { ...restored, lastNow: timeValid(now) ? now : null };
  if (!timeValid(now) || (state.lastNow !== null && now < state.lastNow)) return result('clock_reset', cleared);
  if (!sample || sample.source !== state.source) return result('source_rejected', cleared);
  if (sample.unit !== 'W' || !powerValid(sample.signedImportW) || !timeValid(sample.measuredAt)
    || !timeValid(sample.receivedAt) || !dualCtReadingTime(sample.receivedAt, sample.measuredAt, now).valid) {
    return result('invalid_sample', cleared);
  }
  const baseline = { signedImportW: sample.signedImportW, measuredAt: sample.measuredAt, receivedAt: sample.receivedAt };
  const anchored = { ...cleared, baseline };
  if (!old) return result('anchored', anchored);
  if (sample.measuredAt <= old.measuredAt || sample.receivedAt <= old.receivedAt) {
    // Retain a still-valid anchor for duplicate/reordered samples; add no energy.
    return result('out_of_order', { ...cleared, baseline: { ...old } });
  }
  const elapsed = sample.measuredAt - old.measuredAt;
  if (!dualCtFreshAge(elapsed) || !dualCtFreshAge(sample.receivedAt - old.receivedAt)) return result('gap_anchor', anchored);
  const p = old.signedImportW; const q = sample.signedImportW;
  let importWms = 0; let exportWms = 0;
  if (p >= 0 && q >= 0) importWms = ((p + q) * elapsed) / 2;
  else if (p <= 0 && q <= 0) exportWms = (-(p + q) * elapsed) / 2;
  else {
    // Split the linear interpolation at zero; clipping just the net loses both directions.
    const firstMs = (elapsed * Math.abs(p)) / (Math.abs(p) + Math.abs(q));
    const first = (Math.abs(p) * firstMs) / 2; const second = (Math.abs(q) * (elapsed - firstMs)) / 2;
    importWms = p > 0 ? first : second;
    exportWms = p < 0 ? first : second;
  }
  const importedWh = restored.importedWh + importWms / 3600000;
  const exportedWh = restored.exportedWh + exportWms / 3600000;
  if (!energyValid(importedWh) || !energyValid(exportedWh)) return result('overflow', cleared);
  return result('advanced', { ...anchored, importedWh, exportedWh });
}
