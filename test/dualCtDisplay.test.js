'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { dualCtDisplayValue: display } = require('../.homeybuild/lib/dualCtDisplay');
const { DualCtMonitor } = require('../.homeybuild/lib/dualCtMonitor');
const { DualCtDevicePreview } = require('../.homeybuild/lib/dualCtDevicePreview');
const { verifiedDualCtContract } = require('../.homeybuild/lib/dualCtChannels');
const { dualCtReleaseReadiness } = require('../.homeybuild/lib/dualCtReadiness');
const { varint, scalar, context } = require('./helpers/dualCtSynthetic');
const manifest = require('../drivers/smartmeter_dual_ct_preview/driver.compose.json');
const en = require('../locales/en.json').dual_ct_preview;
const scope = { account:'synthetic-account', device:'SYNTHETICDUALCT01', session:'synthetic-session' };
const topic = `/app/device/property/${scope.device}`;
const text = key => en[key] || key;
const nested = (field, data) => Buffer.concat([varint(field*8+2),varint(data.length),data]);
const integer = (field,value) => Buffer.concat([varint(field*8),varint(value)]);
const frame = bytes => nested(1,Buffer.concat([nested(1,bytes),integer(6,0),integer(8,254),integer(9,21)]));

test('all eighteen observed phase fields use the correct SI units and sensible display precision', () => {
  for(const field of [962,963,772,991,992,993])assert.equal(display(field,-125.678),'-125.7 W');
  for(const field of [956,957,771,985,986,987])assert.equal(display(field,234.567),'234.6 V');
  for(const field of [958,959,784,988,989,990])assert.equal(display(field,-1.23456),'-1.235 A');
  assert.equal(display(962,0),'0.0 W');assert.equal(display(988,-0),'0.000 A');
});

test('display formatting preserves tiny nonzero signs and cannot assign phase units to totals or counter fields', () => {
  assert.equal(display(962,-0.00001),'-1E-5 W');
  assert.equal(display(988,0.0000001),'1E-7 A');
  for(const field of [515,998,773,997,1,999999])assert.equal(display(field,123),null);
  for(const bad of [NaN,Infinity,-Infinity,undefined,null,'12'])assert.equal(display(956,bad),null);
});

test('EN/DE/NL decimal formatting is bounded and invalid locale data falls back safely', () => {
  assert.equal(display(956,234.567,'en-GB'),'234.6 V');
  assert.equal(display(956,234.567,'de-DE'),'234,6 V');
  assert.equal(display(988,-0.15966,'nl-NL'),'-0,160 A');
  for(const locale of ['unknown',{},null,undefined])assert.equal(display(956,234.567,locale),'234.6 V');
});

test('formatting does not round decoder/cache values or turn asynchronous phases into a coherent total', () => {
  const raw = new DualCtDevicePreview(scope);const monitor = new DualCtMonitor(scope);
  const bytes=Buffer.concat([scalar(956,234.567),scalar(962,12.346),scalar(988,-0.15966),scalar(515,700.123)]);
  assert.equal(raw.observe(scope,bytes,context(1000)),true);
  assert.equal(monitor.observe(frame(bytes),topic,1000),true);
  assert.equal(raw.snapshot(1000).banks[0].readings.find(r=>r.field===956).value,Math.fround(234.567));
  let view=monitor.snapshot(1000,text);
  assert.match(view.values['dual_ct_preview_fields.a_voltage'],/956: 234\.6 V \(0s\)/);
  assert.match(view.values['dual_ct_preview_fields.a_voltage'],/957: not observed/);
  assert.equal(view.values['dual_ct_preview_total.a'],Math.fround(700.123),'no rounded total or sum of mixed phase cache');
  assert.equal(view.values['dual_ct_preview_total.b'],null);
  assert.equal(monitor.observe(frame(scalar(957,240.4)),topic,38000),true);
  view=monitor.snapshot(38000,text);
  assert.match(view.values['dual_ct_preview_fields.a_voltage'],/956: 234\.6 V \(37s\)/);
  assert.match(view.values['dual_ct_preview_fields.a_voltage'],/957: 240\.4 V \(0s\)/);
  view=monitor.snapshot(91000,text);
  assert.match(view.values['dual_ct_preview_fields.a_voltage'],/956: stale \(90s\)/);
  assert.doesNotMatch(view.values['dual_ct_preview_fields.a_voltage'],/234\.6/);
  assert.match(view.values['dual_ct_preview_fields.a_voltage'],/957: 240\.4 V \(53s\)/);
  assert.equal(view.values['dual_ct_preview_total.a'],null);
});

test('translated monitor readouts keep signed units, individual ages and genuine zero distinct from missing', () => {
  for(const language of ['en','de','nl']) {
    const locale=require(`../locales/${language}.json`).dual_ct_preview;
    const monitor=new DualCtMonitor(scope);
    monitor.observe(frame(Buffer.concat([scalar(991,-27.654),scalar(988,0)])),topic,1000);
    const view=monitor.snapshot(2000,key=>locale[key] || key);
    assert.match(view.values['dual_ct_preview_fields.b_power'],language==='en' ? /991: -27\.7 W \(1s\)/ : /991: -27,7 W \(1s\)/);
    assert.match(view.values['dual_ct_preview_fields.b_current'],language==='en' ? /988: 0\.000 A \(1s\)/ : /988: 0,000 A \(1s\)/);
    assert.ok(view.values['dual_ct_preview_fields.b_current'].includes(`989: ${locale.missing}`));
  }
});

test('CT labels update presentation only, preserve paired identifiers and keep verified/Energy/Flow gates closed', () => {
  const previous=['dual_ct_preview_status','dual_ct_preview_age','dual_ct_preview_total.a','dual_ct_preview_total.b',
    'dual_ct_preview_fields.a_power','dual_ct_preview_fields.a_voltage','dual_ct_preview_fields.a_current',
    'dual_ct_preview_fields.b_power','dual_ct_preview_fields.b_voltage','dual_ct_preview_fields.b_current','dual_ct_preview_counters','dual_ct_preview_trends'];
  assert.deepEqual(manifest.capabilities.filter(id=>previous.includes(id)),previous);
  for(const language of ['en','de','nl']) {
    const locale=require(`../locales/${language}.json`).dual_ct_preview;
    for(const [bank,port] of [['a','CT1'],['b','CT2']])for(const quantity of ['power','voltage','current']) {
      const id=`dual_ct_preview_fields.${bank}_${quantity}`;
      assert.ok(manifest.capabilitiesOptions[id].title[language].startsWith(port+' '));
      assert.equal(manifest.capabilitiesOptions[id].preventTag,true);
      assert.equal(manifest.capabilitiesOptions[id].preventInsights,true);
    }
    assert.ok(locale.warning.includes('CT1/CT2'));assert.ok(locale.warning.includes('V/A/W'));
    assert.ok(locale.pair_warning.includes('CT1/CT2'));assert.ok(locale.pair_warning.includes('V/A/W'));
  }
  assert.equal(manifest.energy,undefined);assert.equal(manifest.flow,undefined);assert.equal(manifest.class,'other');
  assert.equal(verifiedDualCtContract({productType:421,communityObserved:true}),null);
  assert.equal(dualCtReleaseReadiness().contractRegistered,false);
  assert.equal(dualCtReleaseReadiness().contributesToEnergy,false);
  assert.equal(dualCtReleaseReadiness().controlsEnabled,false);
});

test('counter warning and individual receipt ages survive partial updates without assigning units, periods or circuit roles', () => {
  const monitor=new DualCtMonitor(scope);
  const counter=rows=>nested(773,Buffer.concat(rows.map(([field,value])=>scalar(field,value))));
  monitor.observe(frame(Buffer.concat([scalar(956,230),counter([[1,-20],[2,5],[3,40],[4,200],[6,175],[7,25]])])),topic,1000);
  monitor.observe(frame(Buffer.concat([scalar(957,231),counter([[4,201],[6,176]])])),topic,11000);
  let view=monitor.snapshot(11000,text);
  assert.ok(view.values.dual_ct_preview_counters.startsWith(en.counter_warning+' — '));
  assert.match(view.values.dual_ct_preview_counters,/773\.1: -20 \(10s\)/);
  assert.match(view.values.dual_ct_preview_counters,/773\.4: 201 \(0s\)/);
  assert.match(view.values.dual_ct_preview_trends,/4: increased \(raw\) \(0s\)/);
  assert.match(view.values.dual_ct_preview_trends,/1: baseline only \(10s\)/);
  assert.doesNotMatch(view.values.dual_ct_preview_counters,/kWh|\bWh\b|CT1|CT2|daily|production/);
  monitor.observe(frame(scalar(957,232)),topic,90000);
  view=monitor.snapshot(91000,text);
  assert.doesNotMatch(view.values.dual_ct_preview_counters,/773\.(1|2|3|7):/);
  assert.match(view.values.dual_ct_preview_counters,/773\.4: 201 \(80s\)/);
  assert.match(view.values.dual_ct_preview_trends,/4: increased \(raw\) \(80s\)/);
  assert.equal(view.nextExpiryMs,10000,'counter expiry remains independent of later scalar traffic');
  view=monitor.snapshot(101000,text);
  assert.equal(view.values.dual_ct_preview_counters,en.missing_stale);
  assert.equal(view.values.dual_ct_preview_trends,en.missing_stale);
  assert.equal(view.recent,true,'recent scalar does not make expired counters current');
});

test('counter caveat is localized and clearing/restart cannot restore old counter ages or values', () => {
  for(const language of ['en','de','nl']) {
    const locale=require(`../locales/${language}.json`).dual_ct_preview;
    const monitor=new DualCtMonitor(scope);
    const bytes=Buffer.concat([scalar(956,230),nested(773,scalar(1,0))]);
    monitor.observe(frame(bytes),topic,1000);
    const view=monitor.snapshot(2000,key=>locale[key] || key);
    assert.ok(view.values.dual_ct_preview_counters.startsWith(locale.counter_warning+' — '));
    assert.match(view.values.dual_ct_preview_counters,/773\.1: 0 \(1s\)/);
    monitor.clear();
    assert.equal(monitor.snapshot(2001,key=>locale[key] || key).values.dual_ct_preview_counters,locale.missing_stale);
  }
});
