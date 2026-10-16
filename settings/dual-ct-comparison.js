'use strict';
(function expose(root) {
  const status=typeof module!=='undefined'&&module.exports?require('./dual-ct-status'):root.EcoFlowDualCtStatus;
  const contract=typeof module!=='undefined'&&module.exports?require('./dual-ct-contract'):root.EcoFlowDualCtContract;
  const hypotheses=contract.banks;
  function arithmetic(parent,rows) {
    if(parent!==773)return [];
    const fields=new Map(rows.map(row=>[row.field,row.value]));
    return [{expression:'4-6=7',required:[4,6,7]},{expression:'1+2+3=7',required:[1,2,3,7]}].map(({expression,required})=>{
      let state='partial';
      if(required.every(field=>fields.has(field))) {
        const v=required.map(field=>fields.get(field));
        const difference=expression==='4-6=7'?v[0]-v[1]-v[2]:v[0]+v[1]+v[2]-v[3];
        state=Math.abs(difference)<=0.001+1e-6*v.reduce((sum,value)=>sum+Math.abs(value),0)?'consistent':'mismatch';
      }
      return {expression,status:state,scope:'single_nested_record',verified:false};
    });
  }
  function records(input,base,numericEnabled) {
    const result=[];const seen=new Set();
    for(const row of (Array.isArray(input)?input.slice(0,4):[])) {
      const key=`${row?.deviceIndex}:${row?.parent}`;
      if(![0,1].includes(row?.deviceIndex)||![773,997].includes(row?.parent)||seen.has(key)
        ||!base.devices.some(device=>device.deviceIndex===row.deviceIndex)
        ||!['observed','invalid','oversized'].includes(row.status)
        ||!Number.isFinite(row.receivedAgeSec)||row.receivedAgeSec<base.lastPacketAgeSec||row.receivedAgeSec>base.retainedForSec+90
        ||!Number.isInteger(row.packetIndex)||row.packetIndex<1||row.packetIndex>2048
        ||!['explicit_zero','omitted_zero_candidate'].includes(row.encodingBasis))continue;
      seen.add(key);
      const fields=[];const ids=new Set();
      for(const field of (Array.isArray(row.fields)?row.fields.slice(0,32):[])) {
        if(!Number.isInteger(field?.field)||field.field<1||field.field>64||![0,1,2,5].includes(field.wire)||ids.has(field.field))continue;
        ids.add(field.field);fields.push({field:field.field,wire:field.wire});
      }
      const candidates=[];const numbers=new Set();
      let invalid=false;
      if(numericEnabled&&row.parent===773&&row.status==='observed') for(const candidate of (Array.isArray(row.candidates)?row.candidates.slice(0,6):[])) {
        if(![1,2,3,4,6,7].includes(candidate?.field)||numbers.has(candidate.field)||candidate.candidateUnit!==null
          ||!fields.some(field=>field.field===candidate.field&&field.wire===5)
          ||!Number.isFinite(candidate.value)||Math.abs(candidate.value)>1e12){invalid=true;continue;}
        numbers.add(candidate.field);candidates.push({field:candidate.field,value:candidate.value,candidateUnit:null});
      }
      if(invalid)candidates.length=0;
      const available=Number.isInteger(row.fieldsAvailable)&&row.fieldsAvailable>=fields.length&&row.fieldsAvailable<=32?row.fieldsAvailable:fields.length;
      result.push({deviceIndex:row.deviceIndex,parent:row.parent,status:invalid?'invalid':row.status,fields,
        fieldsAvailable:available,fieldsIncluded:fields.length,fieldsOmitted:available>fields.length,
        candidates,checks:invalid?[]:numericEnabled&&row.status==='observed'?arithmetic(row.parent,candidates):[],
        packetIndex:row.packetIndex,receivedAgeSec:row.receivedAgeSec,encodingBasis:row.encodingBasis,
        unitsVerified:false,period:'unknown',roleVerified:false});
    }
    return result;
  }
  function annotations(input,base) {
    const result=[];const seen=new Set();
    for(const row of (Array.isArray(input)?input.slice(0,4):[])) {
      const key=`${row?.deviceIndex}:${row?.bank}`;
      if(![0,1].includes(row?.deviceIndex)||!['A','B'].includes(row.bank)||seen.has(key)
        ||!base.devices.some(device=>device.deviceIndex===row.deviceIndex)||!['unknown','looks_like_grid','looks_like_solar','does_not_match'].includes(row.observation))continue;
      seen.add(key);result.push({deviceIndex:row.deviceIndex,bank:row.bank,observation:row.observation,basis:'user_observation',verified:false});
    }
    return result;
  }
  const continuityStates=['baseline','compared','increased','decreased','unchanged','missing','not_updated','invalid','gap','source_changed','out_of_order','same_receipt','structure_only'];
  // Numeric-free observations only. Sharing never imports counter values or promotes a role/unit contract.
  function continuity(input,base,enabled) {
    const rows=[];const seen=new Set();
    if(enabled&&input?.enabled===true&&input.scope==='bounded_capture_receipt_observations')for(const row of (Array.isArray(input.records)?input.records.slice(0,4):[])) {
      const key=`${row?.deviceIndex}:${row?.parent}`;
      if(![0,1].includes(row?.deviceIndex)||![773,997].includes(row?.parent)||seen.has(key)
        ||!base.devices.some(device=>device.deviceIndex===row.deviceIndex)||!continuityStates.includes(row.status)
        ||!Number.isFinite(row.receivedAgeSec)||row.receivedAgeSec<base.lastPacketAgeSec||row.receivedAgeSec>base.retainedForSec+90
        ||!Number.isInteger(row.observations)||row.observations<1||row.observations>2048)continue;
      seen.add(key);const fields=[];const ids=new Set();
      if(row.parent===773)for(const field of (Array.isArray(row.fields)?row.fields.slice(0,6):[])){
        if(![1,2,3,4,6,7].includes(field?.field)||ids.has(field.field)||!continuityStates.includes(field.status))continue;
        ids.add(field.field);fields.push({field:field.field,status:field.status});
      }
      const events={};for(const state of continuityStates){const count=row.events?.[state];
        if(Number.isInteger(count)&&count>0&&count<=2048)events[state]=count;}
      const projected={deviceIndex:row.deviceIndex,parent:row.parent,status:row.status,observations:row.observations,
        receivedAgeSec:row.receivedAgeSec,fields,events};
      if(row.fieldsOmitted===true)projected.fieldsOmitted=true;
      if(typeof row.recordObserved==='boolean'&&Number.isInteger(row.recordObservations)&&row.recordObservations>=0
        &&row.recordObservations<=row.observations&&row.recordObserved===(row.recordObservations>0)
        &&Number.isFinite(row.lastPacketAgeSec)&&row.lastPacketAgeSec>=base.lastPacketAgeSec&&row.lastPacketAgeSec<=row.receivedAgeSec){
        projected.recordObserved=row.recordObserved;projected.recordObservations=row.recordObservations;
        projected.lastPacketAgeSec=row.lastPacketAgeSec;
      }
      rows.push(projected);
    }
    const available=Number.isInteger(input?.recordsAvailable)&&input.recordsAvailable>=rows.length&&input.recordsAvailable<=4?input.recordsAvailable:rows.length;
    return {enabled:enabled&&input?.enabled===true,scope:'bounded_capture_receipt_observations',records:rows,
      recordsAvailable:available,recordsIncluded:rows.length,recordsOmitted:available>rows.length,
      valuesIncluded:false,period:'unknown',dailyAvailable:false,unitsVerified:false,resetVerified:false,contributesToEnergy:false};
  }
  function buildComparison(input,notes,limit) {
    input=expand(input);if(!input)return null;
    const prior=input?.reportType==='dual_ct_comparison';
    const original=prior?input.candidateSnapshot:input;
    const base=prior?status.diagnosticExport({...original,diagnosticSnapshot:{...original,kind:'historical_capture'}},true):status.diagnosticExport(original,true);
    if(!base)return null;
    const source=prior?input:input?.diagnosticSnapshot;
    const enabled=source?.counterResearchEnabled===true;
    const counterRecords=records(source?.counterRecords,base,enabled);
    const report={reportType:'dual_ct_comparison',schemaVersion:1,candidateSnapshot:base,
      annotations:annotations(notes===undefined?(prior?input.annotations:[]):notes,base),counterResearchEnabled:enabled,counterRecords,
      historical:true,notLive:true,simultaneous:false,unitsVerified:false,directionVerified:false,period:'unknown',
      contributesToEnergy:false,controlsEnabled:false,pairingEnabled:false};
    // Optional extension; older comparison JSON remains accepted without invented continuity.
    if(source?.counterContinuity)report.counterContinuity=continuity(source.counterContinuity,base,enabled);
    const included=counterRecords.reduce((sum,row)=>sum+row.candidates.length,0);
    report.counterReadingsAvailable=prior&&Number.isInteger(input.counterReadingsAvailable)&&input.counterReadingsAvailable>=included&&input.counterReadingsAvailable<=12?input.counterReadingsAvailable:included;
    report.counterReadingsIncluded=included;report.counterReadingsOmitted=report.counterReadingsAvailable>included;
    const recordsAvailable=prior&&Number.isInteger(input.counterRecordsAvailable)&&input.counterRecordsAvailable>=counterRecords.length&&input.counterRecordsAvailable<=4?input.counterRecordsAvailable:counterRecords.length;
    report.counterRecordsAvailable=recordsAvailable;report.counterRecordsIncluded=counterRecords.length;report.counterRecordsOmitted=recordsAvailable>counterRecords.length;
    // Share repeated receipt metadata once rather than sacrificing whole banks.
    // Copy/download/manual fallback MUST use serialize(); local shape stays schema 1.
    const size=()=>serialize(report).length;
    while(limit&&size()>7500) {
      const record=counterRecords.find(row=>row.fields.length>Math.max(4,row.candidates.length)
        &&row.fields.some(field=>!row.candidates.some(candidate=>candidate.field===field.field)));
      if(record){const index=record.fields.findIndex(field=>!record.candidates.some(candidate=>candidate.field===field.field));
        record.fields.splice(index,1);record.fieldsIncluded--;record.fieldsOmitted=true;continue;}
      // Whole-record outcomes/counts precede repetitive per-child continuity text.
      const detail=report.counterContinuity?.records.find(row=>row.fields.length);
      if(detail){detail.fields=[];detail.fieldsOmitted=true;continue;}
      const secondary=contract.fields.filter(row=>['voltage','current'].includes(row.quantity)).map(row=>row.field);
      const rich=base.devices.filter(device=>device.readings.some(row=>secondary.includes(row.field)))
        .sort((a,b)=>b.readings.length-a.readings.length)[0];
      if(rich){const index=rich.readings.findIndex(row=>secondary.includes(row.field));
        if(index>=0){rich.readings.splice(index,1);base.readingsIncluded--;base.readingsOmitted=true;continue;}}
      if(report.counterContinuity?.records.length){report.counterContinuity.records.pop();report.counterContinuity.recordsIncluded--;report.counterContinuity.recordsOmitted=true;continue;}
      const structureOnly=counterRecords.findIndex(row=>!row.candidates.length);
      if(structureOnly>=0){counterRecords.splice(structureOnly,1);report.counterRecordsIncluded--;report.counterRecordsOmitted=true;continue;}
      // Last resort: omit a whole power bank, never misleadingly keep one phase.
      const device=base.devices.find(row=>row.readings.length>4);
      if(device){const bank=hypotheses[1];const ids=[bank.total,...bank.power];
        const remaining=device.readings.filter(row=>!ids.includes(row.field));
        if(remaining.length<device.readings.length){base.readingsIncluded-=device.readings.length-remaining.length;
          device.readings=remaining;base.readingsOmitted=true;continue;}}
      if(base.bankChecks?.length){base.bankChecks.pop();base.bankChecksIncluded--;base.bankChecksOmitted=true;continue;}
      return null;
    }
    return report;
  }
  function comparisonExport(input,notes) {return buildComparison(input,notes,true);}
  function comparisonView(input,notes) {return buildComparison(input,notes,false);}
  // Schema 2 sharing factors repeated receipt metadata out of scalar rows. The
  // canonical local view remains schema 1; all imported sharing is revalidated.
  function serialize(report) {
    report=expand(report);
    if(report?.reportType!=='dual_ct_comparison')throw new Error('Invalid comparison report');
    const packed=JSON.parse(JSON.stringify(report));packed.schemaVersion=2;
    for(const device of packed.candidateSnapshot.devices){
      const receipts=[];const keys=[];
      device.readings=device.readings.map(row=>{
        const receipt={receivedAgeSec:row.receivedAgeSec,encodingBasis:row.encodingBasis,
          representation:row.representation,...(row.packetIndex!==undefined?{packetIndex:row.packetIndex}:{})};
        const key=JSON.stringify(receipt);let index=keys.indexOf(key);
        if(index<0){index=keys.length;keys.push(key);receipts.push(receipt);}
        return {field:row.field,value:row.value,candidateUnit:row.candidateUnit,receiptIndex:index};
      });
      device.readingReceipts=receipts;
    }
    for(const row of packed.candidateSnapshot.bankChecks||[]){
      const project=check=>check&&Object.fromEntries(['status','packetIndex','receivedAgeSec','encodingBasis',
        'presentPowerFields','reportedTotal','phaseValues'].filter(key=>check[key]!==undefined).map(key=>[key,check[key]]));
      const same=row.lastComplete&&JSON.stringify(row.lastComplete)===JSON.stringify(row.latest);
      row.latest=project(row.latest);row.lastComplete=same?{sameAsLatest:true}:project(row.lastComplete);
    }
    return JSON.stringify(packed);
  }
  function expand(input) {
    if(input?.reportType!=='dual_ct_comparison'||input.schemaVersion===1)return input;
    if(input.schemaVersion!==2||!Array.isArray(input.candidateSnapshot?.devices)
      ||input.candidateSnapshot.devices.length>2)return null;
    const base={...input.candidateSnapshot,devices:[]};
    for(const device of input.candidateSnapshot.devices){
      if(!Array.isArray(device?.readingReceipts)||device.readingReceipts.length>20
        ||!Array.isArray(device.readings)||device.readings.length>20)return null;
      const readings=[];
      for(const row of device.readings){
        if(!Number.isInteger(row?.receiptIndex)||row.receiptIndex<0||row.receiptIndex>=device.readingReceipts.length)return null;
        const receipt=device.readingReceipts[row.receiptIndex];
        if(!receipt||receipt.representation!=='float32_candidate')return null;
        readings.push({field:row.field,value:row.value,candidateUnit:row.candidateUnit,
          receivedAgeSec:receipt.receivedAgeSec,encodingBasis:receipt.encodingBasis,
          representation:receipt.representation,...(receipt.packetIndex!==undefined?{packetIndex:receipt.packetIndex}:{})});
      }
      base.devices.push({deviceIndex:device.deviceIndex,readings});
    }
    if(base.bankChecks!==undefined&&(!Array.isArray(base.bankChecks)||base.bankChecks.length>4
      ||base.bankChecks.some(row=>!row||typeof row!=='object')))return null;
    base.bankChecks=(base.bankChecks||[]).map(row=>{
      const project=check=>check?{...check,bank:row.bank,scope:'single_decoded_payload',
        mappingVerified:false,roleVerified:false,measurementSimultaneityVerified:false}:null;
      return {...row,latest:project(row.latest),lastComplete:project(row.lastComplete?.sameAsLatest===true?row.latest:row.lastComplete)};
    });
    return {...input,schemaVersion:1,candidateSnapshot:base};
  }
  // Display assumptions only. Never changes raw values, annotations, verification,
  // counter accounting, CT-port selection or any production capability.
  function workingPreview(report) {
    const counters=[];
    const names={1:'phase_1_net',2:'phase_2_net',3:'phase_3_net',4:'import',6:'export',7:'net'};
    if(report?.counterResearchEnabled===true)for(const row of report.counterRecords||[]){
      if(row.parent!==773||row.status!=='observed')continue;
      for(const candidate of row.candidates||[])if(names[candidate.field]&&candidate.candidateUnit===null
        &&Number.isFinite(candidate.value)&&Math.abs(candidate.value)<=1e12)counters.push({
        deviceIndex:row.deviceIndex,field:candidate.field,role:names[candidate.field],
        raw:candidate.value,kWhCandidate:candidate.value/contract.candidateKWhDivisor,receivedAgeSec:row.receivedAgeSec,
        verified:false});
    }
    return {basis:'provisional_read_only',bankRoles:{...contract.workingRoles},
      signConvention:'raw_unchanged',solarIncludesPossibleBatteryDischarge:true,counters,
      unitsVerified:false,directionVerified:false,period:'unknown',resetVerified:false,contributesToEnergy:false};
  }
  function age(report,seconds,view=false) {
    if(!Number.isFinite(seconds)||seconds<0)return null;
    report=expand(report);if(!report)return null;
    const result=JSON.parse(JSON.stringify(report));
    const base=result.candidateSnapshot;
    base.retainedForSec+=seconds;base.retentionRemainingSec-=seconds;base.lastPacketAgeSec+=seconds;
    base.devices.forEach(device=>device.readings.forEach(row=>{row.receivedAgeSec+=seconds;}));
    base.bankChecks?.forEach(row=>[row.latest,row.lastComplete].forEach(check=>{if(check)check.receivedAgeSec+=seconds;}));
    result.counterRecords.forEach(row=>{row.receivedAgeSec+=seconds;});
    result.counterContinuity?.records.forEach(row=>{row.receivedAgeSec+=seconds;
      if(Number.isFinite(row.lastPacketAgeSec))row.lastPacketAgeSec+=seconds;});
    return buildComparison(result,undefined,!view);
  }
  function render(element,report,translate,onAnnotation) {
    element.textContent='';if(!report)return 0;
    let ttl=0;const doc=element.ownerDocument;
    const append=(parent,tag,text)=>{const el=doc.createElement(tag);el.textContent=text;parent.appendChild(el);return el;};
    append(element,'p',translate('comparison_warning'));
    append(element,'p',translate('working_assumptions'));
    append(element,'h4',translate('readiness_title'));
    append(element,'p',translate('readiness_device_blocked'));
    append(element,'p',translate('readiness_energy_blocked'));
    const ageText=row=>{if(contract.isFreshAge(row.receivedAgeSec*1000)){const ms=contract.staleMs-row.receivedAgeSec*1000;ttl=ttl?Math.min(ttl,ms):ms;}
      return `${Math.floor(row.receivedAgeSec)} s · ${translate(contract.isFreshAge(row.receivedAgeSec*1000)?'comparison_recent':'comparison_stale')}`;};
    for(const device of report.candidateSnapshot.devices) for(const bank of hypotheses) {
      const card=append(element,'section','');card.className='dual-ct-card';
      append(card,'h4',`${translate('meter')} ${device.deviceIndex+1} · ${translate('bank_candidate')} ${bank.bank}`);
      append(card,'p',translate(bank.bank==='A'?'working_grid':'working_solar'));
      const observation=report.annotations.find(row=>row.deviceIndex===device.deviceIndex&&row.bank===bank.bank)?.observation;
      if(observation==='does_not_match'||observation===(bank.bank==='A'?'looks_like_solar':'looks_like_grid'))append(card,'p',translate('working_conflict'));
      const checks=report.candidateSnapshot.bankChecks?.find(row=>row.deviceIndex===device.deviceIndex&&row.bank===bank.bank);
      if(checks){append(card,'p',`${translate('bank_latest')}: ${translate('bank_'+checks.latest.status)} · ${ageText(checks.latest)}`);
        if(checks.lastComplete&&checks.lastComplete.packetIndex!==checks.latest.packetIndex)append(card,'p',
          `${translate('bank_last_complete')}: ${translate('bank_'+checks.lastComplete.status)} · ${ageText(checks.lastComplete)}`);}
      const label=append(card,'label',translate('comparison_observation'));
      const select=append(label,'select','');select.setAttribute('aria-label',`${translate('comparison_observation')} ${device.deviceIndex+1} ${bank.bank}`);
      select.dataset.deviceIndex=device.deviceIndex;select.dataset.bank=bank.bank;
      for(const value of ['unknown','looks_like_grid','looks_like_solar','does_not_match']) {
        const option=append(select,'option',translate('comparison_'+value));option.value=value;
      }
      select.value=report.annotations.find(row=>row.deviceIndex===device.deviceIndex&&row.bank===bank.bank)?.observation||'unknown';
      select.addEventListener('change',()=>onAnnotation?.({deviceIndex:device.deviceIndex,bank:bank.bank,observation:select.value}));
      const value=field=>{const row=device.readings.find(reading=>reading.field===field);
        if(!row)return translate('comparison_missing');
        ageText(row);
        return `${row.value} · ${Math.floor(row.receivedAgeSec)} s · ${translate(contract.isFreshAge(row.receivedAgeSec*1000)?'comparison_recent_short':'comparison_stale_short')}`;};
      append(card,'p',`${translate('bank_total_power')} (W?): ${value(bank.total)}`);
      const table=append(card,'table','');const head=append(table,'tr','');
      for(const text of [translate('bank_phase'),'W?','V?','A?'])append(head,'th',text);
      for(let i=0;i<3;i++){const tr=append(table,'tr','');append(tr,'th',String(i+1));
        for(const quantity of ['power','voltage','current'])append(tr,'td',value(bank[quantity][i]));}
    }
    append(element,'h4',translate('counter_title'));append(element,'p',translate('counter_warning'));
    if(!report.counterResearchEnabled)append(element,'p',translate('counter_structure_only'));
    if(!report.counterRecords.length)append(element,'p',translate('counter_missing'));
    for(const row of report.counterRecords){const card=append(element,'section','');card.className='dual-ct-card';
      append(card,'h4',`${translate('meter')} ${row.deviceIndex+1} · ${translate('counter_record')} ${row.parent} · ${ageText(row)}`);
      append(card,'p',`${translate('counter_'+row.status)} · ${row.fields.map(field=>`${field.field}/${field.wire}`).join(', ')}`);
      if(row.parent===997)append(card,'p',translate('counter_997_structure'));
      for(const candidate of row.candidates)append(card,'p',`${row.parent}.${candidate.field}: ${candidate.value} · ${translate('counter_unscaled')}`);
      if(row.parent===773&&report.counterResearchEnabled){
        append(card,'p',translate('working_counter_warning'));
        for(const candidate of workingPreview(report).counters.filter(item=>item.deviceIndex===row.deviceIndex)){
          append(card,'p',`${translate('working_'+candidate.role)} (kWh?): ${candidate.kWhCandidate} · ${ageText(candidate)}`);
        }
      }
      for(const check of row.checks)append(card,'p',`${check.expression}: ${translate('bank_'+check.status)}`);
    }
    append(element,'h4',translate('continuity_title'));
    append(element,'p',translate('continuity_warning'));
    append(element,'p',translate('continuity_daily_unavailable'));
    if(!report.counterContinuity?.records.length)append(element,'p',translate('continuity_not_reported'));
    for(const row of report.counterContinuity?.records||[]){
      const card=append(element,'section','');card.className='dual-ct-card';
      append(card,'h4',`${translate('meter')} ${row.deviceIndex+1} · ${translate('counter_record')} ${row.parent} · ${row.recordObserved===false?translate('continuity_no_record'):ageText(row)}`);
      append(card,'p',`${translate('continuity_'+row.status)} · ${translate('continuity_observations')}: ${row.observations}`);
      if(typeof row.recordObserved==='boolean')append(card,'p',row.recordObserved
        ?`${translate('continuity_record_receipts')}: ${row.recordObservations} · ${translate('continuity_packet_age')}: ${Math.floor(row.lastPacketAgeSec)} s`
        :translate('continuity_no_record'));
      for(const field of row.fields)append(card,'p',`${row.parent}.${field.field}: ${translate('continuity_'+field.status)}`);
      for(const [state,count] of Object.entries(row.events))append(card,'p',`${translate('continuity_'+state)}: ${count}`);
    }
    return ttl;
  }
  const api={comparisonExport,comparisonView,serialize,expand,workingPreview,age,render,arithmetic,continuity};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.EcoFlowDualCtComparison=api;
}(typeof window==='undefined'?{}:window));
