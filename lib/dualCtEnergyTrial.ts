/** Pure laboratory preview for FUTURE validated Wh import/export counters. Not wired to a driver. */
import { dualCtFreshAge } from './dualCtContract';

export type DualCtEnergyTrialState = {
  version: 1;
  source: string | null;
  importedWh: number;
  exportedWh: number;
  baseline: { importedWh: number; exportedWh: number; measuredAt: number } | null;
};
type Sample = { source: string; importedWh: number; exportedWh: number; measuredAt: number; receivedAt: number; unit: string };
const energy = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1e12;

/** Existing totals are supplied by a future migration, not overwritten with a vendor lifetime value. */
export function initialDualCtEnergyTrial(importedWh = 0, exportedWh = 0): DualCtEnergyTrialState | null {
  if (!energy(importedWh) || !energy(exportedWh)) return null;
  return {
    version: 1, source: null, importedWh, exportedWh, baseline: null,
  };
}

/** Fail closed on corrupt/unknown restore. A new anchor is required after restart or source change. */
export function restoreDualCtEnergyTrial(input: unknown): DualCtEnergyTrialState | null {
  const state = input as DualCtEnergyTrialState;
  if (state?.version !== 1 || !energy(state.importedWh) || !energy(state.exportedWh)) return null;
  return initialDualCtEnergyTrial(state.importedWh, state.exportedWh);
}

export function previewDualCtEnergyTransition(state: DualCtEnergyTrialState, sample: Sample, now: number,
  mode: 'counter' | 'power' = 'counter') {
  const retained = restoreDualCtEnergyTrial(state);
  if (!retained || !(state.source === null || (typeof state.source === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(state.source)))) {
    return {
      status: 'invalid_state', state: null, contributesToEnergy: false, migrationAllowed: false,
    };
  }
  const result = (status: string, next = { ...retained, source: state.source, baseline: state.baseline ? { ...state.baseline } : null }) => ({
    status, state: next, contributesToEnergy: false, migrationAllowed: false,
  });
  // This trial has exactly one accounting path; no simultaneous power fallback.
  if (mode !== 'counter') return result('power_path_blocked');
  if (!sample || sample.unit !== 'Wh' || !energy(sample.importedWh) || !energy(sample.exportedWh)
    || typeof sample.source !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(sample.source)
    || !Number.isFinite(now) || !Number.isFinite(sample.measuredAt) || !Number.isFinite(sample.receivedAt)
    || sample.measuredAt <= 0 || sample.measuredAt > sample.receivedAt || sample.receivedAt > now
    || !dualCtFreshAge(now - sample.measuredAt)) return result('invalid_sample');
  const old = state.baseline;
  if (old && (!energy(old.importedWh) || !energy(old.exportedWh) || !Number.isFinite(old.measuredAt)
    || old.measuredAt <= 0 || old.measuredAt > now)) return result('invalid_baseline', retained);
  const next = {
    ...retained,
    source: sample.source,
    baseline: {
      importedWh: sample.importedWh, exportedWh: sample.exportedWh, measuredAt: sample.measuredAt,
    },
  };
  if (old && sample.measuredAt <= old.measuredAt) return result('out_of_order');
  if (!old || state.source !== sample.source) return result(old ? 'source_changed_anchor' : 'anchored', next);
  if (!dualCtFreshAge(sample.measuredAt - old.measuredAt)) return result('gap_anchor', next);
  if (sample.importedWh < old.importedWh || sample.exportedWh < old.exportedWh) {
    // A reset/wrap/unit/source defect is ambiguous. Never count the new raw value from zero.
    return result('decrease_anchor', next);
  }
  const importedWh = retained.importedWh + (sample.importedWh - old.importedWh);
  const exportedWh = retained.exportedWh + (sample.exportedWh - old.exportedWh);
  if (!energy(importedWh) || !energy(exportedWh)) return result('overflow');
  return result('advanced', { ...next, importedWh, exportedWh });
}
