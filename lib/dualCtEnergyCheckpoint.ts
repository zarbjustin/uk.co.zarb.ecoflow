/** One private atomic-key checkpoint. No sample baseline, raw identity, vendor counters or history. */
import { createHash } from 'crypto';
import { DualCtEnergyTiming } from './dualCtGridEnergySource';

export interface DualCtEnergyCheckpoint {
  schema: 1;
  binding: string;
  timing: DualCtEnergyTiming;
  revision: number;
  importedWh: number;
  exportedWh: number;
  checksum: string;
}
export interface DualCtEnergyStorage {
  read: () => Promise<unknown>;
  write: (checkpoint: DualCtEnergyCheckpoint) => Promise<void>;
}
export const DUAL_CT_ENERGY_CHECKPOINT_KEY = 'dualCtGridEnergyCheckpointV1';
const keys = ['binding', 'checksum', 'exportedWh', 'importedWh', 'revision', 'schema', 'timing'];
const energy = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1e12;
const fingerprint = (c: Omit<DualCtEnergyCheckpoint, 'checksum'>) => createHash('sha256')
  .update(JSON.stringify([c.schema, c.binding, c.timing, c.revision, c.importedWh, c.exportedWh])).digest('hex');

export function makeDualCtEnergyCheckpoint(binding: string, timing: DualCtEnergyTiming, revision = 0,
  importedWh = 0, exportedWh = 0): DualCtEnergyCheckpoint | null {
  if (!/^[a-f0-9]{64}$/.test(binding) || !['device_measurement', 'verified_live_receipt_estimate'].includes(timing)
    || !Number.isSafeInteger(revision) || revision < 0 || !energy(importedWh) || !energy(exportedWh)) return null;
  const state = {
    schema: 1 as const, binding, timing, revision, importedWh, exportedWh,
  };
  return { ...state, checksum: fingerprint(state) };
}

/** Unknown, mismatched or malformed state is NOT permission to start counting from zero. */
export function readDualCtEnergyCheckpoint(input: unknown, binding: string, timing: DualCtEnergyTiming): DualCtEnergyCheckpoint | null {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).sort().join() !== keys.join()) return null;
  const row = input as DualCtEnergyCheckpoint;
  if (row.schema !== 1 || row.binding !== binding || row.timing !== timing) return null;
  const state = makeDualCtEnergyCheckpoint(row.binding, row.timing, row.revision, row.importedWh, row.exportedWh);
  return state && row.checksum === state.checksum ? state : null;
}

/** Future Homey adapter: dedicated single-key write, never instantiated by current app/drivers. */
export function dualCtEnergyHomeyStorage(device: {
  getStoreValue: (key: string) => unknown;
  setStoreValue: (key: string, value: unknown) => Promise<unknown>;
}): DualCtEnergyStorage {
  return {
    read: async () => device.getStoreValue(DUAL_CT_ENERGY_CHECKPOINT_KEY),
    write: async (checkpoint) => {
      await device.setStoreValue(DUAL_CT_ENERGY_CHECKPOINT_KEY, { ...checkpoint });
    },
  };
}
