'use strict';

/**
 * Static, model-specific facts about a physical STREAM unit, derived from its
 * serial-number prefix. Used to tailor each STREAM Unit device's settings page
 * and capability layout so an AC-coupled unit (e.g. STREAM AC Pro) is presented
 * differently from a solar unit (e.g. STREAM Ultra X).
 *
 * Prefixes match lib/ecoflowDevices.ts (verified on a live STREAM account and
 * cross-referenced with the community device maps).
 */
export interface StreamModelSpec {
  /** Friendly product name, e.g. "STREAM Ultra X". */
  model: string;
  /** True when the unit charges from AC and has no direct solar (PV/MPPT) input. */
  acCoupled: boolean;
  /** Number of PV/MPPT solar inputs the model exposes (0 for AC-coupled units). */
  solarInputs: number;
  /** Short, human-readable description of how the unit is powered. */
  energySource: string;
}

const SOLAR_SOURCE = 'Solar (PV/MPPT), AC and grid';
const AC_SOURCE = 'AC-coupled (charges from AC/grid, no direct solar input)';

const SPECS: Record<string, StreamModelSpec> = {
  BK11: {
    model: 'STREAM Ultra', acCoupled: false, solarInputs: 2, energySource: SOLAR_SOURCE,
  },
  BK12: {
    model: 'STREAM Pro', acCoupled: false, solarInputs: 2, energySource: SOLAR_SOURCE,
  },
  BK31: {
    model: 'STREAM AC Pro', acCoupled: true, solarInputs: 0, energySource: AC_SOURCE,
  },
  BK41: {
    model: 'STREAM Max', acCoupled: false, solarInputs: 2, energySource: SOLAR_SOURCE,
  },
  BK51: {
    model: 'STREAM AC', acCoupled: true, solarInputs: 0, energySource: AC_SOURCE,
  },
  BK61: {
    model: 'STREAM Ultra X', acCoupled: false, solarInputs: 4, energySource: SOLAR_SOURCE,
  },
};

const UNKNOWN: StreamModelSpec = {
  model: 'STREAM Unit',
  acCoupled: false,
  solarInputs: 4,
  energySource: SOLAR_SOURCE,
};

/** Resolve the model spec for a STREAM unit from its serial number. */
export function streamModelFromSn(sn: string | undefined): StreamModelSpec {
  const prefix = (sn || '').slice(0, 4).toUpperCase();
  return SPECS[prefix] ?? UNKNOWN;
}
