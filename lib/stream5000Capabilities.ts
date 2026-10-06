'use strict';

import { Es22Telemetry, Stream5000PvTelemetry } from './streamAc5000Protocol';

/** Serial-attributed readings; not a model admission rule or an Energy source. */
export interface Stream5000CapabilityCandidates {
  directPv?: Stream5000PvTelemetry;
  acSocketW?: number;
  solarNodeW?: number;
}

// Defensive telemetry bound, NOT a product rating or a control limit.
const MAX_CANDIDATE_POWER_W = 100000;

function validPower(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_CANDIDATE_POWER_W;
}

/**
 * Only the requested serial's f50 record can supply its MPPT readings. Node
 * totals require a matching source header; no peer count, record position or
 * installation SOC is used to borrow another battery's readings.
 *
 * This stays separate from battery map(): the development lifecycle can expose
 * observed physical accessories, but cannot create another Energy source or
 * admit an unknown model. Hardware comparison is still required before treating
 * this development candidate as validated or promoting it to production.
 */
export function stream5000CapabilityCandidates(
  telemetry: Es22Telemetry, serialNumber: string,
): Stream5000CapabilityCandidates {
  const sn = serialNumber.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,64}$/.test(sn)) return {};
  const candidates: Stream5000CapabilityCandidates = {};
  const pv = telemetry.unitsBySn?.[sn]?.pv;
  if (pv) {
    const valid: Stream5000PvTelemetry = {};
    for (const key of ['totalW', 'string1W', 'string2W', 'string3W', 'string4W'] as const) {
      if (validPower(pv[key])) valid[key] = pv[key];
    }
    if (Object.keys(valid).length) candidates.directPv = valid;
  }
  if (telemetry.sourceSn?.toUpperCase() === sn) {
    if (validPower(telemetry.acSocketW)) candidates.acSocketW = telemetry.acSocketW;
    if (validPower(telemetry.solarW)) candidates.solarNodeW = telemetry.solarW;
  }
  // No PV-plus-node sum, expansion capacity, gateway identity or kWh inference.
  return candidates;
}
