'use strict';

// OFFLINE RESEARCH ONLY. This inspector is not imported by the app and has no
// transport, credentials, encoder or command writer. It examines public bytes
// independently of the runtime field map so unsupported fields remain visible.
const { decodeFrameHeaders, parseStreamAc5000Frame } = require('../../.homeybuild/lib/streamAc5000Protocol');
const captures = require('../fixtures/stream5000ContractAudit.json');

function varint(buffer, start) {
  let value = 0n;
  for (let index = 0; index < 10; index += 1) {
    const position = start + index;
    if (position >= buffer.length) throw new RangeError('Truncated varint');
    const byte = buffer[position];
    if (index === 9 && byte > 1) throw new RangeError('Oversized varint');
    value |= BigInt(byte & 127) << BigInt(index * 7);
    if (!(byte & 128)) return { value, next: position + 1 };
  }
  throw new RangeError('Oversized varint');
}

function fields(buffer) {
  const result = [];
  let position = 0;
  while (position < buffer.length) {
    const tag = varint(buffer, position);
    const number = Number(tag.value >> 3n);
    const wire = Number(tag.value & 7n);
    if (!number || number > 536870911) throw new RangeError('Invalid field number');
    position = tag.next;
    if (wire === 0) {
      const scalar = varint(buffer, position);
      result.push({ number, wire, value: Number(scalar.value) });
      position = scalar.next;
    } else {
      let length;
      if (wire === 2) {
        const size = varint(buffer, position);
        if (size.value > BigInt(buffer.length)) throw new RangeError('Invalid field size');
        length = Number(size.value);
        position = size.next;
      } else if (wire === 5) length = 4;
      else if (wire === 1) length = 8;
      else throw new RangeError('Unsupported wire type');
      if (position + length > buffer.length) throw new RangeError('Truncated field');
      const bytes = buffer.subarray(position, position + length);
      const value = wire === 5 ? bytes.readFloatLE() : wire === 1 ? bytes.readDoubleLE() : bytes;
      result.push({ number, wire, value });
      position += length;
    }
  }
  return result;
}

function entry(buffer, number) { return fields(buffer).find((field) => field.number === number); }
function child(buffer, number) {
  const found = entry(buffer, number);
  return found?.wire === 2 ? found.value : undefined;
}
function scalar(buffer, number) {
  if (!buffer) return undefined;
  const found = entry(buffer, number);
  return found && found.wire !== 2 && Number.isFinite(found.value) ? found.value : undefined;
}
function headers(frame, command = '254/39') {
  return decodeFrameHeaders(Buffer.from(frame.hex, 'hex'))
    .filter((header) => `${header.cmdFunc}/${header.cmdId}` === command);
}
function config(frame, command = '254/39') {
  return headers(frame, command).map((header) => child(header.pdata, 10)).filter(Boolean)
    .map((buffer) => Object.fromEntries(fields(buffer).filter((field) => field.wire === 0)
      .map((field) => [field.number, field.value])));
}

function taskLists(frame) {
  const lists = [];
  for (const header of headers(frame)) {
    for (const group of fields(header.pdata).filter((field) => field.number === 40 && field.wire === 2)) {
      const tasks = fields(group.value).filter((field) => field.number === 1 && field.wire === 2)
        .map(({ value: task }) => {
          const charge = child(task, 8);
          const chargeSettings = charge ? child(charge, 3) : undefined;
          const discharge = child(task, 9);
          const window = child(task, 7);
          const packed = window?.length ? varint(window, 0) : undefined;
          const packedValue = packed && packed.next === window.length ? Number(packed.value) : undefined;
          return {
            slot: scalar(task, 2), enabled: Boolean(scalar(task, 3) ?? 0),
            ...(packedValue === undefined ? {} : {
              startMinute: packedValue & 65535, endMinute: Math.floor(packedValue / 65536),
            }),
            ...(chargeSettings ? { chargeW: scalar(chargeSettings, 3) ?? 0,
              chargeTargetSoc: scalar(chargeSettings, 2) } : {}),
            ...(discharge ? { dischargeW: scalar(discharge, 1) ?? 0 } : {}),
          };
        });
      lists.push(tasks);
    }
  }
  // No list is undefined/unchanged, unlike an explicit empty list.
  return lists.length ? lists : undefined;
}

function socketBalances() {
  const samples = [];
  for (const frame of captures.captures.es22SocketBattery.frames) {
    for (const header of headers(frame)) {
      const flow = child(header.pdata, 12);
      if (!flow || !(scalar(flow, 19) > 0)) continue;
      const incoming = [2, 7, 9].reduce((sum, number) => sum + (scalar(flow, number) ?? 0), 0);
      const outgoing = [4, 5, 19].reduce((sum, number) => sum + (scalar(flow, number) ?? 0), 0);
      const runtime = parseStreamAc5000Frame(Buffer.from(frame.hex, 'hex'));
      samples.push({ sourceFrameIndex: frame.sourceFrameIndex, time: frame.ts_iso,
        batteryToSocketW: scalar(flow, 19), expectedBatteryW: incoming - outgoing,
        runtimeBatteryW: runtime?.battW, discrepancyW: (runtime?.battW ?? 0) - (incoming - outgoing) });
    }
  }
  return samples;
}

function audit() {
  return {
    evidence: 'public masked captures; offline inspection, not Homey hardware acceptance',
    commit: captures.provenance.commit,
    fixtureFrameCount: Object.values(captures.captures).reduce((sum, group) => sum + group.frames.length, 0),
    es22GridInputWriteWatts: captures.captures.es22GridInputWrites.frames.flatMap((frame) => config(frame, '254/38')),
    es22GridInputReadback: config(captures.captures.es22GridInputReadback.frames[0]),
    es21OutputWrite: config(captures.captures.es21OutputWrites.frames[1], '254/38'),
    es21OutputReadback: config(captures.captures.es21OutputWrites.frames[2]),
    taskReadbacks: captures.captures.es22Tasks.frames.map(taskLists),
    taskDeletion: captures.captures.es22TaskDeletion.frames.map((frame) => ({ role: frame.role, lists: taskLists(frame) })),
    socketBalanceSamples: socketBalances(),
    runtimeConfigurationSupport: 'read-only session diagnostics; no controls or hardware acceptance',
    unresolved: ['ES21 grid-input control behaviour', 'model-specific safe input limits',
      'mixed-generation stable membership and capacity', 'expansion, Gateway and 3000 identity/protocol'],
    commandWritesSent: 0,
  };
}

module.exports = { fields, config, taskLists, socketBalances, audit };
if (require.main === module) console.log(JSON.stringify(audit(), null, 2));
