'use strict';

import {
  describeEs22Frame,
  Es22SampleGate,
  es22FrameShape,
  es22TopicKind,
  formatEs22CapabilitySnapshot,
} from './streamAc5000Diagnostics';
import { createStreamAc5000Mapper, mapStreamAc5000 } from './streamAc5000Mapping';
import { parseStreamAc5000Frame } from './streamAc5000Protocol';
import { Stream5000ModelSpec, Stream5000TelemetryAdapterId } from './stream5000Models';
import { Es22TopologyTracker, StreamTopologyEvidence } from './streamTopology';

export type Stream5000CapabilityValues = Record<string, number | string | null>;

export interface Stream5000FrameDiagnostic {
  bytes: number;
  sha256: string;
  commands: string[];
  sampleBase64: string;
  truncated: boolean;
}

export interface Stream5000SampleGate {
  shouldCapture(diagnostic: Stream5000FrameDiagnostic): boolean;
}

export interface Stream5000TopologyTracker {
  observe(telemetry: unknown, receivedAt: number): void;
  evidence(): StreamTopologyEvidence;
}

/**
 * Everything a model-specific telemetry implementation contributes to the
 * common STREAM 5000 device lifecycle. Keeping this boundary explicit means a
 * future product cannot accidentally reuse ES22 field mappings just because it
 * uses the same EcoFlow app-auth transport.
 */
export interface Stream5000TelemetryAdapter {
  id: Stream5000TelemetryAdapterId;
  diagnosticLabel: string;
  requestedSnapshotCommand?: string;
  parse(payload: Buffer, serialNumber?: string): unknown | null;
  map(telemetry: unknown): Stream5000CapabilityValues;
  createMapper(serialNumber: string, scope: 'system' | 'unit'): (telemetry: unknown) => Stream5000CapabilityValues;
  createTopologyTracker(serialNumber: string): Stream5000TopologyTracker;
  describe(payload: Buffer, serialNumber: string, sampleBytes?: number): Stream5000FrameDiagnostic;
  frameShape(diagnostic: Stream5000FrameDiagnostic): string;
  topicKind(topic: string): string;
  formatSnapshot(values: Stream5000CapabilityValues): string;
  createSampleGate(): Stream5000SampleGate;
}

const ES22_ADAPTER: Stream5000TelemetryAdapter = Object.freeze({
  id: 'es22',
  diagnosticLabel: 'ES22',
  requestedSnapshotCommand: '254/39',
  parse: parseStreamAc5000Frame,
  map: (telemetry: unknown) => mapStreamAc5000(telemetry as Parameters<typeof mapStreamAc5000>[0]),
  createMapper: (serialNumber: string, scope: 'system' | 'unit') => {
    const mapper = createStreamAc5000Mapper(serialNumber, scope);
    return (telemetry: unknown) => mapper(telemetry as Parameters<typeof mapStreamAc5000>[0]);
  },
  createTopologyTracker: (serialNumber: string) => {
    const tracker = new Es22TopologyTracker(serialNumber);
    return {
      observe: (telemetry: unknown, receivedAt: number) => tracker.observe(telemetry as Parameters<Es22TopologyTracker['observe']>[0], receivedAt),
      evidence: () => tracker.evidence(),
    };
  },
  describe: describeEs22Frame,
  frameShape: es22FrameShape,
  topicKind: es22TopicKind,
  formatSnapshot: formatEs22CapabilitySnapshot,
  createSampleGate: () => {
    const gate = new Es22SampleGate();
    return { shouldCapture: (diagnostic: Stream5000FrameDiagnostic) => gate.shouldCapture(diagnostic) };
  },
});

/** ES21 shares corroborated core telemetry, but remains an explicit adapter. */
const ES21_ADAPTER: Stream5000TelemetryAdapter = Object.freeze({
  ...ES22_ADAPTER,
  id: 'es21',
  diagnosticLabel: 'ES21',
  parse: (payload: Buffer, serialNumber?: string) => {
    if (serialNumber && !/^ES21/i.test(serialNumber)) return null;
    return parseStreamAc5000Frame(payload, serialNumber);
  },
  createMapper: (serialNumber: string, scope: 'system' | 'unit') => {
    if (!/^ES21/i.test(serialNumber)) throw new Error('ES21 adapter requires an ES21 serial');
    const mapper = createStreamAc5000Mapper(serialNumber, scope);
    return (telemetry: unknown) => mapper(telemetry as Parameters<typeof mapStreamAc5000>[0]);
  },
});

const ADAPTERS: Readonly<Record<Stream5000TelemetryAdapterId, Stream5000TelemetryAdapter>> = Object.freeze({
  es22: ES22_ADAPTER,
  es21: ES21_ADAPTER,
});

export function stream5000TelemetryAdapter(model: Stream5000ModelSpec): Stream5000TelemetryAdapter {
  const adapter = ADAPTERS[model.telemetryAdapter];
  if (!adapter) throw new Error(`No telemetry adapter registered for STREAM 5000 model ${model.id}`);
  return adapter;
}
