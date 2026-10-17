/** Preview-only presentation metadata. Never selects an Energy source or changes signs. */
import { DUAL_CT_FIELD_DEFINITIONS } from './dualCtContract';

export const DUAL_CT_PHASE_DISPLAYS = DUAL_CT_FIELD_DEFINITIONS.filter((row) => row.phase !== null)
  .map((row) => ({ ...row, capability: `dual_ct_preview_${row.quantity}.${row.bank.toLowerCase()}_p${row.phase}` }));

const roles = ['unknown', 'grid', 'hybrid_inverter', 'solar_inverter', 'load'] as const;
export type DualCtCircuitRole = typeof roles[number];

/** Installation descriptions are user assertions, not model-wide mapping verification. */
export function dualCtCircuitRole(value: unknown): DualCtCircuitRole {
  return typeof value === 'string' && roles.includes(value as DualCtCircuitRole) ? value as DualCtCircuitRole : 'unknown';
}

export type DualCtDisplayRoles = { aRole?: unknown; bRole?: unknown };
