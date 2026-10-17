'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

async function setup(browser, viewport, expired = false) {
  const page = await browser.newPage({viewport});
  await page.goto(pathToFileURL(path.join(__dirname,'..','settings','index.html')).href);
  await page.clock.install({time:new Date('2026-10-14T20:00:00Z')});
  await page.evaluate(({translations,expired}) => {
    window.calls=[]; window.copied=null; window.originTime=Date.now(); window.expiredInitially=expired;
    window.id='11111111-1111-4111-8111-111111111111';
    window.view=()=> {
      const elapsed=(Date.now()-window.originTime)/1000;
      const retainedForSec=(window.expiredInitially?200:80)+elapsed;
      const rows=[{field:515,value:-7,candidateUnit:'W',receivedAgeSec:(window.expiredInitially?200:80)+elapsed,encodingBasis:'omitted_zero_candidate'},
        {field:956,value:230,candidateUnit:'V',receivedAgeSec:(window.expiredInitially?130:10)+elapsed,encodingBasis:'explicit_zero'}];
      rows.forEach((row,index)=>{row.packetIndex=index+1;});
      const checkBase={bank:'A',scope:'single_decoded_payload',encodingBasis:'explicit_zero',mappingVerified:false,roleVerified:false,measurementSimultaneityVerified:false};
      const bankChecks=[{deviceIndex:0,bank:'A',latest:{...checkBase,packetIndex:2,status:'partial',presentPowerFields:[],receivedAgeSec:rows[1].receivedAgeSec},
        lastComplete:{...checkBase,packetIndex:1,status:'consistent',presentPowerFields:[515,962,963,772],receivedAgeSec:rows[0].receivedAgeSec,
          reportedTotal:-7,phaseValues:[-1,-2,-4],phaseSum:-7,difference:0,tolerance:0.001014}}];
      const fresh=rows.filter(row=>row.receivedAgeSec<90);
      return {enabled:true,reason:fresh.length?'ready':'expired',captureId:window.id,appVersion:'1.10.45',
        interpretation:'legacy_meter_overlap_unverified',unitsVerified:false,directionVerified:false,
        devices:fresh.length?[{deviceIndex:0,readings:fresh}]:[],
        diagnosticSnapshot:retainedForSec<900?{kind:'historical_capture',simultaneous:false,retainedForSec,
          retentionRemainingSec:900-retainedForSec,lastPacketAgeSec:rows[1].receivedAgeSec,
          devices:[{deviceIndex:0,sn:'PRIVATE',readings:rows}],bankChecks}:null};
    };
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.copied=value;}}});
    window.onHomeyReady({ready(){},get(_key,cb){cb(null,null);},
      __(key){return key.split('.').reduce((obj,p)=>obj?.[p],translations)||key;},
      api(method,url,body,callback){
        window.calls.push({method,url,body});
        if(window.pending){window.pendingCallback=callback;return;}
        if(window.failure){callback(new Error('PRIVATE'));return;}
        const preview=window.view();
        if(url==='/dual-ct-preview') callback(null,preview);
        else if(url==='/dual-ct-research/view') callback(null,{research:{status:'complete',appVersion:'1.10.45',deviceCount:1,frames:41,
          valuesCaptured:true,selected:[{deviceIndex:0,basis:'observed_app_product_type_421',appListed:true}],
          history:[{deviceIndex:0,source:'app_mqtt',status:'protobuf',samples:41,lastAgeSec:preview.diagnosticSnapshot?.lastPacketAgeSec}],
          previewDiagnostics:{enabled:true,reason:preview.reason,attemptedPayloads:41,acceptedPayloads:41,
            bankCheckSummary:{reported:true,scope:'retained_capture_history',arithmeticScope:'single_decoded_payload',
              banks:preview.diagnosticSnapshot?preview.diagnosticSnapshot.bankChecks.map(row=>({deviceIndex:row.deviceIndex,bank:row.bank,
                latest:{status:row.latest.status,receivedAgeSec:row.latest.receivedAgeSec},
                lastComplete:{status:row.lastComplete.status,receivedAgeSec:row.lastComplete.receivedAgeSec}})):[]}}},preview});
        else callback(null,{status:'stopped'});
      }});
  },{translations:require('../locales/en.json'),expired});
  await page.locator('#dualCtTitle').click();
  await page.locator('#dualCtCompactTitle').click();
  await page.locator('#dualCtPreviewTitle').click();
  return page;
}

test('desktop/mobile per-field expiry preserves newer live fields and consented historical export without network polling',async()=>{
  const browser=await chromium.launch();
  try {
    for(const viewport of [{width:1280,height:900},{width:390,height:844}]) {
      const page=await setup(browser,viewport);
      await page.locator('#refreshDualCtResearch').click();
      const summary=await page.locator('#dualCtResearchResult').innerText();
      assert.match(summary,/Numeric-free capture summary/);assert.match(summary,/Ages are at the last refresh/);
      assert.match(summary,/Candidate bank A.*latest payload: incomplete/);
      assert.match(summary,/last complete power payload: arithmetic consistent only/);
      assert.doesNotMatch(summary,/reportedTotal|phaseValues|515: -7/);
      const compact=JSON.parse(await page.locator('#dualCtCompactText').innerText());
      assert.equal(compact.schemaVersion,6);assert.equal(compact.valuesIncluded,false);
      assert.equal(compact.previewDiagnostics.bankCheckSummary.banks[0].latest.status,'partial');
      assert.equal(compact.previewDiagnostics.bankCheckSummary.banks[0].lastComplete.status,'consistent');
      assert.doesNotMatch(JSON.stringify(compact),/reportedTotal|phaseValues|packetIndex|candidateUnit|-7/);
      assert.ok(JSON.stringify(compact,null,2).length<=7500);
      await page.locator('#dualCtResearchResult').scrollIntoViewIfNeeded();
      await page.screenshot({path:`/tmp/ecoflow-dualct-bank-summary-${viewport.width}.png`});
      assert.match(await page.locator('#dualCtPreviewState').innerText(),/515: -7/);
      assert.match(await page.locator('#dualCtPreviewState').innerText(),/956: 230/);
      assert.equal(await page.locator('#consentDualCtCandidateExport').isChecked(),false);
      assert.equal(await page.locator('#copyDualCtCandidates').isDisabled(),true);
      assert.match(await page.locator('#dualCtPreviewState').innerText(),/Candidate bank A.*candidate phase 1.*voltage/);
      assert.match(await page.locator('#dualCtBankState').innerText(),/NOT CT1\/CT2/);
      assert.match(await page.locator('#dualCtBankState').innerText(),/latest payload #2: incomplete/);
      assert.match(await page.locator('#dualCtBankState').innerText(),/last complete power payload #1: arithmetic consistent only/);
      await page.clock.runFor(10000);
      const partial=await page.locator('#dualCtPreviewState').innerText();
      assert.doesNotMatch(partial,/515: -7/); assert.match(partial,/956: 230/);
      assert.equal(await page.locator('#consentDualCtCandidateExport').isDisabled(),false);
      const calls=await page.evaluate(()=>window.calls.length);
      await page.clock.runFor(70001);
      assert.match(await page.locator('#dualCtPreviewState').innerText(),/Live candidate values have expired/);
      assert.equal(await page.locator('#consentDualCtCandidateExport').isDisabled(),false);
      await page.locator('#includeDualCtComparison').uncheck();
      await page.locator('#consentDualCtCandidateExport').check();
      const reviewed=JSON.parse(await page.locator('#dualCtCandidateText').innerText());
      assert.equal(reviewed.schemaVersion,4); assert.equal(reviewed.historical,true); assert.equal(reviewed.notLive,true);
      assert.equal(reviewed.devices[0].readings.length,2); assert.ok(reviewed.devices[0].readings[0].receivedAgeSec>90);
      assert.equal(reviewed.bankChecks[0].latest.packetIndex,2);
      assert.equal(reviewed.bankChecks[0].lastComplete.packetIndex,1);
      assert.ok(reviewed.bankChecks[0].lastComplete.receivedAgeSec>90);
      assert.doesNotMatch(JSON.stringify(reviewed),/PRIVATE|captureId/);
      await page.locator('#copyDualCtCandidates').click();
      const copied=JSON.parse(await page.evaluate(()=>window.copied));
      assert.equal(copied.devices[0].readings[0].value,reviewed.devices[0].readings[0].value);
      assert.ok(copied.devices[0].readings[0].receivedAgeSec>=reviewed.devices[0].readings[0].receivedAgeSec);
      assert.ok(copied.retentionRemainingSec<=reviewed.retentionRemainingSec);
      assert.ok(copied.bankChecks[0].lastComplete.receivedAgeSec>=reviewed.bankChecks[0].lastComplete.receivedAgeSec);
      assert.equal(await page.evaluate(()=>window.calls.length),calls);
      await page.locator('#consentDualCtCandidateExport').uncheck();
      assert.equal(await page.locator('#copyDualCtCandidates').isDisabled(),true);
      assert.equal(await page.locator('#dualCtCandidateText').textContent(),'');
      assert.match(await page.locator('#dualCtBankState').innerText(),/Historical same-payload/,'local metadata remains available without sharing consent');
      await page.locator('#consentDualCtCandidateExport').check();
      await page.locator('#refreshDualCtResearch').click();
      assert.equal(await page.locator('#consentDualCtCandidateExport').isChecked(),true,'same capture retains explicit consent');
      assert.match(await page.locator('#dualCtDiagnosticState').innerText(),/Historical diagnostic snapshot/);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.locator('#dualCtResearch').screenshot({path:`/tmp/ecoflow-dualct-historical-${viewport.width}.png`});
      const afterRefresh=await page.evaluate(()=>window.calls.length);
      await page.clock.runFor(740000);
      assert.equal(await page.locator('#consentDualCtCandidateExport').isDisabled(),true);
      assert.equal(await page.locator('#consentDualCtCandidateExport').isChecked(),false);
      assert.equal(await page.locator('#copyDualCtCandidates').isDisabled(),true);
      assert.equal(await page.locator('#dualCtCandidateText').textContent(),'');
      assert.match(await page.locator('#dualCtDiagnosticState').innerText(),/retention window ended/);
      assert.equal(await page.locator('#dualCtBankState').textContent(),'');
      assert.equal(await page.evaluate(()=>window.calls.length),afterRefresh,'refresh did not renew retention or poll');
      await page.close();
    }
  } finally {await browser.close();}
});

test('completed capture can be reviewed after live expiry; pending, failure, identity change and navigation revoke sharing',async()=>{
  const browser=await chromium.launch();
  try {
    const page=await setup(browser,{width:390,height:844},true);
    await page.locator('#refreshDualCtResearch').click();
    assert.match(await page.locator('#dualCtPreviewState').innerText(),/Live candidate values have expired/);
    assert.equal(await page.locator('#consentDualCtCandidateExport').isDisabled(),false);
    await page.locator('#consentDualCtCandidateExport').check();
    assert.equal(await page.locator('#copyDualCtCandidates').isDisabled(),false);
    await page.evaluate(()=>{window.id='22222222-2222-4222-8222-222222222222';});
    await page.locator('#refreshDualCtResearch').click();
    assert.equal(await page.locator('#consentDualCtCandidateExport').isChecked(),false);
    await page.locator('#consentDualCtCandidateExport').check();
    await page.evaluate(()=>{window.pending=true;});
    await page.locator('#refreshDualCtPreview').click();
    assert.equal(await page.locator('#copyDualCtCandidates').isDisabled(),true);
    assert.equal(await page.locator('#dualCtCandidateText').textContent(),'');
    await page.clock.runFor(20001);
    assert.equal(await page.locator('#consentDualCtCandidateExport').isChecked(),false);
    await page.evaluate(()=>{window.pending=false;window.pendingCallback(null,window.view());});
    assert.equal(await page.locator('#copyDualCtCandidates').isDisabled(),true,'late response cannot resurrect consent/evidence');
    await page.locator('#refreshDualCtResearch').click(); await page.locator('#consentDualCtCandidateExport').check();
    await page.evaluate(()=>{window.failure=true;}); await page.locator('#refreshDualCtResearch').click();
    assert.equal(await page.locator('#consentDualCtCandidateExport').isChecked(),false);
    assert.equal(await page.locator('#copyDualCtCandidates').isDisabled(),true);
    await page.evaluate(()=>{window.failure=false;}); await page.locator('#refreshDualCtResearch').click();
    await page.locator('#consentDualCtCandidateExport').check();
    await page.locator('#stopDualCtResearch').click();
    assert.equal(await page.locator('#dualCtCandidateText').textContent(),'');
    assert.equal(await page.locator('#consentDualCtCandidateExport').isChecked(),false);
    await page.locator('#refreshDualCtResearch').click(); await page.locator('#consentDualCtCandidateExport').check();
    await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
    assert.equal(await page.locator('#dualCtCandidateText').textContent(),'');
    assert.equal(await page.locator('#consentDualCtCandidateExport').isChecked(),false);
    assert.equal(await page.locator('#copyDualCtCandidates').isDisabled(),true);
  } finally {await browser.close();}
});
