'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { scalar, varint } = require('./helpers/dualCtSynthetic');
const { DualCtGridEnergySession } = require('../.homeybuild/lib/dualCtGridEnergySession');
const { DualCtGridEnergyDeviceAdapter } = require('../.homeybuild/lib/dualCtGridEnergyDeviceAdapter');
const { DualCtEnergyAuthority } = require('../.homeybuild/lib/dualCtEnergyAdoption');
const { dualCtGridBinding } = require('../.homeybuild/lib/dualCtGridEnergySource');
const scope = { account: 'synthetic', device: 'SYNTHETIC01', grid: 'property', session: 'one' };
const identity = { productType: 421, firmware: 'synthetic.1' };
const contract = { id: 'synthetic_contract', ...identity, channel: 'ct1', bank: 'A', unit: 'W', importSign: 'positive',
  timing: 'verified_live_receipt_estimate', encoding: 'explicit_zero', liveFreshnessValidated: true };
const msg = (f, b) => Buffer.concat([varint(f * 8 + 2), varint(b.length), b]);
const int = (f, n) => Buffer.concat([varint(f * 8), varint(n)]);
const payload = watts => msg(1, Buffer.concat([msg(1, Buffer.concat([[962, watts], [963, 0], [772, 0], [515, watts],
  [991, 900000], [992, 900000], [993, 900000]].map(([f, n]) => scalar(f, n)))), int(6, 0), int(8, 254), int(9, 21)]));
const topic = `/app/device/property/${scope.device}`;
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function harness(defaultGate = false, freshnessMs) {
  const selectedContract = freshnessMs ? { ...contract, freshnessMs } : contract;
  let now = 1000; let consent = true; let enabled = true; let saved = null; let storeWrites = 0;
  const events = []; const caps = new Map(); let available = false;
  const session = new DualCtGridEnergySession({ scope, identity, readIdentity: () => identity,
    storage: { read: async () => saved, write: async x => { storeWrites++; saved = { ...x }; } },
    authority: new DualCtEnergyAuthority(), now: () => now, resolveContract: () => selectedContract,
    review: () => ({ explicitConsent: consent, target: 'new_energy_device', accounting: 'power', binding: dualCtGridBinding(scope, selectedContract),
      grid: scope.grid, inventoryComplete: true, contributors: [], externalOverlapReviewed: true, contractQualified: true }) });
  const port = { setCapabilityValue: async (id, value) => { events.push(['cap', id, value]); caps.set(id, value); },
    setCapabilityOptions: async (...args) => { events.push(['options', ...args]); },
    setEnergy: async config => { events.push(['energy', config]); },
    setUnavailable: async status => { available = false; events.push(['unavailable', status]); },
    setAvailable: async () => { available = true; events.push(['available']); } };
  const adapter = defaultGate ? new DualCtGridEnergyDeviceAdapter(session, port, () => false) : new DualCtGridEnergyDeviceAdapter(session, port, () => enabled);
  return { adapter, session, port, events, caps, available: () => available, now: x => { now = x; }, revoke: () => { consent = false; },
    disable: () => { enabled = false; }, saved: () => saved, storeWrites: () => storeWrites,
    async sample(at, watts) { now = at; await adapter.observe(payload(watts), topic, at); } };
}

test('follow-on core expiry independently clears watts while unavailable and counter SDK writes are held', async () => {
  const h = harness(false, 5000); await h.adapter.start(); await h.sample(1000, 3600);
  const entered = deferred(); const release = deferred(); const unavailableEntered = deferred(); const unavailableRelease = deferred();
  const cap = h.port.setCapabilityValue; const unavailable = h.port.setUnavailable;
  let block = true; let statusCalls = 0; let nullCalls = 0;
  h.port.setCapabilityValue = async (id, value) => {
    if (block && id === 'meter_power.imported') { block = false; entered.resolve(); await release.promise; }
    if (id === 'measure_power' && value === null) nullCalls++;
    return cap(id, value);
  };
  const pending = h.sample(2000, 3600); await entered.promise;
  h.port.setUnavailable = async reason => {
    statusCalls++; unavailableEntered.resolve(); await unavailableRelease.promise; return unavailable(reason);
  };
  h.now(6000);
  const ticks = Array.from({ length: 100 }, () => h.adapter.refresh()); await unavailableEntered.promise;
  try {
    await new Promise(setImmediate);
    assert.equal(h.caps.get('measure_power'), null);
    assert.equal(statusCalls, 1); assert.equal(nullCalls, 1);
    assert(ticks.every(tick => tick === ticks[0]));
    assert.throws(() => h.adapter.currentPower());
    assert.equal(h.saved().importedWh, 1);
    unavailableRelease.resolve(); release.resolve(); await Promise.all([pending, ...ticks]);
    assert.equal(h.caps.get('measure_power'), 3600);
    assert.equal(h.available(), true);
    assert.equal(h.saved().importedWh, 1);
  } finally { unavailableRelease.resolve(); release.resolve(); await Promise.all([pending, ...ticks]); await h.adapter.close(); }
});

test('follow-on core stop dispatches invalidation before its counter SDK close barrier', async () => {
  const h = harness(false, 5000); await h.adapter.start(); await h.sample(1000, 3600);
  const entered = deferred(); const release = deferred(); const cap = h.port.setCapabilityValue; let block = true;
  h.port.setCapabilityValue = async (id, value) => {
    if (block && id === 'meter_power.imported') { block = false; entered.resolve(); await release.promise; }
    return cap(id, value);
  };
  const pending = h.sample(2000, 3600); await entered.promise;
  const closed = h.adapter.close();
  try {
    await new Promise(setImmediate);
    assert.equal(h.caps.get('measure_power'), null);
    assert.equal(h.available(), false);
    assert.throws(() => h.adapter.currentPower());
    assert.equal(h.saved().importedWh, 1);
  } finally { release.resolve(); await Promise.all([pending, closed]); }
});

test('follow-on core stop clears watts before checkpoint IO settles without releasing the writer', async () => {
  const h = harness(false, 5000); await h.adapter.start(); await h.sample(1000, 3600);
  const entered = deferred(); const release = deferred();
  const storage = h.session.options.storage; const write = storage.write;
  storage.write = async state => { entered.resolve(); await release.promise; return write(state); };
  const pending = h.sample(2000, 3600); await entered.promise;
  const closed = h.adapter.close();
  const owns = () => h.session.options.authority.owns(scope.grid, h.session.binding, h.session.owner);
  try {
    await new Promise(setImmediate);
    assert.equal(h.caps.get('measure_power'), null);
    assert.equal(owns(), true, 'UI invalidation cannot release a writer with checkpoint IO outstanding');
    assert.throws(() => h.adapter.currentPower());
  } finally { release.resolve(); await Promise.all([pending, closed]); }
  assert.equal(owns(), false);
  assert.equal(h.saved().importedWh, 1);
});

test('qualification withdrawal still clears watts despite a rejected unavailable write and held counter projection', async () => {
  const h = harness(false, 5000); await h.adapter.start(); await h.sample(1000, 3600);
  const entered = deferred(); const release = deferred(); const cap = h.port.setCapabilityValue; let block = true;
  h.port.setCapabilityValue = async (id, value) => {
    if (block && id === 'meter_power.imported') { block = false; entered.resolve(); await release.promise; }
    return cap(id, value);
  };
  const pending = h.sample(2000, 3600); await entered.promise;
  const status = h.port.setUnavailable;
  h.port.setUnavailable = async () => { throw Error('synthetic unavailable failure'); };
  h.revoke(); const refresh = h.adapter.refresh();
  try {
    await new Promise(setImmediate);
    assert.equal(h.caps.get('measure_power'), null);
    assert.throws(() => h.adapter.currentPower());
    assert.equal(h.saved().importedWh, 1);
  } finally {
    h.port.setUnavailable = status; release.resolve(); await Promise.all([pending, refresh]); await h.adapter.close();
  }
});

test('qualified snapshot shares current power authority and preserves the published receipt/deadline during pending SDK IO', async () => {
  const h = harness(false, 5000); await h.adapter.start();
  assert.equal(h.adapter.currentPowerObservation(1000), null);
  await h.sample(1000, 0);
  const first = h.adapter.currentPowerObservation(1000);
  assert.deepEqual(first, { powerW: 0, receivedAt: 1000, validUntil: 6000, generation: first.generation });
  assert.equal(Object.isFrozen(first), true);
  const entered = deferred(); const release = deferred(); const cap = h.port.setCapabilityValue; let block = true;
  h.port.setCapabilityValue = async (id, value) => {
    if (block && id === 'meter_power.imported') { block = false; entered.resolve(); await release.promise; }
    return cap(id, value);
  };
  const pending = h.sample(2000, 0); await entered.promise;
  try {
    h.now(5999); assert.equal(h.adapter.currentPower(), 0);
    assert.deepEqual(h.adapter.currentPowerObservation(5999), first, 'new same-watt receipt cannot renew an old published deadline');
    h.now(6000); assert.throws(() => h.adapter.currentPower());
    assert.equal(h.adapter.currentPowerObservation(6000), null);
    release.resolve(); await pending;
    assert.deepEqual(h.adapter.currentPowerObservation(6000),
      { powerW: 0, receivedAt: 2000, validUntil: 7000, generation: first.generation });
  } finally { release.resolve(); await pending; await h.adapter.close(); }
  assert.equal(h.adapter.currentPowerObservation(6000), null);
});

test('qualified snapshot rejects withdrawn source and uses signed power without granting counter authority', async () => {
  const h = harness(false, 5000); await h.adapter.start(); await h.sample(1000, -20);
  assert.equal(h.adapter.currentPowerObservation(1000).powerW, -20);
  h.revoke(); assert.equal(h.adapter.currentPowerObservation(1000), null);
  assert.throws(() => h.adapter.currentPower());
  await h.adapter.close();
});

test('qualified snapshot epochs cannot match a replacement adapter even at identical power and receipt time', async () => {
  const first = harness(false, 5000); await first.adapter.start(); await first.sample(1000, 20);
  const before = first.adapter.currentPowerObservation(1000); await first.adapter.close();
  const second = harness(false, 5000); await second.adapter.start(); await second.sample(1000, 20);
  const after = second.adapter.currentPowerObservation(1000);
  assert.equal(after.powerW, before.powerW); assert.equal(after.receivedAt, before.receivedAt);
  assert.notEqual(after.generation, before.generation);
  await second.adapter.close();
});

test('production runtime gate blocks before any Homey or storage write, even with an injected qualified session', async () => {
  const h = harness(true); await h.adapter.start(); await h.sample(1000, 3600); await h.adapter.refresh(); await h.adapter.close();
  assert.equal(h.storeWrites(), 0); assert.deepEqual(h.events, []);
});

test('real session persists CT1-only energy before projection, expires watts and retains cumulative totals', async () => {
  const h = harness(); await h.adapter.start();
  assert.equal(h.caps.get('measure_power'), null); assert(!h.events.some(x => x[0] === 'available'));
  await h.sample(1000, 3600); await h.sample(61000, 3600);
  assert.equal(h.caps.get('measure_power'), 3600);
  assert.equal(h.caps.get('meter_power.imported'), h.saved().importedWh / 1000);
  assert.equal(h.caps.get('meter_power.imported'), 0.06);
  assert.equal(h.caps.get('meter_power.exported'), 0);
  h.now(151000); await h.adapter.refresh();
  assert.equal(h.caps.get('measure_power'), null); assert.equal(h.caps.get('meter_power.imported'), 0.06);
  await h.sample(152000, -3600); // Gap reanchors, never integrates unseen time.
  assert.equal(h.caps.get('meter_power.imported'), 0.06);
  await h.sample(212000, -3600); assert.equal(h.caps.get('meter_power.exported'), 0.06);
  await h.adapter.close(); assert.equal(h.caps.get('measure_power'), null);
});

test('consent revoked during a slow SDK write prevents remaining projection and clears watts', async () => {
  const h = harness(); await h.adapter.start(); await h.sample(1000, 3600);
  const entered = deferred(); const released = deferred(); const original = h.port.setCapabilityValue;
  h.port.setCapabilityValue = async (id, value) => {
    if (id === 'meter_power.imported') { entered.resolve(); await released.promise; }
    return original(id, value);
  };
  const pending = h.sample(61000, 3600); await entered.promise;
  const index = h.events.length; h.revoke(); released.resolve(); await pending;
  assert.equal(h.caps.get('measure_power'), null);
  assert(!h.events.slice(index).some(x => x[0] === 'available'));
  assert.equal(h.adapter.diagnostics().active, false); assert.equal(h.saved().importedWh, 60);
  await h.adapter.close();
});

test('failed SDK projection preserves saved totals and never makes the device available', async () => {
  const h = harness(); await h.adapter.start(); await h.sample(1000, 3600);
  const index = h.events.length; const original = h.port.setCapabilityValue;
  h.port.setCapabilityValue = async (id, value) => { if (id === 'meter_power.exported') throw new Error('synthetic IO'); return original(id, value); };
  await h.sample(61000, 3600);
  assert.equal(h.saved().importedWh, 60); assert.equal(h.caps.get('measure_power'), null);
  assert.equal(h.adapter.diagnostics().status, 'projection_failed');
  assert(!h.events.slice(index).some(x => x[0] === 'available')); await h.adapter.close();
});

test('close while SDK write is pending serializes a final clear and rejects later callbacks', async () => {
  const h = harness(); await h.adapter.start(); await h.sample(1000, 100);
  const entered = deferred(); const released = deferred(); const original = h.port.setCapabilityValue;
  h.port.setCapabilityValue = async (id, value) => { if (id === 'meter_power.imported') { entered.resolve(); await released.promise; } return original(id, value); };
  const pending = h.sample(2000, 200); await entered.promise;
  const close = h.adapter.close(); released.resolve(); await Promise.all([pending, close]);
  assert.equal(h.caps.get('measure_power'), null);
  const writes = h.events.length; await h.sample(3000, 999); assert.equal(h.events.length, writes);
});

test('runtime gate withdrawal during configuration clears power and stops all further configuration', async () => {
  const h = harness(); h.port.setCapabilityOptions = async () => { h.disable(); };
  await h.adapter.start(); assert.equal(h.adapter.diagnostics().status, 'runtime_blocked');
  assert.equal(h.caps.get('measure_power'), null); assert(!h.events.some(x => x[0] === 'energy'));
  await h.adapter.close();
});

test('consent revoked during configuration cannot apply an Energy declaration', async () => {
  const h = harness(); h.port.setCapabilityOptions = async () => { h.revoke(); };
  await h.adapter.start(); assert.equal(h.adapter.diagnostics().active, false);
  assert.equal(h.caps.get('measure_power'), null); assert(!h.events.some(x => x[0] === 'energy'));
  await h.adapter.close();
});

test('failed power clear remains pending and retries without resuming accounting or resetting totals', async () => {
  const h = harness(); await h.adapter.start(); await h.sample(1000, 3600);
  let failClear = true; const original = h.port.setCapabilityValue;
  h.port.setCapabilityValue = async (id, value) => {
    if (id === 'meter_power.exported') throw new Error('synthetic projection failure');
    if (id === 'measure_power' && value === null && failClear) { failClear = false; throw new Error('synthetic clear failure'); }
    return original(id, value);
  };
  await h.sample(61000, 3600);
  assert.equal(h.caps.get('measure_power'), 3600); assert.equal(h.adapter.diagnostics().active, false);
  const saved = h.saved(); await h.adapter.refresh();
  assert.equal(h.caps.get('measure_power'), null); assert.deepEqual(h.saved(), saved);
  await h.adapter.close();
});

test('consent revoked during setAvailable is rechecked and immediately clears the projected power', async () => {
  const h = harness(); await h.adapter.start(); h.port.setAvailable = async () => { h.revoke(); };
  await h.sample(1000, 3600); assert.equal(h.adapter.diagnostics().active, false);
  assert.equal(h.caps.get('measure_power'), null); await h.adapter.close();
});

test('expiry ticks coalesce and superseded projection immediately catches up to the complete newer checkpoint', async () => {
  const h = harness(); await h.adapter.start(); await h.sample(1000, 3600);
  const entered = deferred(); const released = deferred(); const original = h.port.setCapabilityValue;
  let block = true;
  h.port.setCapabilityValue = async (id, value) => {
    if (block && id === 'meter_power.imported') { block = false; entered.resolve(); await released.promise; }
    return original(id, value);
  };
  const index = h.events.length;
  const pending = h.sample(2000, 3600); await entered.promise;
  const ticks = Array.from({ length: 100 }, () => h.adapter.refresh());
  assert(ticks.every(p => p === ticks[0]));
  h.now(3000); await h.session.observe(payload(7200), topic, 3000);
  released.resolve(); await Promise.all([pending, ...ticks]);
  assert.equal(h.caps.get('measure_power'), 7200); assert.equal(h.adapter.diagnostics().status, 'recent');
  assert.equal(h.available(), true);
  assert(!h.events.slice(index).some(e => e[0] === 'unavailable' || (e[0] === 'cap' && e[1] === 'measure_power' && e[2] === null)));
  assert.equal(h.saved().importedWh, 2.5, 'checkpoint retains sub-Wh precision');
  assert.equal(h.caps.get('meter_power.imported'), 0.003, 'native projection uses three decimal kWh'); await h.adapter.close();
});

test('unrelated CT2/voltage packets preserve CT1 intervals without renewing power freshness; partial CT1 still breaks the anchor', async () => {
  const packet = rows => msg(1, Buffer.concat([msg(1, Buffer.concat(rows.map(([f, n]) => scalar(f, n)))), int(6, 0), int(8, 254), int(9, 21)]));
  for (const watts of [3600, -3600]) {
    const h = harness(); await h.adapter.start(); await h.sample(1000, watts);
    h.now(2000); await h.adapter.observe(packet([[991, 90000], [992, 90000], [993, 90000], [956, 230]]), topic, 2000);
    await h.sample(3000, watts);
    const cap = watts > 0 ? 'meter_power.imported' : 'meter_power.exported';
    assert.ok(Math.abs(h.caps.get(cap) - 0.002) < 1e-12, 'unrelated traffic must not discard the two-second CT1 interval');
    h.now(4000); await h.adapter.observe(packet([[962, watts]]), topic, 4000);
    await h.sample(5000, watts); assert.ok(Math.abs(h.caps.get(cap) - 0.002) < 1e-12, 'partial CT1 must not mix cached phases');
    h.now(95000); await h.adapter.observe(packet([[956, 230], [991, 1000]]), topic, 95000);
    assert.equal(h.caps.get('measure_power'), null, 'unrelated packets cannot keep old power fresh');
    await h.adapter.close();
  }
});

test('healthy routine ticks and power changes never toggle unavailable or erase fresh power',async()=>{
  const h=harness(false,5000);await h.adapter.start();await h.sample(1000,3600);
  const index=h.events.length;const counterEvents=[];
  for(const [at,w] of [[2000,3600],[3000,7200],[4000,-3600],[5000,-3600]]){
    await h.sample(at,w);await h.adapter.refresh();assert.equal(h.available(),true);counterEvents.push(h.saved());
  }
  assert(!h.events.slice(index).some(e=>e[0]==='unavailable'||(e[0]==='cap'&&e[1]==='measure_power'&&e[2]===null)));
  for(let i=1;i<counterEvents.length;i++){
    assert.ok(counterEvents[i].importedWh>=counterEvents[i-1].importedWh);assert.ok(counterEvents[i].exportedWh>=counterEvents[i-1].exportedWh);
  }
  await h.adapter.close();
});
test('exact five-second expiry still makes power unavailable, retains precise totals and recovers without downtime fill',async()=>{
  const h=harness(false,5000);await h.adapter.start();await h.sample(1000,3600);await h.sample(2000,3600);
  const saved=structuredClone(h.saved());h.now(6999);await h.adapter.refresh();assert.equal(h.available(),true);
  const index=h.events.length;h.now(7000);await h.adapter.refresh();
  assert.equal(h.available(),false);assert.equal(h.caps.get('measure_power'),null);assert.deepEqual(h.saved(),saved);
  assert(h.events.slice(index).some(e=>e[0]==='unavailable'&&e[1]==='Waiting for fresh CT1 power'));
  await h.sample(8000,3600);assert.equal(h.available(),true);assert.deepEqual(h.saved(),saved,'first new receipt anchors only');
  await h.sample(9000,3600);assert.ok(h.saved().importedWh>saved.importedWh);await h.adapter.close();
});
test('expiry is not queued behind a stalled counter SDK write; measurement commits remain precise and retry ticks coalesce',async()=>{
  const h=harness(false,5000);await h.adapter.start();await h.sample(1000,3600);
  const entered=deferred(),release=deferred(),original=h.port.setCapabilityValue;let block=true;
  h.port.setCapabilityValue=async(id,v)=>{if(block&&id==='meter_power.imported'){block=false;entered.resolve();await release.promise;}return original(id,v);};
  const pending=h.sample(2000,3600);await entered.promise;assert.equal(h.saved().importedWh,1);
  h.now(8000);const ticks=Array.from({length:100},()=>h.adapter.refresh());assert(ticks.every(p=>p===ticks[0]));
  await new Promise(setImmediate);assert.equal(h.available(),false);assert.equal(h.caps.get('measure_power'),null);
  assert.equal(h.saved().importedWh,1,'clearing display power must not rewrite a checkpoint');
  release.resolve();await Promise.all([pending,...ticks]);assert.equal(h.available(),false);assert.equal(h.caps.get('measure_power'),null);
  await h.sample(9000,3600);assert.equal(h.available(),true);assert.equal(h.saved().importedWh,1);await h.adapter.close();
});
test('late power-write and setAvailable completions cannot resurrect a stale projection',async()=>{
  for(const operation of ['power','available']){
    const h=harness(false,5000);await h.adapter.start();await h.sample(1000,3600);
    const entered=deferred(),release=deferred();let block=true;
    const cap=h.port.setCapabilityValue,available=h.port.setAvailable;
    if(operation==='power')h.port.setCapabilityValue=async(id,v)=>{if(block&&id==='measure_power'&&v!==null){block=false;entered.resolve();await release.promise;}return cap(id,v);};
    else h.port.setAvailable=async()=>{if(block){block=false;entered.resolve();await release.promise;}return available();};
    const pending=h.sample(2000,3600);await entered.promise;h.now(8000);const tick=h.adapter.refresh();
    await new Promise(setImmediate);assert.equal(h.available(),false,operation);assert.equal(h.caps.get('measure_power'),null,operation);
    release.resolve();await Promise.all([pending,tick]);assert.equal(h.available(),false,operation);assert.equal(h.caps.get('measure_power'),null,operation);
    assert.equal(h.saved().importedWh,1);await h.adapter.close();
  }
});
test('continuous supersession has bounded catch-up and keeps the last fresh projection until a normal tick catches up',async()=>{
  const h=harness();await h.adapter.start();await h.sample(1000,3600);const original=h.port.setCapabilityValue;
  let at=2000,count=0,change=true;
  h.port.setCapabilityValue=async(id,v)=>{await original(id,v);if(change&&id==='meter_power.imported'){count++;h.now(++at);await h.session.observe(payload(7200),topic,at);}};
  const index=h.events.length;await h.sample(at,3600);assert.equal(count,3,'only three projection attempts per refresh');
  assert.equal(h.adapter.diagnostics().status,'projection_superseded');assert.equal(h.available(),true);
  assert(!h.events.slice(index).some(e=>e[0]==='unavailable'||(e[0]==='cap'&&e[1]==='measure_power'&&e[2]===null)));
  change=false;await h.adapter.refresh();assert.equal(h.caps.get('measure_power'),7200);assert.equal(h.adapter.diagnostics().status,'recent');
  assert.equal(h.caps.get('meter_power.imported'),Math.round(h.saved().importedWh)/1000);await h.adapter.close();
});

test('fresh incoming packets cannot extend the deadline of old power stuck behind SDK IO',async()=>{
  const h=harness(false,5000);await h.adapter.start();await h.sample(1000,3600);
  const entered=deferred(),release=deferred(),original=h.port.setCapabilityValue;let block=true;
  h.port.setCapabilityValue=async(id,v)=>{if(block&&id==='meter_power.imported'){block=false;entered.resolve();await release.promise;}return original(id,v);};
  const pending=h.sample(2000,3600);await entered.promise;
  h.now(5000);await h.session.observe(payload(7200),topic,5000);assert.equal(h.session.view().candidateCapabilities.measure_power,7200);
  const saved=structuredClone(h.saved());h.now(6000);const tick=h.adapter.refresh();await new Promise(setImmediate);
  assert.equal(h.session.view().candidateCapabilities.measure_power,7200,'latest source remains fresh');
  assert.equal(h.available(),false,'the old displayed power still expires at its own five-second deadline');
  assert.equal(h.caps.get('measure_power'),null);assert.deepEqual(h.saved(),saved);
  release.resolve();await Promise.all([pending,tick]);assert.equal(h.available(),true);assert.equal(h.caps.get('measure_power'),7200);
  assert.deepEqual(h.saved(),saved);await h.adapter.close();
});

test('a clear landing immediately after a slow power write is republished before availability',async()=>{
  const h=harness(false,5000);await h.adapter.start();await h.sample(1000,3600);
  const original=h.port.setCapabilityValue;let jump=true;
  h.port.setCapabilityValue=async(id,v)=>{await original(id,v);if(jump&&id==='measure_power'&&v!==null){jump=false;h.now(6000);}};
  await h.sample(2000,3600);
  assert.equal(h.available(),true);assert.equal(h.caps.get('measure_power'),3600,'available must never be restored with a cleared power');
  assert.equal(h.saved().importedWh,1);h.now(7000);await h.adapter.refresh();
  assert.equal(h.available(),false);assert.equal(h.caps.get('measure_power'),null);await h.adapter.close();
});
test('a failed urgent power clear is retried during stalled SDK IO without touching counters',async()=>{
  const h=harness(false,5000);await h.adapter.start();await h.sample(1000,3600);
  const entered=deferred(),release=deferred(),original=h.port.setCapabilityValue;let block=true,fail=true;
  h.port.setCapabilityValue=async(id,v)=>{
    if(block&&id==='meter_power.imported'){block=false;entered.resolve();await release.promise;}
    if(id==='measure_power'&&v===null&&fail){fail=false;throw Error('synthetic clear failure');}
    return original(id,v);
  };
  const pending=h.sample(2000,3600);await entered.promise;const saved=structuredClone(h.saved());h.now(8000);
  const first=h.adapter.refresh();await new Promise(setImmediate);assert.equal(h.available(),false);
  const retry=h.adapter.refresh();await new Promise(setImmediate);assert.equal(h.caps.get('measure_power'),null);assert.deepEqual(h.saved(),saved);
  release.resolve();await Promise.all([pending,first,retry]);assert.equal(h.available(),false);assert.deepEqual(h.saved(),saved);await h.adapter.close();
});
