'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { parseStreamAc5000Frame, decodeFrameHeaders } = require('../.homeybuild/lib/streamAc5000Protocol.js');
const { mapStreamAc5000, createStreamAc5000Mapper, chargingState } = require('../.homeybuild/lib/streamAc5000Mapping.js');
const captures = require('./fixtures/stream5000Telemetry.json');

// --- minimal protobuf encoder, used only to build deterministic fixtures -----

function varint(value) {
  let v = BigInt(value);
  if (v < 0n) v += 1n << 64n; // protobuf encodes negatives as 64-bit two's complement
  const bytes = [];
  do {
    let byte = Number(v & 0x7fn);
    v >>= 7n;
    if (v > 0n) byte |= 0x80;
    bytes.push(byte);
  } while (v > 0n);
  return Buffer.from(bytes);
}

const tag = (field, wire) => varint((field << 3) | wire);
const vField = (field, value) => Buffer.concat([tag(field, 0), varint(value)]);
const fField = (field, value) => {
  const buf = Buffer.alloc(4);
  buf.writeFloatLE(value, 0);
  return Buffer.concat([tag(field, 5), buf]);
};
const dField = (field, value) => {
  const buf = Buffer.alloc(8);
  buf.writeDoubleLE(value, 0);
  return Buffer.concat([tag(field, 1), buf]);
};
const lField = (field, payload) => Buffer.concat([tag(field, 2), varint(payload.length), payload]);
const sField = (field, text) => lField(field, Buffer.from(text, 'utf8'));

/** Wrap one or more (cmdFunc, cmdId, pdata) messages in an EcoFlow frame. */
function frame(messages) {
  return Buffer.concat(messages.map(({ cmdFunc, cmdId, pdata, sn }) => lField(1, Buffer.concat([
    lField(1, pdata),
    vField(8, cmdFunc),
    vField(9, cmdId),
    ...(sn ? [sField(25, sn)] : []),
  ]))));
}

const SN = 'ES22ZEB1ABCD0001';

// --- header decoding ---------------------------------------------------------

test('decodeFrameHeaders reads cmd_func, cmd_id, serial and pdata', () => {
  const pdata = lField(11, vField(5, 42));
  const headers = decodeFrameHeaders(frame([{
    cmdFunc: 254, cmdId: 39, pdata, sn: SN,
  }]));
  assert.strictEqual(headers.length, 1);
  assert.strictEqual(headers[0].cmdFunc, 254);
  assert.strictEqual(headers[0].cmdId, 39);
  assert.strictEqual(headers[0].deviceSn, SN);
  assert.deepStrictEqual(headers[0].pdata, pdata);
});

// --- 254/39 telemetry --------------------------------------------------------

test('254/39 decodes node totals, the flow matrix and the meter', () => {
  const pdata = Buffer.concat([
    // f11 node totals — half-watt units, except f11.9 which is watts.
    lField(11, Buffer.concat([vField(1, 1200), vField(5, 63), fField(9, 250.5)])),
    // f12 flow matrix — watts. 12.5/12.7 are omitted and must zero-fill.
    lField(12, Buffer.concat([vField(4, 300), vField(6, 200)])),
    // f15 Tibber Pulse meter, signed net (positive on import).
    lField(15, fField(3, 512.5)),
    // f33 precise SoC.
    lField(33, fField(6, 62.75)),
  ]);
  const t = parseStreamAc5000Frame(frame([{
    cmdFunc: 254, cmdId: 39, pdata, sn: SN,
  }]));

  assert.strictEqual(t.homeW, 600); // 1200 half-watts
  assert.strictEqual(t.socPct, 63);
  assert.strictEqual(t.socPrecisePct, 62.75);
  assert.strictEqual(t.solarW, 250.5);
  assert.strictEqual(t.homeFromBattW, 300);
  assert.strictEqual(t.homeFromGridW, 200);
  assert.strictEqual(t.gridW, 512.5);
  // Derived, non-negative grid edges.
  assert.strictEqual(t.gridImportPowerW, 200); // home-from-grid + grid-to-batt(0)
  assert.strictEqual(t.gridExportPowerW, 0);
  // Signed battery power: into - out of the pack. Discharging here.
  assert.strictEqual(t.battW, -300);
  assert.strictEqual(t.battChargePowerW, 0);
  assert.strictEqual(t.battDischargePowerW, 300);
});

test('254/39 decodes the V1.1.4.35 SoC fallback from a live redacted frame', () => {
  // Submitted by an ES22 tester. The serial was replaced with asterisks before
  // the frame entered the diagnostic log; the two fallback fields both read 99.
  const captured = Buffer.from(
    'CoABCl9yBijEBjjDBuICCRDYBSiG+BI4CZIDKgooChAqKioqKioqKioqKioqKioqFQAAxkIlvFPRQygCNWTPz8M9vFPRw7IDGwoZChAqKioqKioqKioqKioqKioqEGMYACDEBhACGCAgASgBOANA/gFIJ1BfWAFw4crtAXiBmAKAAQM=',
    'base64',
  );
  assert.deepStrictEqual(parseStreamAc5000Frame(captured), { unitRecordCount: 1, singleUnitSocPct: 99 });
  assert.strictEqual(mapStreamAc5000(parseStreamAc5000Frame(captured)).measure_battery, 99);
});

test('system SoC is not refined by unit SoC or serial-keyed fallbacks', () => {
  const fallbackBlocks = Buffer.concat([
    lField(50, lField(1, fField(2, 81))),
    lField(54, lField(1, vField(2, 82))),
  ]);
  assert.strictEqual(
    parseStreamAc5000Frame(frame([{ cmdFunc: 254, cmdId: 39, pdata: fallbackBlocks }])).singleUnitSocPct,
    81,
  );

  const withOriginal = Buffer.concat([
    lField(11, vField(5, 77)),
    fallbackBlocks,
    lField(33, fField(6, 75.4)),
  ]);
  const telemetry = parseStreamAc5000Frame(frame([{ cmdFunc: 254, cmdId: 39, pdata: withOriginal }]));
  assert.strictEqual(telemetry.socPct, 77);
  assert.ok(Math.abs(telemetry.socPrecisePct - 75.4) < 0.001);
  assert.strictEqual(mapStreamAc5000(telemetry).measure_battery, 77);
});

test('254/39 derives a positive battery power while charging, including solar', () => {
  const pdata = lField(12, Buffer.concat([
    vField(4, 0), // home from battery
    vField(5, 0), // battery to grid
    vField(6, 150), // home from grid
    vField(7, 400), // grid to battery
    vField(9, 250), // solar to battery
    vField(10, 50), // solar to grid
  ]));
  const t = parseStreamAc5000Frame(frame([{ cmdFunc: 254, cmdId: 39, pdata }]));
  assert.strictEqual(t.battW, 650); // 400 + 250 charging in
  assert.strictEqual(t.battChargePowerW, 650);
  assert.strictEqual(t.battDischargePowerW, 0);
  assert.strictEqual(t.gridImportPowerW, 550); // 150 + 400
  assert.strictEqual(t.gridExportPowerW, 50); // 0 + solar-to-grid
});

test('a negative meter reading (export) decodes as a signed grid power', () => {
  const pdata = lField(15, fField(3, -419));
  const t = parseStreamAc5000Frame(frame([{ cmdFunc: 254, cmdId: 39, pdata }]));
  assert.strictEqual(t.gridW, -419);
});

test('the EcoFlow P1 meter variant reports its net on f16.16', () => {
  const pdata = lField(16, fField(16, 813.5));
  const t = parseStreamAc5000Frame(frame([{ cmdFunc: 254, cmdId: 39, pdata }]));
  assert.strictEqual(t.gridW, 813.5);
});

test('an absent f12 group leaves the battery power unset (delta frame)', () => {
  const pdata = lField(11, vField(5, 55));
  const t = parseStreamAc5000Frame(frame([{ cmdFunc: 254, cmdId: 39, pdata }]));
  assert.strictEqual(t.socPct, 55);
  assert.strictEqual(t.battW, undefined);
  assert.strictEqual(t.gridImportPowerW, undefined);
  assert.strictEqual(t.gridExportPowerW, undefined);
});

test('a present f12 group zero-fills its omitted edges', () => {
  const pdata = lField(12, vField(6, 900));
  const t = parseStreamAc5000Frame(frame([{ cmdFunc: 254, cmdId: 39, pdata }]));
  assert.strictEqual(t.homeFromBattW, 0);
  assert.strictEqual(t.homeFromGridW, 900);
  assert.strictEqual(t.battW, 0);
  assert.strictEqual(t.gridImportPowerW, 900);
  assert.strictEqual(t.gridExportPowerW, 0);
});

test('undeclared length-delimited fields are skipped, not descended into', () => {
  // f23.3 carries a timezone string on real hardware; walking into it used to
  // invent numeric fields. It must not contribute anything.
  const pdata = Buffer.concat([
    lField(23, sField(3, 'Europe/Amsterdam')),
    lField(33, fField(6, 61.5)),
  ]);
  const t = parseStreamAc5000Frame(frame([{ cmdFunc: 254, cmdId: 39, pdata }]));
  assert.deepStrictEqual(Object.keys(t), ['socPrecisePct']);
  assert.strictEqual(t.socPrecisePct, 61.5);
});

test('a present f11 group zero-fills the solar total', () => {
  // An omitted scalar inside a message that was sent is zero by definition;
  // without this a PV reading would hold its last daylight value all night.
  const t = parseStreamAc5000Frame(frame([{
    cmdFunc: 254, cmdId: 39, pdata: lField(11, vField(5, 44)),
  }]));
  assert.strictEqual(t.socPct, 44);
  assert.strictEqual(t.solarW, 0);
  assert.strictEqual(t.acSocketW, 0);
});

// --- 32/50 BMS heartbeat and 32/2 limits ------------------------------------

test('32/50 decodes the BMS heartbeat, including a negative current', () => {
  const pdata = Buffer.concat([
    vField(7, 52300), // mV
    vField(8, -1500), // mA, discharging
    vField(9, 24), // °C
    vField(15, 98), // SoH %
  ]);
  const t = parseStreamAc5000Frame(frame([{ cmdFunc: 32, cmdId: 50, pdata }]));
  assert.strictEqual(t.battVoltageV, 52.3);
  assert.strictEqual(t.bmsCurrentA, -1.5);
  assert.strictEqual(t.battTempC, 24);
  assert.strictEqual(t.bmsSohPct, 98);
});

test('32/2 decodes the SoC limits', () => {
  const pdata = lField(1, Buffer.concat([vField(7, 90), vField(21, 20)]));
  const t = parseStreamAc5000Frame(frame([{ cmdFunc: 32, cmdId: 2, pdata }]));
  assert.strictEqual(t.maxChargeSocPct, 90);
  assert.strictEqual(t.minDischargeSocPct, 20);
});

test('a bundled frame merges every recognised message', () => {
  const f = frame([
    { cmdFunc: 254, cmdId: 39, pdata: lField(11, vField(5, 71)) },
    { cmdFunc: 32, cmdId: 50, pdata: Buffer.concat([vField(9, 21), vField(15, 97)]) },
    // An unrecognised command contributes nothing but must not break the bundle.
    { cmdFunc: 53, cmdId: 77, pdata: vField(1, 1) },
  ]);
  const t = parseStreamAc5000Frame(f);
  assert.strictEqual(t.socPct, 71);
  assert.strictEqual(t.battTempC, 21);
  assert.strictEqual(t.bmsSohPct, 97);
});

test('double-encoded scalars decode too', () => {
  const pdata = lField(11, dField(1, 2400));
  const t = parseStreamAc5000Frame(frame([{ cmdFunc: 254, cmdId: 39, pdata }]));
  assert.strictEqual(t.homeW, 1200);
});

// --- robustness --------------------------------------------------------------

test('unparseable, empty and unknown frames return null', () => {
  assert.strictEqual(parseStreamAc5000Frame(Buffer.alloc(0)), null);
  assert.strictEqual(parseStreamAc5000Frame(Buffer.from([0xff, 0xff, 0xff, 0xff])), null);
  assert.strictEqual(parseStreamAc5000Frame(Buffer.from('{"not":"protobuf"}', 'utf8')), null);
  assert.strictEqual(parseStreamAc5000Frame(frame([{ cmdFunc: 53, cmdId: 77, pdata: vField(1, 1) }])), null);
  assert.strictEqual(parseStreamAc5000Frame(frame([{ cmdFunc: 254, cmdId: 39, pdata: Buffer.alloc(0) }])), null);
});

test('a truncated payload does not throw', () => {
  const good = frame([{ cmdFunc: 254, cmdId: 39, pdata: lField(11, vField(5, 50)) }]);
  for (let cut = 1; cut < good.length; cut += 1) {
    assert.doesNotThrow(() => parseStreamAc5000Frame(good.subarray(0, cut)));
  }
});

// --- capability mapping ------------------------------------------------------

test('mapStreamAc5000 exposes only the verified core capabilities', () => {
  const pdata = Buffer.concat([
    lField(11, Buffer.concat([vField(1, 1200), vField(5, 63)])),
    lField(12, Buffer.concat([vField(4, 300), vField(6, 200)])),
    lField(15, fField(3, 512.5)),
    lField(33, fField(6, 62.75)),
  ]);
  const t = parseStreamAc5000Frame(frame([
    { cmdFunc: 254, cmdId: 39, pdata },
  ].concat([{ cmdFunc: 32, cmdId: 50, pdata: Buffer.concat([vField(9, 24), vField(15, 98)]) }])));

  assert.deepStrictEqual(mapStreamAc5000(t), {
    measure_battery: 63,
    battery_soh: 98,
    measure_temperature: 24,
    measure_power: -300,
    battery_charging_state: 'discharging',
    'measure_power.load': 600,
    'measure_power.grid': 512.5,
    'measure_power.grid_import': 200,
    'measure_power.grid_export': 0,
  });
});

test('mapStreamAc5000 omits capabilities the frame did not carry', () => {
  assert.deepStrictEqual(mapStreamAc5000({ socPct: 40 }), { measure_battery: 40 });
  assert.deepStrictEqual(mapStreamAc5000({}), {});
});

test('mapStreamAc5000 separates system and precise unit SoC and rejects impossible telemetry', () => {
  assert.strictEqual(mapStreamAc5000({ socPct: 60, socPrecisePct: 62.6 }).measure_battery, 60);
  assert.strictEqual(mapStreamAc5000({ socPct: 60, socPrecisePct: 62.6 }, { scope: 'unit' }).measure_battery, 63);
  assert.strictEqual(mapStreamAc5000({ socPrecisePct: 120 }).measure_battery, undefined);
  assert.strictEqual(mapStreamAc5000({ socPrecisePct: -5 }).measure_battery, undefined);
  assert.strictEqual(mapStreamAc5000({ bmsSohPct: 101 }).battery_soh, undefined);
  assert.strictEqual(mapStreamAc5000({ battTempC: 900 }).measure_temperature, undefined);
  assert.strictEqual(mapStreamAc5000({ battW: 100001 }).measure_power, undefined);
  assert.strictEqual(mapStreamAc5000({ gridImportPowerW: -1 })['measure_power.grid_import'], undefined);
});

test('the tester discharging snapshot reconciles across EcoFlow and Homey', () => {
  assert.deepStrictEqual(mapStreamAc5000({
    socPct: 81,
    battW: -381,
    homeW: 380,
    gridW: -1,
    gridImportPowerW: 0,
    gridExportPowerW: 1,
    battTempC: 36,
    bmsSohPct: 100,
  }), {
    measure_battery: 81,
    battery_soh: 100,
    measure_temperature: 36,
    measure_power: -381,
    battery_charging_state: 'discharging',
    'measure_power.load': 380,
    'measure_power.grid': -1,
    'measure_power.grid_import': 0,
    'measure_power.grid_export': 1,
  });
});

test('chargingState applies a deadband around zero', () => {
  assert.strictEqual(chargingState(50), 'charging');
  assert.strictEqual(chargingState(-50), 'discharging');
  assert.strictEqual(chargingState(0), 'idle');
  assert.strictEqual(chargingState(3), 'idle');
  assert.strictEqual(chargingState(-3), 'idle');
});

// Public, masked hardware captures. Expectations are scoped; never derive
// installation SoC by averaging units or installation power by summing them.
test('linked ES22 capture keeps system 76% distinct from units 87% and 65%', () => {
  const { unit_a: a, unit_b: b } = captures.pair;
  const systemMapper = createStreamAc5000Mapper(a, 'system');
  const unitAMapper = createStreamAc5000Mapper(a, 'unit');
  const unitBMapper = createStreamAc5000Mapper(b, 'unit');
  const expectedPower = [[829, 0], [817, 0], [57, 400], [41, 420], [0, 550], [0, 689]];
  for (const [index, captured] of captures.pair.frames.entries()) {
    const t = parseStreamAc5000Frame(frame([{
      cmdFunc: 254, cmdId: 39, pdata: Buffer.from(captured.pdata_hex, 'hex'), sn: a,
    }]));
    assert.equal(systemMapper(t).measure_battery, 76);
    assert.equal(unitAMapper(t).measure_battery, 87);
    assert.equal(unitBMapper(t).measure_battery, 65);
    assert.equal(t.unitsBySn[a].batteryPowerRawW, expectedPower[index][0]);
    assert.equal(unitAMapper(t).measure_power, null);
    assert.equal(t.unitsBySn[b].batteryPowerRawW, expectedPower[index][1]);
    assert.equal(unitBMapper(t).measure_power, null);
    assert.equal(t.unitsBySn[a].socPct, 87);
    assert.equal(t.unitsBySn[b].socPct, 65);
  }
});

test('MPPT capture includes direct PV-to-battery charge without enabling ES21 pairing', () => {
  const { isSupportedStream5000Sn } = require('../.homeybuild/lib/stream5000Models');
  assert.equal(isSupportedStream5000Sn('ES21TESTUNITAAAA'), false);
  const expected = [438, 34, 28];
  for (const [index, captured] of captures.mppt.frames.entries()) {
    const t = parseStreamAc5000Frame(Buffer.from(captured.hex, 'hex'));
    assert.equal(t.battW, expected[index]);
    assert.equal(t.battChargePowerW, expected[index]);
    assert.equal(t.battDischargePowerW, 0);
  }
});

test('loaded AC socket capture includes grid-to-socket import; idle unit stays unchanged', () => {
  const expected = [554, 558, 553];
  for (const [index, captured] of captures.socket.loaded.entries()) {
    const t = parseStreamAc5000Frame(Buffer.from(captured.hex, 'hex'));
    assert.equal(t.gridImportPowerW, expected[index]);
  }
  assert.equal(parseStreamAc5000Frame(Buffer.from(captures.socket.loaded[0].hex, 'hex')).acSocketW, 355);
  const idle = parseStreamAc5000Frame(Buffer.from(captures.socket.idle[0].hex, 'hex'));
  assert.equal(idle.gridImportPowerW, 200);
});

test('real discharge capture proves f54 power must not supply a signed unit state', () => {
  const t = parseStreamAc5000Frame(Buffer.from(captures.discharge.frames[0].hex, 'hex'));
  const serial = Object.keys(t.unitsBySn)[0];
  assert.equal(t.battW, -536);
  assert.equal(t.unitsBySn[serial].batteryPowerRawW, 534.5, 'positive raw power during discharge');
  const unit = createStreamAc5000Mapper(serial, 'unit')(t);
  assert.equal(unit.measure_power, -536, 'single unit uses the verified signed flow matrix');
  assert.equal(unit.battery_charging_state, 'discharging');
});

test('new flow edges clear at idle but absent f12 remains a delta', () => {
  const parse = (pdata) => parseStreamAc5000Frame(frame([{ cmdFunc: 254, cmdId: 39, pdata }]));
  assert.equal(parse(lField(12, Buffer.concat([vField(2, 308), vField(9, 130)]))).battW, 438);
  assert.equal(parse(lField(12, vField(18, 354))).gridImportPowerW, 354);
  assert.equal(parse(lField(12, Buffer.alloc(0))).battW, 0);
  assert.equal(parse(lField(12, Buffer.alloc(0))).gridImportPowerW, 0);
  assert.equal(parse(lField(33, fField(6, 81))).battW, undefined);
});

test('serial-keyed f50 and f54 merge by identity, not by position', () => {
  const other = 'ES22TESTOTHER001';
  const pdata = Buffer.concat([
    lField(50, Buffer.concat([
      lField(1, Buffer.concat([sField(1, SN), fField(2, 81.4), fField(4, 9999)])),
      lField(1, Buffer.concat([sField(1, other), fField(2, 20.2)])),
    ])),
    lField(54, Buffer.concat([
      lField(1, Buffer.concat([sField(1, other), vField(2, 20), vField(4, 100)])),
      lField(1, Buffer.concat([sField(1, SN), vField(2, 81), vField(4, -600)])),
    ])),
  ]);
  const t = parseStreamAc5000Frame(frame([{ cmdFunc: 254, cmdId: 39, pdata }]));
  assert.equal(t.unitRecordCount, 2);
  assert.equal(t.singleUnitSocPct, undefined);
  assert.equal(mapStreamAc5000(t).measure_battery, undefined);
  assert.deepEqual(t.unitsBySn[SN], { socPrecisePct: Math.fround(81.4), socPct: 81, batteryPowerRawW: -300 });
  assert.equal(mapStreamAc5000(t, { scope: 'unit', serialNumber: SN }).measure_power, null);
  assert.equal(mapStreamAc5000(t, { scope: 'unit', serialNumber: other }).measure_power, null);
  assert.equal(mapStreamAc5000(t, { scope: 'unit', serialNumber: 'ES22UNLISTED' }).measure_power, null);
});

test('omitted unit power is not zero; explicit zero clears it and f50 latched power is ignored', () => {
  const parse = (fields) => parseStreamAc5000Frame(frame([{
    cmdFunc: 254, cmdId: 39, pdata: lField(54, lField(1, Buffer.concat([sField(1, SN), ...fields]))),
  }]));
  assert.equal(parse([vField(2, 80)]).unitsBySn[SN].batteryPowerRawW, undefined);
  assert.equal(parse([vField(4, 0)]).unitsBySn[SN].batteryPowerRawW, 0);
  const latched = parseStreamAc5000Frame(frame([{
    cmdFunc: 254, cmdId: 39, pdata: lField(50, lField(1, Buffer.concat([sField(1, SN), fField(4, 500)]))),
  }]));
  assert.equal(latched.unitsBySn[SN].batteryPowerRawW, undefined);
});

test('a malformed unit entry cannot replace its valid sibling', () => {
  const t = parseStreamAc5000Frame(frame([{
    cmdFunc: 254, cmdId: 39, pdata: lField(54, Buffer.concat([
      lField(1, Buffer.from([0xff])),
      lField(1, Buffer.concat([sField(1, SN), vField(4, -200)])),
    ])),
  }]));
  assert.equal(t.unitsBySn[SN].batteryPowerRawW, -100);
  assert.equal(t.unitRecordCount, 2, 'a corrupt sibling still rules out a singleton fallback');
});

test('mapper remembers system SoC and peer evidence across partial frames', () => {
  const system = createStreamAc5000Mapper(SN, 'system');
  assert.equal(system({ unitRecordCount: 1, singleUnitSn: SN, singleUnitSocPct: 81 }).measure_battery, 81);
  assert.equal(system({ socPct: 76, socPrecisePct: 87 }).measure_battery, 76);
  assert.equal(system({ unitRecordCount: 1, singleUnitSn: SN, singleUnitSocPct: 87 }).measure_battery, undefined);
  assert.equal(system({ socPrecisePct: 88 }).measure_battery, undefined);

  const unit = createStreamAc5000Mapper(SN, 'unit');
  assert.equal(unit({ battW: -300 }).measure_power, -300, 'retain legacy single-unit beta reading');
  assert.equal(unit({ unitRecordCount: 2, battW: -600 }).measure_power, null);
  assert.equal(unit({ battW: -900 }).measure_power, null, 'a delta cannot re-enable aggregate-as-unit power');
  assert.equal(unit({ unitsBySn: { [SN]: { batteryPowerRawW: 0 } } }).measure_power, null);
  assert.equal(createStreamAc5000Mapper(SN, 'unit')({ battW: -300 }).measure_power, -300, 'instances do not share state');
});

test('unit-only deltas and foreign serial headers cannot overwrite the installation', () => {
  const payload = frame([{ cmdFunc: 254, cmdId: 39, pdata: lField(33, fField(6, 91)), sn: SN }]);
  assert.equal(parseStreamAc5000Frame(payload, 'ES22ANOTHERUNIT'), null);
  assert.equal(mapStreamAc5000(parseStreamAc5000Frame(payload)).measure_battery, undefined);
  assert.equal(mapStreamAc5000(parseStreamAc5000Frame(payload), { scope: 'unit', serialNumber: SN }).measure_battery, 91);
});

test('aggregate power supports larger installations without relaxing unit sanity bounds', () => {
  assert.equal(mapStreamAc5000({ battW: 18000 }).measure_power, 18000);
  const unit = { battW: 18000 };
  assert.equal(mapStreamAc5000(unit, { scope: 'unit', serialNumber: SN, allowSystemPowerForUnit: true }).measure_power, undefined);
  for (const value of [NaN, Infinity, -Infinity, 100001, -100001]) {
    assert.equal(mapStreamAc5000({ battW: value }).measure_power, undefined);
  }
});
