'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const path=require('node:path');
const {pathToFileURL}=require('node:url');const {chromium}=require('playwright');
const {DualCtPreview}=require('../.homeybuild/lib/dualCtPreview');
function vi(n){const a=[];do{a.push((n&127)|(n>127?128:0));n=Math.floor(n/128);}while(n);return Buffer.from(a);}
function f(n,v){const b=Buffer.alloc(4);b.writeFloatLE(v);return Buffer.concat([vi(n*8+5),b]);}
function m(n,b){return Buffer.concat([vi(n*8+2),vi(b.length),b]);}
function fixture(changed=false,sparse=false){const preview=new DualCtPreview(true,true);
  const bytes=Buffer.concat([[515,-6],[962,-1],[963,-2],[772,-3],[956,230],[958,0],[998,9],[991,2],[992,3],[993,4]].map(([n,v])=>f(n,v)));
  const nested=Buffer.concat([[1,-40],[2,20],[3,70],[4,150],[6,100],[7,50]].map(([n,v])=>f(n,v)));
  preview.observe(0,Buffer.concat([bytes,m(773,nested),m(997,nested)]),{productType:421,cmdFunc:254,cmdId:21,source:'app_mqtt',encoding:'plain',now:1000,receivedAt:1000});
  if(changed){const next=Buffer.concat([[1,-41],[2,20],[3,70],[4,155],[6,100],[7,55]].map(([n,v])=>f(n,v)));
    preview.observe(0,Buffer.concat([bytes,m(773,next)]),{productType:421,cmdFunc:254,cmdId:21,source:'app_mqtt',encoding:'plain',now:2000,receivedAt:2000});}
  if(sparse)preview.observe(0,bytes,{productType:421,cmdFunc:254,cmdId:21,source:'app_mqtt',encoding:'plain',now:3000,receivedAt:3000});
  const view={...preview.snapshot(sparse?3000:changed?2000:1000),captureId:'11111111-1111-4111-8111-111111111111',appVersion:'1.10.47'};
  const diagnostics=preview.diagnostics(view.reason);preview.clear();return {view,diagnostics};}
async function setup(browser,viewport){const page=await browser.newPage({viewport});
  await page.goto(pathToFileURL(path.join(__dirname,'..','settings','index.html')).href);
  await page.clock.install({time:new Date('2026-10-15T20:00:00Z')});
  await page.evaluate(({translations,fixture})=>{
    window.calls=[];window.copied=null;window.originTime=Date.now();window.fixture=fixture;window.running=false;
    window.view=()=>{const v=structuredClone(window.fixture.view);const seconds=(Date.now()-window.originTime)/1000;
      v.captureId=window.changedId||v.captureId;
      v.devices.forEach(d=>{d.readings.forEach(r=>{r.receivedAgeSec+=seconds;});d.readings=d.readings.filter(r=>r.receivedAgeSec<90);});
      v.devices=v.devices.filter(d=>d.readings.length);if(!v.devices.length)v.reason='expired';
      v.diagnosticSnapshot.retainedForSec+=seconds;v.diagnosticSnapshot.retentionRemainingSec-=seconds;v.diagnosticSnapshot.lastPacketAgeSec+=seconds;
      v.diagnosticSnapshot.devices.forEach(d=>d.readings.forEach(r=>{r.receivedAgeSec+=seconds;}));
      v.diagnosticSnapshot.counterRecords.forEach(r=>{r.receivedAgeSec+=seconds;});
      v.diagnosticSnapshot.counterContinuity?.records.forEach(r=>{r.receivedAgeSec+=seconds;r.lastPacketAgeSec+=seconds;});
      v.diagnosticSnapshot.bankChecks.forEach(r=>[r.latest,r.lastComplete].forEach(c=>{if(c)c.receivedAgeSec+=seconds;}));
      return v;};
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copied=text;}}});
    window.onHomeyReady({ready(){},get(_key,cb){cb(null,null);},__(key){return key.split('.').reduce((o,p)=>o?.[p],translations)||key;},
      api(method,url,body,callback){window.calls.push({method,url,body});if(window.failure){callback(new Error('PRIVATE'));return;}
        if(window.pending){window.late=callback;return;}
        if(url.endsWith('/start')){window.running=true;callback(null,{status:'listening'});return;}
        if(url.endsWith('/stop')){window.running=false;callback(null,{status:'stopped'});return;}
        const preview=window.view();
        if(url==='/dual-ct-preview'){callback(null,preview);return;}
        callback(null,{research:{status:window.running?'listening':'complete',deviceCount:1,frames:1,appVersion:'1.10.47',
          previewDiagnostics:structuredClone(window.fixture.diagnostics)},preview});
      }});
  },{translations:require('../locales/en.json'),fixture:fixture()});
  await page.locator('#dualCtTitle').click();return page;}

test('desktop/mobile comparison cards distinguish missing/stale/zero, lock capture opt-ins and require reviewed sharing',async()=>{
  const browser=await chromium.launch();try{for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
    const page=await setup(browser,viewport);
    assert.equal(await page.locator('#enableDualCtCounters').isDisabled(),true);
    await page.locator('#enableDualCtPreview').check();assert.equal(await page.locator('#enableDualCtCounters').isEnabled(),true);
    await page.locator('#enableDualCtCounters').check();await page.locator('#startDualCtResearch').click();
    assert.deepEqual(await page.evaluate(()=>window.calls.find(c=>c.url.endsWith('/start')).body),{previewEnabled:true,counterPreviewEnabled:true});
    assert.equal(await page.locator('#enableDualCtCounters').isDisabled(),true);
    assert.equal(await page.locator('#enableDualCtCounters').isChecked(),true);
    await page.locator('#dualCtComparisonPanel').evaluate(el=>{el.open=true;});
    const comparison=await page.locator('#dualCtComparisonState').innerText();
    assert.match(comparison,/Candidate bank A/);assert.match(comparison,/Candidate bank B/);assert.match(comparison,/Not observed; not zero/);
    assert.match(comparison,/0 · 0 s/);assert.match(comparison,/773.4: 150.*unscaled/);
    assert.match(comparison,/Record 997: structure only/);assert.doesNotMatch(comparison,/997.4: 150/);
    assert.match(comparison,/Device preview is not available for pairing yet/);
    assert.match(comparison,/Homey Energy adoption is blocked/);
    assert.match(comparison,/Counter continuity observations/);assert.match(comparison,/Daily totals unavailable/);
    assert.match(comparison,/Baseline only/);assert.match(comparison,/Restart clears this observation history/);
    assert.equal(await page.locator('#copyDualCtCandidates').isDisabled(),true);assert.equal(await page.evaluate(()=>window.copied),null);
    await page.getByLabel('My observation (optional) 1 A',{exact:true}).selectOption('looks_like_grid');
    await page.getByLabel('My observation (optional) 1 B',{exact:true}).selectOption('does_not_match');
    await page.locator('#includeDualCtComparison').check();await page.locator('#consentDualCtCandidateExport').check();
    const report=JSON.parse(await page.locator('#dualCtCandidateText').textContent());
    assert.equal(report.reportType,'dual_ct_comparison');assert.equal(report.annotations[0].verified,false);
    assert.equal(report.counterRecords[0].candidates[0].candidateUnit,null);assert.equal(report.counterReadingsIncluded,6);
    assert.equal(report.historical,true);assert.equal(report.notLive,true);assert.equal(report.contributesToEnergy,false);
    assert.ok((await page.locator('#dualCtCandidateText').textContent()).length<=7500);assert.doesNotMatch(JSON.stringify(report),/PRIVATE|captureId/);
    const compact=JSON.parse(await page.locator('#dualCtCompactText').innerText());
    assert.doesNotMatch(JSON.stringify(compact),/"value"|candidateUnit|packetIndex/);
    await page.locator('#copyDualCtCandidates').click();assert.equal(JSON.parse(await page.evaluate(()=>window.copied)).reportType,'dual_ct_comparison');
    const requestedDownload=page.waitForEvent('download');await page.locator('#downloadDualCtCandidates').click();
    const download=await requestedDownload;assert.equal(download.suggestedFilename(),'ecoflow-dual-ct-comparison.json');
    const calls=await page.evaluate(()=>window.calls.length);
    await page.getByLabel('My observation (optional) 1 A',{exact:true}).selectOption('does_not_match');
    assert.equal(await page.locator('#consentDualCtCandidateExport').isChecked(),false);assert.equal(await page.locator('#copyDualCtCandidates').isDisabled(),true);
    await page.locator('#consentDualCtCandidateExport').check();
    assert.equal(JSON.parse(await page.locator('#dualCtCandidateText').textContent()).annotations.find(r=>r.bank==='A').observation,'does_not_match');
    await page.locator('#dualCtComparisonState .dual-ct-card').first().scrollIntoViewIfNeeded();
    await page.screenshot({path:`/tmp/ecoflow-dualct-comparison-${viewport.width}.png`});
    await page.locator('#dualCtComparisonState .dual-ct-card').nth(2).scrollIntoViewIfNeeded();
    await page.screenshot({path:`/tmp/ecoflow-dualct-counters-${viewport.width}.png`});
    await page.locator('#dualCtComparisonState .dual-ct-card').nth(4).scrollIntoViewIfNeeded();
    await page.screenshot({path:`/tmp/ecoflow-dualct-continuity-${viewport.width}.png`});
    await page.clock.runFor(90000);assert.match(await page.locator('#dualCtComparisonState').innerText(),/stale \/ historical/);
    await page.locator('#copyDualCtCandidates').click();
    assert.ok(JSON.parse(await page.evaluate(()=>window.copied)).counterRecords[0].receivedAgeSec>=90);
    assert.equal(await page.evaluate(()=>window.calls.length),calls,'comparison and export never poll cloud or write device settings');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    await page.clock.runFor(810000);assert.equal(await page.locator('#dualCtComparisonState').textContent(),'');
    assert.equal(await page.locator('#copyDualCtCandidates').isDisabled(),true);
    await page.close();
  }}finally{await browser.close();}
});

test('comparison notes and numeric export are invalidated on capture change, failures, timeout, stop and navigation',async()=>{
  const browser=await chromium.launch();try{
    const page=await setup(browser,{width:390,height:844});
    await page.locator('#refreshDualCtResearch').click();await page.locator('#dualCtComparisonPanel').evaluate(el=>{el.open=true;});
    await page.getByLabel('My observation (optional) 1 A',{exact:true}).selectOption('looks_like_solar');
    await page.locator('#includeDualCtComparison').check();await page.locator('#consentDualCtCandidateExport').check();
    await page.locator('#refreshDualCtResearch').click();assert.equal(await page.locator('#includeDualCtComparison').isChecked(),true);
    assert.equal(await page.getByLabel('My observation (optional) 1 A',{exact:true}).inputValue(),'looks_like_solar');
    await page.evaluate(()=>{window.changedId='22222222-2222-4222-8222-222222222222';});await page.locator('#refreshDualCtResearch').click();
    assert.equal(await page.locator('#includeDualCtComparison').isChecked(),false);assert.equal(await page.locator('#consentDualCtCandidateExport').isChecked(),false);
    assert.equal(await page.getByLabel('My observation (optional) 1 A',{exact:true}).inputValue(),'unknown');
    await page.evaluate(()=>{window.failure=true;});await page.locator('#refreshDualCtResearch').click();
    assert.equal(await page.locator('#dualCtComparisonState').textContent(),'');
    await page.evaluate(()=>{window.failure=false;window.pending=true;});await page.locator('#refreshDualCtResearch').click();await page.clock.runFor(20001);
    await page.evaluate(()=>{window.pending=false;window.late(null,{research:{status:'complete'},preview:window.view()});});
    assert.equal(await page.locator('#dualCtComparisonState').textContent(),'');
    await page.locator('#refreshDualCtResearch').click();await page.locator('#stopDualCtResearch').click();assert.equal(await page.locator('#dualCtComparisonState').textContent(),'');
    await page.locator('#refreshDualCtResearch').click();await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
    assert.equal(await page.locator('#dualCtComparisonState').textContent(),'');assert.equal(await page.locator('#enableDualCtCounters').isChecked(),false);
  }finally{await browser.close();}
});

test('comparison and counter research wording is complete in EN/DE/NL',()=>{
  for(const language of ['en','de','nl']){
    const locale=require(`../locales/${language}.json`).settings.dual_ct;
    for(const key of Object.keys(require('../locales/en.json').settings.dual_ct).filter(key=>key.startsWith('working_')
      ||['continuity_not_updated','continuity_record_receipts','continuity_packet_age','continuity_no_record'].includes(key)))assert.equal(typeof locale[key],'string',language+':'+key);
    for(const key of ['counter_opt_in','comparison_title','comparison_include','comparison_warning','comparison_observation',
      'comparison_unknown','comparison_looks_like_grid','comparison_looks_like_solar','comparison_does_not_match','comparison_missing',
      'comparison_stale','comparison_recent','comparison_recent_short','comparison_stale_short','counter_title','counter_warning','counter_structure_only','counter_missing','counter_record',
      'counter_observed','counter_invalid','counter_oversized','counter_997_structure','counter_unscaled'])assert.equal(typeof locale[key],'string',language+':'+key);
    for(const key of ['readiness_title','readiness_device_blocked','readiness_energy_blocked','continuity_title','continuity_warning',
      'continuity_daily_unavailable','continuity_not_reported','continuity_observations','continuity_baseline','continuity_compared',
      'continuity_increased','continuity_decreased','continuity_unchanged','continuity_missing','continuity_invalid','continuity_gap',
      'continuity_source_changed','continuity_out_of_order','continuity_same_receipt','continuity_structure_only'])assert.equal(typeof locale[key],'string',language+':'+key);
  }
});

test('desktop/mobile working assumptions, sparse receipt ages and schema-2 copy/download agree without device writes',async()=>{
  const browser=await chromium.launch();try{for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
    const page=await setup(browser,viewport);await page.clock.pauseAt(new Date('2026-10-15T20:00:10Z'));
    await page.evaluate(value=>{window.fixture=value;window.originTime=Date.now();},fixture(true,true));
    await page.locator('#refreshDualCtResearch').click();await page.locator('#dualCtComparisonPanel').evaluate(el=>{el.open=true;});
    const text=await page.locator('#dualCtComparisonState').innerText();
    assert.match(text,/Working assumption: EcoFlow Grid/);assert.match(text,/EcoFlow Solar \/ inverter circuit/);
    assert.match(text,/may include battery discharge/);assert.match(text,/Raw signs are unchanged/);
    assert.match(text,/Candidate total grid import \(kWh\?\): 0.155/);
    assert.match(text,/No counter update in latest packet/);assert.match(text,/Latest packet age \(not counter age\): 0 s/);
    assert.match(text,/Record 773 · 1 s/);assert.match(text,/Counter record receipts: 2/);
    await page.getByLabel('My observation (optional) 1 A',{exact:true}).selectOption('does_not_match');
    assert.match(await page.locator('#dualCtComparisonState').innerText(),/Your observation conflicts with this working assumption/);
    await page.locator('#includeDualCtComparison').check();await page.locator('#consentDualCtCandidateExport').check();
    const reviewed=await page.locator('#dualCtCandidateText').textContent();
    assert.equal(JSON.parse(reviewed).schemaVersion,2);assert.ok(reviewed.length<=7500);
    assert.ok(JSON.parse(reviewed).candidateSnapshot.devices[0].readingReceipts.length);
    await page.locator('#copyDualCtCandidates').click();assert.equal(await page.evaluate(()=>window.copied),reviewed);
    const downloaded=page.waitForEvent('download');await page.locator('#downloadDualCtCandidates').click();
    const file=await downloaded;const bytes=await require('node:fs/promises').readFile(await file.path(),'utf8');
    assert.equal(bytes,reviewed);assert.equal(file.suggestedFilename(),'ecoflow-dual-ct-comparison.json');
    const calls=await page.evaluate(()=>window.calls.length);
    await page.clock.runFor(90000);assert.match(await page.locator('#dualCtComparisonState').innerText(),/stale \/ historical/);
    assert.equal(await page.evaluate(()=>window.calls.length),calls);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    await page.locator('#dualCtComparisonState .dual-ct-card').first().scrollIntoViewIfNeeded();
    await page.screenshot({path:`/tmp/ecoflow-dualct-progress-${viewport.width}.png`});
    await page.locator('#dualCtComparisonState .dual-ct-card').nth(2).scrollIntoViewIfNeeded();
    await page.screenshot({path:`/tmp/ecoflow-dualct-progress-counters-${viewport.width}.png`});
    await page.locator('#stopDualCtResearch').click();assert.equal(await page.locator('#dualCtComparisonState').textContent(),'');
    await page.close();
  }}finally{await browser.close();}
});

test('mobile continuity preview explains signed decreases, missing records, stale evidence and blocked adoption without background polling',async()=>{
  const browser=await chromium.launch();try{
    const page=await setup(browser,{width:390,height:844});
    await page.evaluate(value=>{window.fixture=value;},fixture(true));
    await page.locator('#refreshDualCtResearch').click();await page.locator('#dualCtComparisonPanel').evaluate(el=>{el.open=true;});
    const text=await page.locator('#dualCtComparisonState').innerText();
    assert.match(text,/773.1: Decreased \(not a confirmed reset\)/);
    assert.match(text,/773.4: Increased \(unscaled\)/);assert.match(text,/Accepted observations: 2/);
    assert.match(text,/Daily totals unavailable/);assert.match(text,/No background or overnight recording/);
    assert.match(text,/Homey Energy adoption is blocked/);
    await page.locator('#includeDualCtComparison').check();await page.locator('#consentDualCtCandidateExport').check();
    let report=JSON.parse(await page.locator('#dualCtCandidateText').textContent());
    assert.equal(report.counterContinuity.records[0].events.decreased,1);assert.equal(report.contributesToEnergy,false);
    const calls=await page.evaluate(()=>window.calls.length);await page.clock.runFor(90000);
    assert.match(await page.locator('#dualCtComparisonState').innerText(),/stale \/ historical/);
    await page.locator('#copyDualCtCandidates').click();report=JSON.parse(await page.evaluate(()=>window.copied));
    assert.ok(report.counterContinuity.records.every(r=>r.receivedAgeSec>=90));
    assert.equal(await page.evaluate(()=>window.calls.length),calls);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    await page.locator('#stopDualCtResearch').click();assert.equal(await page.locator('#dualCtComparisonState').textContent(),'');
  }finally{await browser.close();}
});
