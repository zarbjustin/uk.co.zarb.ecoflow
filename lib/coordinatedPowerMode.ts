'use strict';

/** Explicit application-policy selection, never an electrical-limit claim.
 * Deliberately excludes old bound/expiry fields: migration replaces the budget.
 */
export function isEcoflowManagedPower(budget: any): boolean {
  return budget?.schemaVersion === 2 && budget.mode === 'ecoflow-managed'
    && Object.keys(budget).length === 5
    && Number.isFinite(budget.maxObservationAgeSec) && budget.maxObservationAgeSec > 0 && budget.maxObservationAgeSec <= 30
    && Number.isFinite(budget.dispatchBufferSeconds) && budget.dispatchBufferSeconds >= 60 && budget.dispatchBufferSeconds <= 300
    && Number.isFinite(budget.stopBufferSeconds) && budget.stopBufferSeconds >= 30 && budget.stopBufferSeconds <= 600;
}
