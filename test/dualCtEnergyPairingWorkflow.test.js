'use strict';
const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const path = require('node:path'); const { chromium } = require('playwright');
const html = fs.readFileSync(path.join(__dirname, '..', 'drivers/smartmeter_dual_ct_energy/pair/energy_setup.html'), 'utf8');
async function pageFor(browser, viewport, language, enabled) {
  const page = await browser.newPage({ viewport });
  await page.setContent('<div id="pair-root"></div>'); await page.clock.install({ time: new Date(100000) });
  await page.evaluate(({ translations, enabled }) => {
    window.calls = []; window.views = [];
    window.Homey = { __(key) { return key.split('.').reduce((v, k) => v?.[k], translations) || key; },
      async emit(name, input) {
        window.calls.push({ name, input });
        if (name === 'dual_ct_energy_access') return { enabled };
        if (name === 'check_app_credentials') return true;
        if (name === 'dual_ct_energy_candidates') return [{ sn: 'SYNTHETIC01', label: 'Dual CT · IC01' }];
        if (name === 'dual_ct_energy_review') return { token: 'synthetic-review', expiresAt: Date.now() + 90000, sourceLabel: '<script>PRIVATE</script>' };
        return true;
      }, async showView(view) { window.views.push(view); } };
  }, { translations: require(`../locales/${language}.json`), enabled });
  await page.locator('#pair-root').evaluate((root, content) => { root.innerHTML = content; }, html);
  // innerHTML does not execute scripts; run only the page's own inline pairing script.
  await page.addScriptTag({ content: html.match(/<script type="text\/javascript">([\s\S]*?)<\/script>/)[1] });
  return page;
}
test('desktop/mobile blocked Energy entry is local, translated and cannot prompt login or discovery', async () => {
  const browser = await chromium.launch();
  try {
    for (const language of ['en', 'de', 'nl']) for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const page = await pageFor(browser, viewport, language, false);
      assert.equal(await page.locator('#connection').isVisible(), false);
      assert.equal(await page.locator('#status').innerText(), require(`../locales/${language}.json`).dual_ct_energy.unavailable);
      assert.deepEqual(await page.evaluate(() => window.calls.map(row => row.name)), ['dual_ct_energy_access']);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); await page.close();
    }
  } finally { await browser.close(); }
});
test('desktop/mobile Energy review requires both acknowledgements, expires and passes only consent to native add flow', async () => {
  const browser = await chromium.launch();
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const page = await pageFor(browser, viewport, 'en', true);
      await page.locator('#find').click(); await page.locator('#review').click();
      assert.equal(await page.locator('#approve').isDisabled(), true);
      assert.equal(await page.locator('#reviewSource script').count(), 0, 'source label rendered as text');
      await page.locator('#scopeConsent').check(); assert.equal(await page.locator('#approve').isDisabled(), true);
      await page.locator('#overlapConsent').check(); assert.equal(await page.locator('#approve').isEnabled(), true);
      await page.clock.runFor(90001); assert.equal(await page.locator('#confirmation').isVisible(), false);
      assert.deepEqual(await page.evaluate(() => window.views), []);
      await page.locator('#review').click();
      assert.equal(await page.locator('#scopeConsent').isChecked(), false); assert.equal(await page.locator('#overlapConsent').isChecked(), false);
      await page.locator('#scopeConsent').check(); await page.locator('#overlapConsent').check(); await page.locator('#approve').click();
      assert.deepEqual(await page.evaluate(() => window.views), ['list_devices']);
      const consent = await page.evaluate(() => window.calls.find(row => row.name === 'dual_ct_energy_approve').input);
      assert.deepEqual(consent, { token: 'synthetic-review', consent: true, externalOverlapReviewed: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.close();
    }
  } finally { await browser.close(); }
});

test('three-phase community selection requires a separate acknowledgement and defaults to single phase', async () => {
  const browser = await chromium.launch();
  try {
    const page = await pageFor(browser, {width:390,height:844}, 'en', true);
    await page.locator('#find').click(); assert.equal(await page.locator('#wiring').inputValue(),'single_phase');
    await page.locator('#wiring').selectOption('three_phase_community'); await page.locator('#review').click();
    assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.name==='dual_ct_energy_review').length),0);
    await page.locator('#trialConsent').check(); await page.locator('#review').click();
    assert.deepEqual(await page.evaluate(()=>window.calls.find(c=>c.name==='dual_ct_energy_review').input),
      {sn:'SYNTHETIC01',mode:'three_phase_community',communityConsent:true});
    await page.locator('#wiring').selectOption('single_phase');
    assert.equal(await page.locator('#confirmation').isHidden(),true);
    assert.equal(await page.locator('#trialConsent').isChecked(),false);
  } finally {await browser.close();}
});

test('mobile review shows bounded progress, times out safely and rejects late confirmation', async () => {
  const browser = await chromium.launch();
  try {
    const page = await pageFor(browser, {width:390,height:844}, 'en', true);
    await page.evaluate(() => {
      const emit = Homey.emit;
      Homey.emit = (name,input) => name === 'dual_ct_energy_review'
        ? new Promise(resolve => { window.finishReview = resolve; }) : emit(name,input);
    });
    await page.locator('#find').click(); await page.locator('#review').click();
    assert.equal(await page.locator('#reviewStatus').innerText(), require('../locales/en.json').dual_ct_energy.reviewing);
    assert.equal(await page.locator('#reviewStatus').evaluate(e => {const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),true);
    await page.clock.runFor(30001);
    assert.equal(await page.locator('#reviewStatus').innerText(),require('../locales/en.json').dual_ct_energy.reviewTimeout);
    assert.equal(await page.locator('#review').isEnabled(),true);
    await page.evaluate(() => window.finishReview({token:'late',expiresAt:Date.now()+90000,sourceLabel:'Late'}));
    assert.equal(await page.locator('#confirmation').isHidden(),true);
    assert.equal(await page.locator('#approve').isDisabled(),true);
    assert.deepEqual(await page.evaluate(()=>window.views),[]);
  } finally {await browser.close();}
});

test('mobile review failures are visible beside the action without exposing backend errors', async () => {
  const browser = await chromium.launch();
  try {
    for(const language of ['en','de','nl']) {
      const page=await pageFor(browser,{width:390,height:600},language,true);
      await page.evaluate(()=>{const emit=Homey.emit;Homey.emit=(name,input)=>name==='dual_ct_energy_review'?Promise.reject(new Error('PRIVATE_BACKEND_DETAILS')):emit(name,input);});
      await page.locator('#find').click(); await page.locator('#review').click();
      assert.equal(await page.locator('#reviewStatus').innerText(),require(`../locales/${language}.json`).dual_ct_energy.reviewFailed);
      assert.equal(await page.locator('#reviewStatus').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),true);
      assert.equal(await page.locator('body').innerText().then(s=>s.includes('PRIVATE_BACKEND_DETAILS')),false);
      assert.equal(await page.locator('#review').isEnabled(),true); await page.close();
    }
  } finally {await browser.close();}
});

test('three-phase confirmation describes three phases rather than asking for single-phase consent', async () => {
  const browser=await chromium.launch();
  try {
    const page=await pageFor(browser,{width:390,height:844},'en',true);
    await page.locator('#find').click();await page.locator('#wiring').selectOption('three_phase_community');
    await page.locator('#trialConsent').check();await page.locator('#review').click();
    assert.equal(await page.locator('#scopeText').innerText(),require('../locales/en.json').dual_ct_energy.threePhaseScopeText);
    assert.equal(await page.locator('#confirmation').isVisible(),true);
  }finally{await browser.close();}
});

test('review displays only allowlisted translated failure classifications',async()=>{
 const browser=await chromium.launch();
 try{
  for(const [reason,key] of [['source_read_failed','reviewSourceFailed'],['inventory_unknown','reviewInventoryFailed'],['grid_source_overlap','reviewOverlap'],['contract_blocked','reviewContractFailed'],['PRIVATE_ERROR','reviewFailed']]){
   const page=await pageFor(browser,{width:390,height:844},'en',true);
   await page.evaluate(reason=>{const emit=Homey.emit;Homey.emit=(name,input)=>name==='dual_ct_energy_review'?Promise.reject(new Error('DUAL_CT_REVIEW:'+reason)):emit(name,input);},reason);
   await page.locator('#find').click();await page.locator('#review').click();
   assert.equal(await page.locator('#reviewStatus').innerText(),require('../locales/en.json').dual_ct_energy[key]);
   assert.equal(await page.locator('#confirmation').isHidden(),true);await page.close();
  }
 }finally{await browser.close();}
});

test('mobile overlap review shows local names as text, stays blocked and clears on selection changes',async()=>{
 const browser=await chromium.launch();
 try{
  for(const language of ['en','de','nl']){
   const page=await pageFor(browser,{width:390,height:600},language,true);
   await page.evaluate(()=>{const emit=Homey.emit;Homey.emit=(name,input)=>name==='dual_ct_energy_review'?Promise.resolve({blocked:true,reason:'grid_source_overlap',devices:['Earlier meter','<img src=x onerror=alert(1)>',null,'x'.repeat(80),'Second meter'],total:8}):emit(name,input);});
   await page.locator('#find').click();await page.locator('#review').click();
   assert.deepEqual(await page.locator('#overlapDevices li').allTextContents(),['Earlier meter','<img src=x onerror=alert(1)>',require(`../locales/${language}.json`).dual_ct_energy.unnamedOverlapDevice,'x'.repeat(80),'Second meter']);
   assert.equal(await page.locator('#overlapDevices img').count(),0);
   assert.match(await page.locator('#overlapMore').innerText(),/: 3$/);
   assert.equal(await page.locator('#confirmation').isHidden(),true);assert.equal(await page.locator('#approve').isDisabled(),true);
   assert.deepEqual(await page.evaluate(()=>window.views),[]);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.locator('#wiring').selectOption('three_phase_community');
   assert.equal(await page.locator('#overlapDetails').isHidden(),true);assert.equal(await page.locator('#overlapDevices li').count(),0);
   await page.close();
  }
 }finally{await browser.close();}
});

test('malformed overlap responses cannot display arbitrary payloads or enable confirmation',async()=>{
 const browser=await chromium.launch();
 try{
  for(const payload of [{devices:['x'],total:0},{devices:[{id:'PRIVATE'}],total:1},{devices:['x'.repeat(81)],total:1},{devices:['one','two','three','four','five','six'],total:6}]){
   const page=await pageFor(browser,{width:390,height:844},'en',true);
   await page.evaluate(payload=>{const emit=Homey.emit;Homey.emit=(name,input)=>name==='dual_ct_energy_review'?Promise.resolve({blocked:true,reason:'grid_source_overlap',...payload}):emit(name,input);},payload);
   await page.locator('#find').click();await page.locator('#review').click();
   assert.equal(await page.locator('#reviewStatus').innerText(),require('../locales/en.json').dual_ct_energy.reviewFailed);
   assert.equal(await page.locator('#overlapDetails').isHidden(),true);assert.equal(await page.locator('#approve').isDisabled(),true);
   assert.equal(await page.locator('body').innerText().then(t=>t.includes('PRIVATE')),false);await page.close();
  }
 }finally{await browser.close();}
});
