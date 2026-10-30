/** Display policy only. Never changes wiring qualification, Energy, counters or capability IDs. */
import { DUAL_CT_PHASE_DISPLAYS } from './dualCtPresentation';

export const DUAL_CT_DISPLAY_SETTINGS = Object.freeze(['display_ct1', 'display_ct2', 'display_diagnostics']);
export const DUAL_CT_ENERGY_DETAIL_CAPABILITIES = Object.freeze([
  ...['a', 'b'].flatMap((bank) => [1, 2, 3].flatMap((phase) => ['power', 'voltage', 'current']
    .map((quantity) => `dual_ct_preview_${quantity}.${bank}_p${phase}`))), 'dual_ct_preview_net.b',
]);
export type DualCtDisplaySettings = { display_ct1?: unknown; display_ct2?: unknown; display_diagnostics?: unknown };
export function dualCtDisplayPolicy(settings: DualCtDisplaySettings, energy: boolean, threePhase = false) {
  const phases = (value: unknown, fallback: number) => {
    if (value === 'single_phase') return 1;
    if (value === 'three_phase') return 3;
    return fallback;
  };
  const legacy = !energy && ![settings.display_ct1, settings.display_ct2, settings.display_diagnostics]
    .some((value) => value !== undefined && value !== null && value !== 'default');
  const ct1 = phases(settings.display_ct1, energy && !threePhase ? 1 : 3);
  const ct2 = settings.display_ct2 === 'off' ? 0 : phases(settings.display_ct2, energy ? 0 : 3);
  const diagnostics = settings.display_diagnostics === 'show' || (settings.display_diagnostics !== 'hide' && legacy);
  return { ct1, ct2, diagnostics };
}
export function dualCtDisplayVisible(id: string, settings: DualCtDisplaySettings, energy: boolean, threePhase = false): boolean {
  const policy = dualCtDisplayPolicy(settings, energy, threePhase);
  const row = DUAL_CT_PHASE_DISPLAYS.find((item) => item.capability === id);
  if (row) {
    return row.phase! <= (row.bank === 'A' ? policy.ct1 : policy.ct2)
    && !(energy && row.bank === 'A' && policy.ct1 === 1 && row.quantity === 'power');
  }
  if (id === 'dual_ct_preview_net.b') return policy.ct2 > 0;
  if (id === 'dual_ct_preview_net.a' || id === 'dual_ct_preview_status') return true;
  if (id.includes('.b') && policy.ct2 === 0) return false;
  return policy.diagnostics;
}

export function dualCtDisplayOptions(base: any, current: any, visible: boolean) {
  // Preserve custom titles and existing options; keep the established privacy fences.
  return {
    ...base,
    ...current,
    preventTag: base.preventTag,
    preventInsights: base.preventInsights,
    uiComponent: visible ? 'sensor' : null,
  };
}
