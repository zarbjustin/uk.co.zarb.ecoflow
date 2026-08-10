'use strict';

import {
  describeEs22Frame,
  Es22SampleGate,
  es22FrameShape,
  es22TopicKind,
  formatEs22CapabilitySnapshot,
} from './streamAc5000Diagnostics';
import { mapStreamAc5000 } from './streamAc5000Mapping';
import { parseStreamAc5000Frame } from './streamAc5000Protocol';
import { Stream5000ModelSpec, Stream5000TelemetryAdapterId } from './stream5000Models';

export type Stream5000CapabilityValues = Record<string, number | string>;

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
  parse(payload: Buffer): unknown | null;
  map(telemetry: unknown): Stream5000CapabilityValues;
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
  describe: describeEs22Frame,
  frameShape: es22FrameShape,
  topicKind: es22TopicKind,
  formatSnapshot: formatEs22CapabilitySnapshot,
  createSampleGate: () => {
    const gate = new Es22SampleGate();
    return { shouldCapture: (diagnostic: Stream5000FrameDiagnostic) => gate.shouldCapture(diagnostic) };
  },
});

const ADAPTERS: Readonly<Record<Stream5000TelemetryAdapterId, Stream5000TelemetryAdapter>> = Object.freeze({
  es22: ES22_ADAPTER,
});

export function stream5000TelemetryAdapter(model: Stream5000ModelSpec): Stream5000TelemetryAdapter {
  const adapter = ADAPTERS[model.telemetryAdapter];
  if (!adapter) throw new Error(`No telemetry adapter registered for STREAM 5000 model ${model.id}`);
  return adapter;
}
