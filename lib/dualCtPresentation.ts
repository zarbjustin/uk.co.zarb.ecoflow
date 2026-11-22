/** Preview-only presentation metadata. Never selects an Energy source or changes signs. */
import { DUAL_CT_FIELD_DEFINITIONS } from './dualCtContract';
import { streamCircuitRole, StreamCircuitRole } from './streamCircuitRoles';

export const DUAL_CT_PHASE_DISPLAYS = DUAL_CT_FIELD_DEFINITIONS.filter((row) => row.phase !== null)
  .map((row) => ({ ...row, capability: `dual_ct_preview_${row.quantity}.${row.bank.toLowerCase()}_p${row.phase}` }));

export type DualCtCircuitRole = StreamCircuitRole;

/** Installation descriptions are user assertions, not model-wide mapping verification. */
export function dualCtCircuitRole(value: unknown): DualCtCircuitRole {
  return streamCircuitRole(value);
}

export type DualCtDisplayRoles = { aRole?: unknown; bRole?: unknown };
