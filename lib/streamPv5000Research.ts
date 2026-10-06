'use strict';

import { stream5000CapabilityCandidates } from './stream5000Capabilities';
import { createStreamAc5000Mapper } from './streamAc5000Mapping';
import { parseStreamAc5000Frame } from './streamAc5000Protocol';

/**
 * OFFLINE RESEARCH ONLY. ES21 captures corroborate this shared subset of wire
 * fields, not all ES22 behaviour. This adapter is intentionally absent from the
 * model/runtime registries and cannot admit any model. ES21 core monitoring is
 * separately admitted by its runtime adapter; these extra PV candidates remain
 * offline-only until hardware validation. No command writer.
 */
export function createStreamPv5000ResearchAdapter(serialNumber: string) {
  const sn = serialNumber.trim().toUpperCase();
  if (!/^ES21[A-Z0-9]{1,60}$/.test(sn)) throw new Error('ES21 research adapter requires an ES21 serial');
  const mapUnit = createStreamAc5000Mapper(sn, 'unit');
  const mapSystem = createStreamAc5000Mapper(sn, 'system');
  return Object.freeze({
    id: 'es21-research' as const,
    admission: 'offline-only' as const,
    parse: (payload: Buffer) => parseStreamAc5000Frame(payload, sn),
    mapUnit,
    mapSystem,
    candidates: (telemetry: Parameters<typeof stream5000CapabilityCandidates>[0]) => stream5000CapabilityCandidates(telemetry, sn),
  });
}
