'use strict';
(function expose(root) {
  const status=typeof module!=='undefined'&&module.exports?require('./dual-ct-status'):root.EcoFlowDualCtStatus;
  const hypotheses=[{bank:'A',total:515,power:[962,963,772],voltage:[956,957,771],current:[958,959,784]},
    {bank:'B',total:998,power:[991,992,993],voltage:[985,986,987],current:[988,989,990]}];
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
  const continuityStates=['baseline','compared','increased','decreased','unchanged','missing','invalid','gap','source_changed','out_of_order','same_receipt','structure_only'];
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
      rows.push({deviceIndex:row.deviceIndex,parent:row.parent,status:row.status,observations:row.observations,
        receivedAgeSec:row.receivedAgeSec,fields,events});
    }
    const available=Number.isInteger(input?.recordsAvailable)&&input.recordsAvailable>=rows.length&&input.recordsAvailable<=4?input.recordsAvailable:rows.length;
    return {enabled:enabled&&input?.enabled===true,scope:'bounded_capture_receipt_observations',records:rows,
      recordsAvailable:available,recordsIncluded:rows.length,recordsOmitted:available>rows.length,
      valuesIncluded:false,period:'unknown',dailyAvailable:false,unitsVerified:false,resetVerified:false,contributesToEnergy:false};
  }
  function buildComparison(input,notes,limit) {
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
    const size=()=>JSON.stringify(report,null,2).length;
    while(limit&&size()>7500) {
      if(base.bankChecks?.length){base.bankChecks.pop();base.bankChecksIncluded--;base.bankChecksOmitted=true;continue;}
      const record=counterRecords.find(row=>row.fields.some(field=>!row.candidates.some(candidate=>candidate.field===field.field)));
      if(record){const index=record.fields.findIndex(field=>!record.candidates.some(candidate=>candidate.field===field.field));
        record.fields.splice(index,1);record.fieldsIncluded--;record.fieldsOmitted=true;continue;}
      const structureOnly=counterRecords.findIndex(row=>!row.candidates.length);
      if(structureOnly>=0){counterRecords.splice(structureOnly,1);report.counterRecordsIncluded--;report.counterRecordsOmitted=true;continue;}
      // Keep both observed bank totals where possible, but don't let verbose scalar
      // metadata evict all of the new continuity evidence from a combined report.
      const rich=base.devices.filter(device=>device.readings.length>2).sort((a,b)=>b.readings.length-a.readings.length)[0];
      if(rich){let index=rich.readings.findIndex(row=>[956,957,771,958,959,784,985,986,987,988,989,990].includes(row.field));
        if(index<0)index=rich.readings.findIndex(row=>![515,998].includes(row.field));
        if(index>=0){rich.readings.splice(index,1);base.readingsIncluded--;base.readingsOmitted=true;continue;}}
      if(report.counterContinuity?.records.length){report.counterContinuity.records.pop();report.counterContinuity.recordsIncluded--;report.counterContinuity.recordsOmitted=true;continue;}
      const device=base.devices.reduce((a,b)=>a.readings.length>=b.readings.length?a:b);
      if(device.readings.length>1){device.readings.pop();base.readingsIncluded--;base.readingsOmitted=true;continue;}
      return null;
    }
    return report;
  }
  function comparisonExport(input,notes) {return buildComparison(input,notes,true);}
  function comparisonView(input,notes) {return buildComparison(input,notes,false);}
  function age(report,seconds,view=false) {
    if(!Number.isFinite(seconds)||seconds<0)return null;
    const result=JSON.parse(JSON.stringify(report));
    const base=result.candidateSnapshot;
    base.retainedForSec+=seconds;base.retentionRemainingSec-=seconds;base.lastPacketAgeSec+=seconds;
    base.devices.forEach(device=>device.readings.forEach(row=>{row.receivedAgeSec+=seconds;}));
    base.bankChecks?.forEach(row=>[row.latest,row.lastComplete].forEach(check=>{if(check)check.receivedAgeSec+=seconds;}));
    result.counterRecords.forEach(row=>{row.receivedAgeSec+=seconds;});
    result.counterContinuity?.records.forEach(row=>{row.receivedAgeSec+=seconds;});
    return buildComparison(result,undefined,!view);
  }
  function render(element,report,translate,onAnnotation) {
    element.textContent='';if(!report)return 0;
    let ttl=0;const doc=element.ownerDocument;
    const append=(parent,tag,text)=>{const el=doc.createElement(tag);el.textContent=text;parent.appendChild(el);return el;};
    append(element,'p',translate('comparison_warning'));
    append(element,'h4',translate('readiness_title'));
    append(element,'p',translate('readiness_device_blocked'));
    append(element,'p',translate('readiness_energy_blocked'));
    const ageText=row=>{if(row.receivedAgeSec<90){const ms=(90-row.receivedAgeSec)*1000;ttl=ttl?Math.min(ttl,ms):ms;}
      return `${Math.floor(row.receivedAgeSec)} s · ${translate(row.receivedAgeSec>=90?'comparison_stale':'comparison_recent')}`;};
    for(const device of report.candidateSnapshot.devices) for(const bank of hypotheses) {
      const card=append(element,'section','');card.className='dual-ct-card';
      append(card,'h4',`${translate('meter')} ${device.deviceIndex+1} · ${translate('bank_candidate')} ${bank.bank}`);
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
        return `${row.value} · ${Math.floor(row.receivedAgeSec)} s · ${translate(row.receivedAgeSec>=90?'comparison_stale_short':'comparison_recent_short')}`;};
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
      for(const check of row.checks)append(card,'p',`${check.expression}: ${translate('bank_'+check.status)}`);
    }
    append(element,'h4',translate('continuity_title'));
    append(element,'p',translate('continuity_warning'));
    append(element,'p',translate('continuity_daily_unavailable'));
    if(!report.counterContinuity?.records.length)append(element,'p',translate('continuity_not_reported'));
    for(const row of report.counterContinuity?.records||[]){
      const card=append(element,'section','');card.className='dual-ct-card';
      append(card,'h4',`${translate('meter')} ${row.deviceIndex+1} · ${translate('counter_record')} ${row.parent} · ${ageText(row)}`);
      append(card,'p',`${translate('continuity_'+row.status)} · ${translate('continuity_observations')}: ${row.observations}`);
      for(const field of row.fields)append(card,'p',`${row.parent}.${field.field}: ${translate('continuity_'+field.status)}`);
      for(const [state,count] of Object.entries(row.events))append(card,'p',`${translate('continuity_'+state)}: ${count}`);
    }
    return ttl;
  }
  const api={comparisonExport,comparisonView,age,render,arithmetic,continuity};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.EcoFlowDualCtComparison=api;
}(typeof window==='undefined'?{}:window));
