import { AppDevice } from './appDevices';
import { decodeFrameHeaders } from './streamAc5000Protocol';
import {
  dualCtResearchDevices, dualCtJsonShape, dualCtJsonShapesSnapshot, dualCtInventorySnapshot, dualCtDiscoveryIdentity,
} from './dualCtSources';
import { DualCtHistory, dualCtHistorySnapshot } from './dualCtHistory';
import { DualCtPreview } from './dualCtPreview';
import { dualCtPreviewDiagnostics, dualCtReceiptSnapshot } from './dualCtDiagnostics';
import { dualCtEncodingPolicy } from './dualCtEncoding';

export { dualCtResearchDevices } from './dualCtSources';

export const DUAL_CT_CAPTURE_MS = 120000;
const MAX_FRAMES = 128;
const MAX_SHAPES = 16;

export function dualCtSelectedSnapshot(input: any): Array<Record<string, unknown>> {
  return Array.isArray(input) ? input.slice(0, 2).filter((row) => [0, 1].includes(row?.deviceIndex)
    && ['explicit_name', 'observed_app_product_type_421'].includes(row?.basis)).map((row) => ({
    deviceIndex: row.deviceIndex,
    basis: row.basis,
    provisional: row.basis === 'observed_app_product_type_421',
    appListed: row.appListed === true,
    developerListed: row.developerListed === true,
  })) : [];
}

export function dualCtResearchSnapshot(input: any): Record<string, unknown> {
  const bounded = (value: any, max: number) => (Number.isInteger(value) && value >= 0 && value <= max ? value : 0);
  const statuses = ['not_started', 'discovering', 'listening', 'stopped', 'complete', 'sample_limit',
    'account_changed', 'no_explicit_model', 'transport_unavailable', 'discovery_unavailable'];
  return {
    appVersion: typeof input?.appVersion === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(input.appVersion) ? input.appVersion : 'unknown',
    status: statuses.includes(input?.status) ? input.status : 'not_started',
    source: 'manual_account_discovery',
    captureWindowSec: 120,
    captureAgeSec: typeof input?.captureAgeSec === 'number' && Number.isFinite(input.captureAgeSec)
      && input.captureAgeSec >= 0 ? input.captureAgeSec : null,
    completed: input?.completed === true,
    deviceCount: bounded(input?.deviceCount, 2),
    frames: bounded(input?.frames, MAX_FRAMES),
    rejectedFrames: bounded(input?.rejectedFrames, MAX_FRAMES),
    cleanupFailures: bounded(input?.cleanupFailures, 65535),
    history: dualCtHistorySnapshot(input?.history),
    inventory: dualCtInventorySnapshot(input?.inventory),
    selected: dualCtSelectedSnapshot(input?.selected),
    jsonShapes: dualCtJsonShapesSnapshot(input?.jsonShapes),
    routes: Array.isArray(input?.routes) ? input.routes.slice(0, 8).filter((route: any) => [0, 1].includes(route?.deviceIndex)
      && ['app_mqtt', 'developer_mqtt', 'developer_rest', 'linked_host_rest'].includes(route?.source)
      && ['listening', 'unavailable', 'empty', 'observed', 'host_not_verified'].includes(route?.status))
      .map((route: any) => ({
        deviceIndex: route.deviceIndex, source: route.source, status: route.status, ...dualCtReceiptSnapshot(route),
      })) : [],
    previewDiagnostics: dualCtPreviewDiagnostics(input?.previewDiagnostics),
    shapes: Array.isArray(input?.shapes) ? input.shapes.slice(0, MAX_SHAPES).map((shape: any) => ({
      deviceIndex: bounded(shape?.deviceIndex, 1),
      cmdFunc: bounded(shape?.cmdFunc, 65535),
      cmdId: bounded(shape?.cmdId, 65535),
      fields: Array.isArray(shape?.fields) ? shape.fields.slice(0, 32).filter((field: any) => Number.isInteger(field?.field) && field.field > 0 && field.field <= 536870911
        && [0, 1, 2, 5].includes(field?.wire)).map((field: any) => ({ field: field.field, wire: field.wire })) : [],
    })) : [],
    channelMapping: 'unverified',
    valuesCaptured: input?.valuesCaptured === true,
    valuesIncluded: false,
    pairingEnabled: false,
    contributesToEnergy: false,
    controlsEnabled: false,
  };
}

/** No payload values, strings, serials, raw frames or recursively guessed messages. */
function fields(data: Buffer): Array<{ field: number; wire: number }> {
  let pos = 0;
  const out: Array<{ field: number; wire: number }> = [];
  const integer = (): bigint => {
    let value = 0n;
    for (let i = 0; i < 10; i += 1) {
      if (pos >= data.length) throw new Error('invalid');
      const byte = data[pos++];
      if (i === 9 && byte > 1) throw new Error('invalid');
      value |= BigInt(byte & 127) << BigInt(i * 7);
      if (!(byte & 128)) return value;
    }
    throw new Error('invalid');
  };
  while (pos < data.length) {
    const tag = Number(integer());
    if (!Number.isSafeInteger(tag) || tag < 8 || tag > 0xffffffff) throw new Error('invalid');
    const field = Math.floor(tag / 8); const wire = tag % 8;
    if (wire === 0) integer();
    else {
      const size = wire === 2 ? Number(integer()) : ({ 1: 8, 5: 4 } as Record<number, number>)[wire];
      if (!Number.isSafeInteger(size) || size < 0 || pos + size > data.length) throw new Error('invalid');
      pos += size;
    }
    if (out.length < 32 && !out.some((item) => item.field === field && item.wire === wire)) out.push({ field, wire });
  }
  return out;
}

interface ResearchHooks {
  previewEnabled?: boolean;
  counterPreviewEnabled?: boolean;
  inventory?: () => unknown;
  list: () => Promise<Array<AppDevice & { appListed?: boolean; developerListed?: boolean }>>;
  subscribe: (sn: string, handler: (data: Buffer, topic: string) => void, active?: () => boolean) => Promise<boolean>;
  unsubscribe: (sn: string, handler: (data: Buffer, topic: string) => void) => void;
  timer: (callback: () => void, ms: number) => unknown;
  cancel: (timer: any) => void;
  now?: () => number;
  developerSubscribe?: (sn: string, handler: (data: Record<string, any>) => void, active?: () => boolean) => Promise<boolean>;
  developerUnsubscribe?: (sn: string, handler: (data: Record<string, any>) => void) => void;
  probe?: (sn: string, active: () => boolean) => Promise<Array<{ source: string; status: string; data?: unknown }>>;
}

export class DualCtResearch {
  private selected: Array<Record<string, unknown>> = [];
  private cleanupFailures = 0;
  private readonly history = new DualCtHistory();
  private generation = 0;
  private timer: unknown = null;
  private bindings: Array<{ sn: string; handler: (data: Buffer, topic: string) => void }> = [];
  private developerBindings: Array<{ sn: string; handler: (data: Record<string, any>) => void }> = [];
  private jsonShapes: Array<Record<string, unknown>> = [];
  private routes: Array<{ deviceIndex: number; source: string; status: string }> = [];
  private startedAt: number | null = null;
  private endedAt: number | null = null;
  private status = 'not_started';
  private deviceCount = 0;
  private frames = 0;
  private rejected = 0;
  private shapes: Array<{ deviceIndex: number; cmdFunc: number; cmdId: number; fields: Array<{ field: number; wire: number }> }> = [];

  private readonly hooks: ResearchHooks;
  private readonly preview: DualCtPreview;
  private receipts = new Map<string, { count: number; lastAt: number }>();

  constructor(hooks: ResearchHooks) {
    this.hooks = hooks;
    this.preview = new DualCtPreview(hooks.previewEnabled === true, hooks.counterPreviewEnabled === true);
  }

  private now(): number {
    return (this.hooks.now || Date.now)();
  }

  private recordReceipt(deviceIndex: number, source: string): void {
    const now = this.now();
    if ([...this.receipts.values()].some((row) => row.lastAt > now)) this.receipts.clear();
    const key = `${deviceIndex}:${source}`;
    this.receipts.set(key, { count: Math.min(128, (this.receipts.get(key)?.count || 0) + 1), lastAt: now });
  }

  stop(status = 'stopped', clear = false): void {
    if (clear || !['complete', 'sample_limit'].includes(status)) this.preview.clear(clear || status === 'account_changed');
    this.generation += 1;
    if (this.timer !== null) this.hooks.cancel(this.timer);
    this.timer = null;
    const { bindings } = this;
    this.bindings = [];
    const { developerBindings } = this;
    this.developerBindings = [];
    for (const binding of bindings) {
      try {
        this.hooks.unsubscribe(binding.sn, binding.handler);
      } catch {
        this.cleanupFailures += 1;
      }
    }
    for (const binding of developerBindings) {
      try {
        this.hooks.developerUnsubscribe?.(binding.sn, binding.handler);
      } catch {
        this.cleanupFailures += 1;
      }
    }
    this.status = status;
    this.endedAt = this.startedAt === null ? null : this.now();
    if (this.startedAt !== null) this.history.record(null, 'session', status, this.now());
    if (clear) {
      this.receipts.clear();
      this.selected = [];
      this.startedAt = null; this.endedAt = null; this.deviceCount = 0;
      this.frames = 0; this.rejected = 0; this.shapes = [];
      this.jsonShapes = []; this.routes = [];
      this.history.clear();
      this.cleanupFailures = 0;
    }
  }

  async start(): Promise<void> {
    if (['discovering', 'listening'].includes(this.status)) return;
    this.stop('discovering', true);
    const { generation } = this;
    this.startedAt = this.now(); this.endedAt = null;
    this.history.record(null, 'session', 'discovering', this.now());
    this.timer = this.hooks.timer(() => this.stop('complete'), DUAL_CT_CAPTURE_MS);
    try {
      const devices = dualCtResearchDevices(await this.hooks.list());
      if (generation !== this.generation) return;
      if (this.now() < this.startedAt! || this.now() - this.startedAt! >= DUAL_CT_CAPTURE_MS) {
        this.stop('complete'); return;
      }
      this.deviceCount = devices.length;
      this.selected = devices.map((device, deviceIndex) => ({
        deviceIndex,
        basis: dualCtDiscoveryIdentity(device),
        appListed: device.appListed !== false,
        developerListed: device.developerListed === true,
      }));
      if (!devices.length) {
        this.stop('no_explicit_model'); return;
      }
      this.status = 'listening';
      for (const [deviceIndex, device] of devices.entries()) {
        const active = () => {
          if (generation !== this.generation) return false;
          if (this.now() < this.startedAt! || this.now() - this.startedAt! >= DUAL_CT_CAPTURE_MS) {
            this.stop('complete'); return false;
          }
          return true;
        };
        const recordJson = (data: unknown, source: string, count = true) => {
          if (!active()) return;
          if (count && this.frames >= MAX_FRAMES) {
            this.stop('sample_limit'); return;
          }
          if (count) this.frames += 1;
          if (count) this.recordReceipt(deviceIndex, source);
          try {
            const shape = { deviceIndex, source, ...dualCtJsonShape(data) };
            this.history.record(deviceIndex, source, shape.empty ? 'empty' : 'json', this.now());
            if (this.jsonShapes.length < MAX_SHAPES && !this.jsonShapes.some((item) => JSON.stringify(item) === JSON.stringify(shape))) {
              this.jsonShapes.push(shape);
            }
          } catch {
            this.rejected += 1;
            this.history.record(deviceIndex, source, 'unrecognised', this.now());
          }
        };
        const handler = (data: Buffer, topic: string) => {
          if (generation !== this.generation) return;
          if (this.now() < this.startedAt! || this.now() - this.startedAt! >= DUAL_CT_CAPTURE_MS) {
            this.stop('complete'); return;
          }
          // Cached get-replies are not fresh measurements. Only exact live property topics.
          if (topic !== `/app/device/property/${device.sn}` || !Buffer.isBuffer(data)) return;
          if (this.frames >= MAX_FRAMES) {
            this.stop('sample_limit'); return;
          }
          this.frames += 1;
          this.recordReceipt(deviceIndex, 'app_mqtt');
          if (data.length > 65536) {
            this.history.record(deviceIndex, 'app_mqtt', 'oversized', this.now());
            this.rejected += 1; return;
          }
          try {
            const text = data.toString('utf8').trimStart();
            if (text.startsWith('{')) {
              // A protobuf field-1 tag is a newline byte; its length can be 123
              // ("{"). Do not misclassify that valid binary frame as JSON.
              let json: unknown;
              try {
                json = JSON.parse(text);
              } catch {
                if (data[0] !== 10) throw new Error('invalid');
              }
              if (json !== undefined) {
                recordJson(json, 'app_json', false); return;
              }
            }
            const headers = decodeFrameHeaders(data);
            if (!headers.length || headers.length > 16) throw new Error('invalid');
            headers.forEach((header) => {
              if (!header.pdata || !Number.isInteger(header.cmdFunc) || !Number.isInteger(header.cmdId)
                || header.cmdFunc < 0 || header.cmdFunc > 65535 || header.cmdId < 0 || header.cmdId > 65535
                || (header.deviceSn && header.deviceSn !== device.sn)) throw new Error('invalid');
            });
            // Header metadata must survive unreadable/masked inner payloads.
            headers.forEach((header) => {
              if (header.cmdFunc === 254 && header.cmdId === 21) {
                this.preview.recordHeader(header.encType, header.candidateHeaderValid !== false, []);
                if (header.candidateHeaderValid === false) this.preview.noteUnavailable('invalid_header');
                else if (header.encType !== 0) this.preview.noteUnavailable(header.encType === undefined ? 'missing_encoding' : 'unsupported_encoding');
              }
            });
            const candidates = headers.map((header) => ({
              deviceIndex, cmdFunc: header.cmdFunc, cmdId: header.cmdId, fields: fields(header.pdata!),
            }));
            headers.forEach((header, index) => {
              if (header.cmdFunc === 254 && header.cmdId === 21 && header.candidateHeaderValid !== false) {
                this.preview.recordAdditionalFields(candidates[index].fields);
              }
            });
            for (const shape of candidates) {
              if (this.shapes.length < MAX_SHAPES && !this.shapes.some((item) => JSON.stringify(item) === JSON.stringify(shape))) {
                this.shapes.push(shape);
              }
            }
            // Candidate-only model/route policy; no decryption or cached-quota interpretation.
            if (device.modelCodes?.some((code) => code.field === 'productType' && code.code === 421)) {
              const receivedAt = this.now();
              for (const header of headers) {
                if (header.cmdFunc !== 254 || header.cmdId !== 21) continue;
                const policy = dualCtEncodingPolicy(header, 421, 'app_mqtt');
                if (!policy.basis) {
                  this.preview.noteUnavailable(policy.reason!); continue;
                }
                this.preview.observe(deviceIndex, header.pdata!, {
                  productType: 421,
                  cmdFunc: header.cmdFunc,
                  cmdId: header.cmdId,
                  source: 'app_mqtt',
                  encoding: 'plain',
                  encodingBasis: policy.basis,
                  receivedAt,
                  now: receivedAt,
                });
              }
            } else this.preview.noteUnavailable('model_unverified');
            this.history.record(deviceIndex, 'app_mqtt', 'protobuf', this.now());
          } catch {
            this.rejected += 1;
            this.history.record(deviceIndex, 'app_mqtt', 'unrecognised', this.now());
          }
        };
        let appAttached = false;
        if (device.appListed !== false) {
          this.bindings.push({ sn: device.sn, handler });
          // eslint-disable-next-line no-await-in-loop
          try {
            appAttached = await this.hooks.subscribe(device.sn, handler, active);
          } catch { /* Try independently authorised Developer path. */ }
          if (!active()) {
            if (appAttached) this.hooks.unsubscribe(device.sn, handler);
            return;
          }
        }
        this.routes.push({ deviceIndex, source: 'app_mqtt', status: appAttached ? 'listening' : 'unavailable' });
        this.history.record(deviceIndex, 'app_mqtt', appAttached ? 'listening' : 'unavailable', this.now());
        if (device.developerListed && this.hooks.probe) {
          // eslint-disable-next-line no-await-in-loop
          const probes = await this.hooks.probe(device.sn, active);
          if (!active()) return;
          for (const probe of probes.slice(0, 2)) {
            this.routes.push({ deviceIndex, source: probe.source, status: probe.status });
            this.history.record(deviceIndex, probe.source, probe.status, this.now());
            if (probe.data !== undefined) recordJson(probe.data, probe.source);
            else if (['empty', 'observed'].includes(probe.status)) this.recordReceipt(deviceIndex, probe.source);
          }
        }
        let developerAttached = false;
        if (device.developerListed && this.hooks.developerSubscribe) {
          const developerHandler = (data: Record<string, any>) => recordJson(data, 'developer_mqtt');
          this.developerBindings.push({ sn: device.sn, handler: developerHandler });
          // eslint-disable-next-line no-await-in-loop
          try {
            developerAttached = await this.hooks.developerSubscribe(device.sn, developerHandler, active);
          } catch { /* No private errors. */ }
          if (!active()) {
            if (developerAttached) this.hooks.developerUnsubscribe?.(device.sn, developerHandler);
            return;
          }
          this.routes.push({ deviceIndex, source: 'developer_mqtt', status: developerAttached ? 'listening' : 'unavailable' });
          this.history.record(deviceIndex, 'developer_mqtt', developerAttached ? 'listening' : 'unavailable', this.now());
        }
        if (!appAttached && !developerAttached && !device.developerListed) {
          this.stop('transport_unavailable'); return;
        }
      }
    } catch {
      if (generation === this.generation) this.stop('discovery_unavailable');
    }
  }

  snapshot(): Record<string, unknown> {
    const now = this.now();
    if ([...this.receipts.values()].some((row) => row.lastAt > now)) this.receipts.clear();
    const preview = this.previewSnapshot();
    const age = this.startedAt === null || this.now() < this.startedAt ? null : (this.now() - this.startedAt) / 1000;
    return {
      status: this.status,
      source: 'manual_account_discovery',
      captureWindowSec: DUAL_CT_CAPTURE_MS / 1000,
      captureAgeSec: age,
      completed: this.endedAt !== null,
      deviceCount: this.deviceCount,
      frames: this.frames,
      rejectedFrames: this.rejected,
      cleanupFailures: Math.min(65535, this.cleanupFailures),
      history: this.history.snapshot(this.now()),
      inventory: this.status === 'account_changed' || this.startedAt === null ? [] : dualCtInventorySnapshot(this.hooks.inventory?.()),
      selected: dualCtSelectedSnapshot(this.selected),
      jsonShapes: dualCtJsonShapesSnapshot(this.jsonShapes),
      routes: this.routes.map((route) => {
        const receipt = this.receipts.get(`${route.deviceIndex}:${route.source}`);
        return {
          ...route,
          ...dualCtReceiptSnapshot({
            receiptConfirmed: !!receipt,
            receivedPackets: receipt?.count,
            lastReceiptAgeSec: receipt ? (now - receipt.lastAt) / 1000 : null,
          }),
        };
      }),
      previewDiagnostics: this.preview.diagnostics(preview.reason),
      shapes: this.shapes.map((shape) => ({ ...shape, fields: shape.fields.map((field) => ({ ...field })) })),
      channelMapping: 'unverified',
      valuesCaptured: this.preview.hasCaptured(),
      valuesIncluded: false,
      pairingEnabled: false,
      contributesToEnergy: false,
      controlsEnabled: false,
    };
  }

  previewSnapshot() {
    const preview = this.preview.snapshot(this.now());
    if (preview.enabled && !preview.devices.length) {
      if (this.status === 'no_explicit_model') preview.reason = 'no_eligible_meter';
      else if (['stopped', 'account_changed'].includes(this.status)) preview.reason = this.status;
      else if (['transport_unavailable', 'discovery_unavailable'].includes(this.status)) preview.reason = 'capture_unavailable';
    }
    return preview;
  }
}
