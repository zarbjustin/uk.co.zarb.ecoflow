'use strict';

(function expose(root) {
  const contract = typeof module !== 'undefined' && module.exports ? require('./dual-ct-contract') : root.EcoFlowDualCtContract;
  const SOURCES = ['app_mqtt', 'developer_mqtt', 'developer_rest', 'linked_host_rest'];
  const STATES = ['not_started', 'discovering', 'listening', 'stopped', 'complete', 'sample_limit',
    'account_changed', 'no_explicit_model', 'transport_unavailable', 'discovery_unavailable'];
  function receiptFor(route, history) {
    const validAge = age => Number.isFinite(age) && age >= 0 && age <= 86400;
    if (route.receiptConfirmed === true && Number.isInteger(route.receivedPackets) && route.receivedPackets > 0
      && route.receivedPackets <= 128 && validAge(route.lastReceiptAgeSec)) {
      return { receiptConfirmed: true, receivedPackets: route.receivedPackets, lastReceiptAgeSec: route.lastReceiptAgeSec };
    }
    const events = (Array.isArray(history) ? history.slice(-24) : []).filter(event => event?.deviceIndex === route.deviceIndex
      && (event.source === route.source || (route.source === 'app_mqtt' && event.source === 'app_json'))
      && ['json', 'protobuf', 'empty', 'observed', 'unrecognised', 'oversized'].includes(event.status)
      && Number.isInteger(event.samples) && event.samples > 0 && event.samples <= 128 && validAge(event.lastAgeSec));
    return { receiptConfirmed: events.length > 0,
      receivedPackets: Math.min(128, events.reduce((sum, event) => sum + event.samples, 0)),
      lastReceiptAgeSec: events.length ? Math.min(...events.map(event => event.lastAgeSec)) : null };
  }
  // Keep this fixed metadata projection aligned with lib/dualCtDiagnostics.ts.
  function bankCheckSummary(input, enabled) {
    const banks = []; const seen = new Set();
    const reported = enabled && input?.reported === true && input?.scope === 'retained_capture_history'
      && input?.arithmeticScope === 'single_decoded_payload';
    if (reported && Array.isArray(input.banks)) {
      for (const row of input.banks.slice(0, 4)) {
        const key = `${row?.deviceIndex}:${row?.bank}`;
        if (![0, 1].includes(row?.deviceIndex) || !['A', 'B'].includes(row?.bank) || seen.has(key)) continue;
        const project = (check, complete) => {
          if (!(complete ? ['consistent', 'mismatch'] : ['partial', 'consistent', 'mismatch', 'invalid']).includes(check?.status)
            || !Number.isFinite(check?.receivedAgeSec) || check.receivedAgeSec < 0 || check.receivedAgeSec >= 990) return null;
          return { status: check.status, receivedAgeSec: check.receivedAgeSec, stale: !contract.isFreshAge(check.receivedAgeSec * 1000) };
        };
        const latest = project(row.latest, false); const lastComplete = project(row.lastComplete, true);
        if (!latest || (row.lastComplete != null && !lastComplete)
          || (lastComplete && lastComplete.receivedAgeSec < latest.receivedAgeSec)
          || (['consistent', 'mismatch'].includes(latest.status) && (!lastComplete
            || latest.status !== lastComplete.status || latest.receivedAgeSec !== lastComplete.receivedAgeSec))) continue;
        seen.add(key); banks.push({ deviceIndex: row.deviceIndex, bank: row.bank, latest, lastComplete });
      }
    }
    return { reported, scope: 'retained_capture_history', arithmeticScope: 'single_decoded_payload', banks,
      mappingVerified: false, unitsVerified: false, directionVerified: false,
      measurementSimultaneityVerified: false, valuesIncluded: false };
  }
  function counterMetadata(input) {
    const records=[]; const seen=new Set();
    if(Array.isArray(input?.records)) for(const row of input.records.slice(0,4)) {
      const key=`${row?.deviceIndex}:${row?.parent}`;
      if(![0,1].includes(row?.deviceIndex)||![773,997].includes(row?.parent)||seen.has(key)
        ||!['observed','invalid','oversized'].includes(row?.status)||!Number.isFinite(row.receivedAgeSec)||row.receivedAgeSec<0||row.receivedAgeSec>=990) continue;
      seen.add(key);
      const fields=Array.isArray(row.fields)?row.fields.slice(0,32).filter(field=>Number.isInteger(field?.field)
        &&field.field>=1&&field.field<=64&&[0,1,2,5].includes(field?.wire)).map(field=>({field:field.field,wire:field.wire})):[];
      const checks=input.enabled===true&&row.parent===773&&row.status==='observed'&&Array.isArray(row.checks)
        ?row.checks.slice(0,2).filter(check=>['4-6=7','1+2+3=7'].includes(check?.expression)
          &&['partial','consistent','mismatch','invalid'].includes(check?.status)&&check.scope==='single_nested_record')
          .map(check=>({expression:check.expression,status:check.status,scope:'single_nested_record',verified:false})):[];
      records.push({deviceIndex:row.deviceIndex,parent:row.parent,status:row.status,fields,checks,receivedAgeSec:row.receivedAgeSec,stale:!contract.isFreshAge(row.receivedAgeSec*1000),
        fieldsAvailable:row.fieldsOmitted===true&&Number.isInteger(row.fieldsAvailable)&&row.fieldsAvailable>=fields.length&&row.fieldsAvailable<=32?row.fieldsAvailable:fields.length,
        fieldsIncluded:fields.length,fieldsOmitted:row.fieldsOmitted===true});
    }
    return {enabled:input?.enabled===true,records,unitsVerified:false,period:'unknown',valuesIncluded:false};
  }
  function previewDiagnostics(input) {
    const count = n => Number.isInteger(n) && n >= 0 && n <= 2048 ? n : 0;
    const reasons = ['disabled', 'ready', 'no_samples', 'no_eligible_meter', 'missing_encoding', 'unsupported_encoding',
      'invalid_header', 'model_unverified', 'no_supported_candidates', 'expired', 'stopped', 'account_changed', 'capture_unavailable', 'not_reported', 'omitted_encoding_rejected'];
    let enabled = null;
    if (input?.enabled === true) enabled = true;
    else if (input?.enabled === false) enabled = false;
    return { enabled, reason: reasons.includes(input?.reason) ? input.reason : 'not_reported',
      attemptedPayloads: count(input?.attemptedPayloads), acceptedPayloads: count(input?.acceptedPayloads),
      omittedMarkerAttempts: count(input?.omittedMarkerAttempts), omittedMarkerAccepted: count(input?.omittedMarkerAccepted),
      encodingPolicy: 'dual_ct_live_candidate_v1', encodingVerified: false,
      encodingCounts: Object.fromEntries(['explicit_plain', 'missing', 'masked', 'unsupported', 'invalid_header']
        .map(key => [key, count(input?.encodingCounts?.[key])])),
      additionalScalarFieldsSeen: Array.isArray(input?.additionalScalarFieldsSeen)
        ? [...new Set(input.additionalScalarFieldsSeen.slice(0, 128).filter(field => contract.fields.some(row => row.bank === 'B' && row.field === field)))].sort((a,b) => a-b) : [],
      additionalBankMappingVerified: false, bankCheckSummary: bankCheckSummary(input?.bankCheckSummary, enabled === true),
      counterResearch: counterMetadata(enabled === true ? input?.counterResearch : null), valuesIncluded: false };
  }
  function describe(input) {
    const count = (value, max) => (Number.isInteger(value) && value >= 0 && value <= max ? value : 0);
    const summary = {
      state: STATES.includes(input?.status) ? input.status : 'not_started',
      devices: count(input?.deviceCount, 2), samples: count(input?.frames, 128),
      rejected: count(input?.rejectedFrames, 128),
      cleanupFailures: count(input?.cleanupFailures, 65535),
      age: typeof input?.captureAgeSec === 'number' && Number.isFinite(input.captureAgeSec)
        && input.captureAgeSec >= 0 ? Math.floor(input.captureAgeSec) : null,
      observed: Array.isArray(input?.history) && input.history.some((event) =>
        ['json', 'protobuf'].includes(event?.status) && SOURCES.concat('app_json').includes(event?.source)
        && Number.isFinite(event?.lastAgeSec) && event.lastAgeSec >= 0),
      routes: Array.isArray(input?.routes) ? input.routes.slice(0, 8).filter((route) => [0, 1].includes(route?.deviceIndex)
        && SOURCES.includes(route?.source)
        && ['listening', 'unavailable', 'empty', 'observed', 'host_not_verified'].includes(route?.status))
        .map((route) => ({ index: route.deviceIndex + 1, source: route.source, status: route.status,
          ...receiptFor(route, input?.history) })) : [],
    };
    summary.selected = Array.isArray(input?.selected) ? input.selected.slice(0, 2)
      .filter((row) => [0, 1].includes(row?.deviceIndex) && ['explicit_name', 'observed_app_product_type_421'].includes(row?.basis))
      .map((row) => ({ index: row.deviceIndex + 1, basis: row.basis,
        provisional: row.basis === 'observed_app_product_type_421',
        appListed: row.appListed === true, developerListed: row.developerListed === true })): [];
    summary.stage = 'not_identified';
    if (summary.devices) {
      if (summary.observed) summary.stage = 'structure_captured';
      else if (summary.routes.some((route) => route.status === 'listening')) summary.stage = 'subscribed_no_samples';
      else if (summary.routes.some((route) => route.status === 'observed')) summary.stage = 'received_unmapped';
      else if (summary.state === 'transport_unavailable' || summary.routes.length) summary.stage = 'identified_no_transport';
      else summary.stage = 'identified';
    }
    return summary;
  }
  function render(element, evidence, translate) {
    const status = describe(evidence); element.textContent = '';
    const append = (text) => { const p = element.ownerDocument.createElement('p'); p.textContent = text; element.appendChild(p); };
    append(translate(status.state));
    append(translate('stage_' + status.stage));
    status.selected.forEach((row) => append(`${translate('meter')} ${row.index}: ${translate('basis_' + row.basis)}.`));
    if (status.cleanupFailures) append(translate('cleanup_warning'));
    append(`${translate('devices')}: ${status.devices}. ${translate('samples')}: ${status.samples}. ${translate('rejected')}: ${status.rejected}.`);
    if (status.age !== null) append(`${translate('age')}: ${status.age} s.`);
    status.routes.forEach((route) => {
      append(`${translate('meter')} ${route.index}: ${translate(route.source)} — ${translate(route.receiptConfirmed ? 'route_received' : 'route_' + route.status)}.`);
      if (route.receiptConfirmed) append(`${translate('samples')}: ${route.receivedPackets}. ${translate('preview_receipt_age')}: ${Math.floor(route.lastReceiptAgeSec)} s.`);
    });
    const preview = previewDiagnostics(evidence?.previewDiagnostics);
    if (preview.enabled !== null) append(translate('preview_' + preview.reason));
    const banks = preview.bankCheckSummary;
    if (banks.banks.length) {
      append(translate('bank_summary_help'));
      banks.banks.forEach(row => {
        const text = check => `${translate('bank_' + check.status)} · ${Math.floor(check.receivedAgeSec)} s · ${translate(check.stale ? 'bank_stale' : 'bank_recent')}`;
        append(`${translate('meter')} ${row.deviceIndex + 1} · ${translate('bank_candidate')} ${row.bank} · ${translate('bank_latest')}: ${text(row.latest)}`);
        if (row.lastComplete) append(`${translate('bank_last_complete')}: ${text(row.lastComplete)}`);
      });
    }
    if (status.observed) append(translate('observed_help'));
    else if (status.state !== 'not_started' && status.state !== 'discovering') append(translate('no_data_help'));
    append(translate('snapshot_help'));
  }
  // Fixed-field compact export: excludes unrelated integration data and identities.
  function compact(evidence, version) {
    const count = (n) => (Number.isInteger(n) && n >= 0 && n <= 256 ? n : 0);
    const inventory = Array.isArray(evidence?.inventory) ? evidence.inventory.slice(0, 2)
      .filter((row) => ['app', 'developer'].includes(row?.source)).map((row) => ({
        source: row.source, available: row.available === true, inspected: count(row.inspected),
        truncated: row.truncated === true, missingProductMetadata: count(row.missingProductMetadata),
        explicitMatches: Math.min(2, count(row.explicitMatches)), displayNameHints: count(row.displayNameHints),
        observedCodeMatches: Math.min(2, count(row.observedCodeMatches)),
        candidates: Array.isArray(row.candidates) ? row.candidates.slice(0, 8).map((candidate) => ({
          shared: candidate?.shared === true, metadataPresent: candidate?.metadataPresent === true,
          codes: Array.isArray(candidate?.codes) ? candidate.codes.slice(0, 4).filter((item) =>
            ['productId', 'productType', 'modelId', 'deviceType'].includes(item?.field)
            && Number.isInteger(item.code) && item.code >= 0 && item.code <= 0xffffffff)
            .map((item) => ({ field: item.field, code: item.code })) : [],
        })) : [],
      })) : [];
    const keys = new Set(['params', 'data', 'result', 'quota', 'ct1', 'ct2', 'CT1', 'CT2', 'channels',
      'channel1', 'channel2', 'power', 'totalPower', 'voltage', 'current', 'energy', 'powerFactor', 'frequency',
      'importEnergy', 'exportEnergy', 'phaseA', 'phaseB', 'phaseC', 'localMeter', 'powGetSysLoad', 'powGetSysGrid',
      'gridPower', 'activePower', 'meterPower', 'meterVoltage', 'meterCurrent', 'gridConnectionPower']);
    const jsonShapes = Array.isArray(evidence?.jsonShapes) ? evidence.jsonShapes.slice(0, 16)
      .filter((shape) => [0, 1].includes(shape?.deviceIndex)
        && ['app_json', 'developer_mqtt', 'developer_rest', 'linked_host_rest'].includes(shape?.source))
      .map((shape) => ({ deviceIndex: shape.deviceIndex, source: shape.source,
        fields: Array.isArray(shape.fields) ? shape.fields.slice(0, 32).filter((field) =>
          typeof field?.path === 'string' && field.path.length <= 150
          && field.path.split('.').every((key) => keys.has(key) || /^\[[0-3]\]$/.test(key))
          && ['null', 'array', 'object', 'number', 'string', 'boolean'].includes(field.type))
          .map((field) => ({ path: field.path, type: field.type })) : [] })) : [];
    const shapes = Array.isArray(evidence?.shapes) ? evidence.shapes.slice(0, 16)
      .filter((shape) => [0, 1].includes(shape?.deviceIndex) && Number.isInteger(shape.cmdFunc)
        && shape.cmdFunc >= 0 && shape.cmdFunc <= 65535 && Number.isInteger(shape.cmdId) && shape.cmdId >= 0 && shape.cmdId <= 65535)
      .map((shape) => ({ deviceIndex: shape.deviceIndex, source: 'app_mqtt', cmdFunc: shape.cmdFunc, cmdId: shape.cmdId,
        fields: Array.isArray(shape.fields) ? shape.fields.slice(0, 32).filter((field) =>
          Number.isInteger(field?.field) && field.field > 0 && field.field <= 536870911 && [0, 1, 2, 5].includes(field.wire))
          .map((field) => ({ field: field.field, wire: field.wire })) : [] })) : [];
    // Union distinct fields per transport/message, so repeated packets do not
    // consume the budget. Preserve headers and fair field coverage before metadata.
    function group(input, key) {
      const groups = new Map();
      input.forEach((shape) => {
        const id = key(shape);
        if (!groups.has(id)) groups.set(id, { ...shape, fields: [] });
        const target = groups.get(id);
        shape.fields.forEach((field) => {
          if (!target.fields.some((existing) => JSON.stringify(existing) === JSON.stringify(field))) target.fields.push(field);
        });
      });
      return Array.from(groups.values());
    }
    const jsonGroups = group(jsonShapes, (shape) => `${shape.deviceIndex}:${shape.source}`);
    const protoGroups = group(shapes, (shape) => `${shape.deviceIndex}:${shape.cmdFunc}:${shape.cmdId}`);
    // Prefer scalar leaf structure over enclosing objects, without interpreting values.
    jsonGroups.forEach((shape) => shape.fields.sort((a, b) =>
      Number(['object', 'array'].includes(a.type)) - Number(['object', 'array'].includes(b.type))));
    const available = jsonGroups.concat(protoGroups);
    const recent = new Map();
    if (Array.isArray(evidence?.history)) evidence.history.slice(-24).forEach((event) => {
      if (![0, 1].includes(event?.deviceIndex) || !['json', 'protobuf'].includes(event.status)
        || !['app_mqtt', 'app_json', 'developer_mqtt', 'developer_rest', 'linked_host_rest'].includes(event.source)
        || !Number.isInteger(event.samples) || event.samples < 1 || event.samples > 128
        || !Number.isFinite(event.lastAgeSec) || event.lastAgeSec < 0 || event.lastAgeSec > 86400) return;
      const key = `${event.deviceIndex}:${event.source}:${event.status}`;
      const previous = recent.get(key);
      recent.set(key, { deviceIndex: event.deviceIndex, source: event.source, format: event.status,
        retainedSamples: Math.min(128, (previous?.retainedSamples || 0) + event.samples),
        lastAgeSec: Math.min(previous?.lastAgeSec ?? Infinity, Math.floor(event.lastAgeSec)) });
    });
    const report = { reportType: 'dual_ct_compact', schemaVersion: 6,
      appVersion: typeof version === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(version) ? version : 'unknown',
      summary: describe(evidence), inventory, jsonShapes: [], shapes: [], structureOmitted: false, metadataOmitted: false,
      previewDiagnostics: previewDiagnostics(evidence?.previewDiagnostics),
      observationScope: 'retained_capture_history', recentObservations: Array.from(recent.values()).slice(0, 8),
      structureCoverage: { scope: 'retained_capture_structure', groupsAvailable: available.length, groupsIncluded: 0,
        fieldsAvailable: available.reduce((sum, shape) => sum + shape.fields.length, 0), fieldsIncluded: 0 },
      channelMapping: 'unverified', valuesCaptured: evidence?.valuesCaptured === true,
      valuesIncluded: false, pairingEnabled: false,
      contributesToEnergy: false, controlsEnabled: false };
    const size = () => JSON.stringify(report, null, 2).length;
    while(size()>6500&&report.previewDiagnostics.counterResearch.records.some(row=>row.fields.length)) {
      const largest=report.previewDiagnostics.counterResearch.records.reduce((a,b)=>a.fields.length>=b.fields.length?a:b);
      largest.fields.pop();largest.fieldsIncluded=largest.fields.length;largest.fieldsOmitted=true;
    }
    // Reserve room for useful structure rather than spending it on unrelated candidates.
    while ((size() > 3000 && available.length || size() > 7500) && report.inventory.some((row) => row.candidates.length)) {
      const largest = report.inventory.reduce((a, b) => (a.candidates.length >= b.candidates.length ? a : b));
      largest.candidates.pop(); report.metadataOmitted = true;
    }
    const retained = [];
    // Alternate formats; each message/source gets a header before any gets all fields.
    for (let i = 0; i < Math.max(jsonGroups.length, protoGroups.length); i += 1) {
      [[jsonGroups[i], report.jsonShapes], [protoGroups[i], report.shapes]].forEach(([shape, output]) => {
        if (!shape) return;
        const header = { ...shape, fields: [] };
        output.push(header); report.structureCoverage.groupsIncluded += 1;
        if (size() > 7400) { output.pop(); report.structureCoverage.groupsIncluded -= 1; }
        else retained.push({ shape, header });
      });
    }
    const longest = Math.max(0, ...retained.map((entry) => entry.shape.fields.length));
    for (let i = 0; i < longest; i += 1) {
      retained.forEach(({ shape, header }) => {
        if (!shape.fields[i]) return;
        header.fields.push(shape.fields[i]); report.structureCoverage.fieldsIncluded += 1;
        if (size() > 7400) { header.fields.pop(); report.structureCoverage.fieldsIncluded -= 1; }
      });
    }
    report.structureOmitted = report.structureCoverage.groupsIncluded < available.length
      || report.structureCoverage.fieldsIncluded < report.structureCoverage.fieldsAvailable;
    return report;
  }
  // Separate consented export. Fixed fields only; never include identities or raw frames.
  const CANDIDATE_UNITS = Object.fromEntries(contract.fields.map(row => [row.field, row.candidateUnit]));
  const BANK_HYPOTHESES = contract.banks;
  function bankCandidate(field) {
    for (const bank of BANK_HYPOTHESES) {
      if (field === bank.total) return { bank: bank.bank, phase: null, quantity: 'total_power', suggestedUnit: 'W' };
      for (const [quantity, unit] of [['power', 'W'], ['voltage', 'V'], ['current', 'A']]) {
        const index = bank[quantity].indexOf(field);
        if (index >= 0) return { bank: bank.bank, phase: index + 1, quantity, suggestedUnit: unit };
      }
    }
    return null;
  }
  function candidateRows(input, maxAge = contract.staleMs / 1000) {
    const devices = []; const seen = new Set();
    (Array.isArray(input?.devices) ? input.devices.slice(0, 2) : []).forEach((device) => {
      if (![0, 1].includes(device?.deviceIndex)) return;
      const readings = [];
      (Array.isArray(device.readings) ? device.readings.slice(0, 20) : []).forEach((row) => {
        const key = device.deviceIndex + ':' + row?.field;
        const basis = row?.encodingBasis === undefined ? 'not_reported' : row.encodingBasis;
        if (!Number.isInteger(row?.field) || !Object.prototype.hasOwnProperty.call(CANDIDATE_UNITS, row.field)
          || CANDIDATE_UNITS[row.field] !== row.candidateUnit || seen.has(key)
          || !['explicit_zero', 'omitted_zero_candidate', 'not_reported'].includes(basis)
          || !Number.isFinite(row.value) || Math.abs(row.value) > 1000000
          || !Number.isFinite(row.receivedAgeSec) || row.receivedAgeSec < 0 || row.receivedAgeSec >= maxAge) return;
        seen.add(key);
        const packetIndex = Number.isInteger(row.packetIndex) && row.packetIndex > 0 && row.packetIndex <= 2048 ? row.packetIndex : null;
        readings.push({ field: row.field, value: row.value, candidateUnit: row.candidateUnit,
          receivedAgeSec: row.receivedAgeSec, encodingBasis: basis, representation: 'float32_candidate',
          ...(packetIndex !== null ? { packetIndex } : {}) });
      });
      if (readings.length) devices.push({ deviceIndex: device.deviceIndex, readings });
    });
    return devices;
  }
  function buildCandidateExport(input, historical, budget = 7500) {
    if (input?.enabled !== true || input?.interpretation !== 'legacy_meter_overlap_unverified'
      || input.unitsVerified !== false || input.directionVerified !== false) return null;
    const devices = candidateRows(input, historical ? 990 : contract.staleMs / 1000);
    if (!devices.length) return null;
    const included = devices.reduce((sum, device) => sum + device.readings.length, 0);
    const priorTrimmed = ['dual_ct_candidate_preview', 'dual_ct_candidate_snapshot'].includes(input.reportType) && input.readingsOmitted === true
      && Number.isInteger(input.readingsAvailable) && input.readingsAvailable >= included && input.readingsAvailable <= 40;
    const report = { reportType: historical ? 'dual_ct_candidate_snapshot' : 'dual_ct_candidate_preview', schemaVersion: historical ? 4 : 2, enabled: true,
      appVersion: typeof input.appVersion === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(input.appVersion) ? input.appVersion : 'unknown',
      interpretation: 'legacy_meter_overlap_unverified', source: 'app_mqtt', cmdFunc: 254, cmdId: 21,
      unitsVerified: false, directionVerified: false, measurementTimestampKnown: false, hardwareValidated: false,
      encodingVerified: false, additionalBankMappingVerified: false,
      readingsAvailable: priorTrimmed ? input.readingsAvailable : included, readingsIncluded: included, readingsOmitted: priorTrimmed,
      channelMapping: 'unverified', pairingEnabled: false, contributesToEnergy: false, controlsEnabled: false, devices };
    if (historical) Object.assign(report, { historical: true, notLive: true, simultaneous: false,
      retainedForSec: input.retainedForSec, retentionRemainingSec: input.retentionRemainingSec, lastPacketAgeSec: input.lastPacketAgeSec });
    if (historical) {
      report.bankHypotheses = BANK_HYPOTHESES.map(bank => ({ ...bank, power: [...bank.power], voltage: [...bank.voltage], current: [...bank.current] }));
      report.bankMappingVerified = false; report.measurementSimultaneityVerified = false;
      report.coherenceScope = 'single_decoded_payload';
      report.bankChecks = bankChecks(input);
      const prior = input.reportType === 'dual_ct_candidate_snapshot' && input.bankChecksOmitted === true
        && Number.isInteger(input.bankChecksAvailable) && input.bankChecksAvailable >= report.bankChecks.length && input.bankChecksAvailable <= 4;
      report.bankChecksAvailable = prior ? input.bankChecksAvailable : report.bankChecks.length;
      report.bankChecksIncluded = report.bankChecks.length; report.bankChecksOmitted = prior;
    }
    // Bound the expanded two-meter export. Signal trimming, preserve some evidence from both meters.
    while (JSON.stringify(report, null, 2).length > budget) {
      const largest = report.devices.reduce((a, b) => a.readings.length >= b.readings.length ? a : b);
      if (largest.readings.length > 1) { largest.readings.pop(); report.readingsIncluded--; report.readingsOmitted = true; }
      else if (report.bankChecks?.length) { report.bankChecks.pop(); report.bankChecksIncluded--; report.bankChecksOmitted = true; }
      else return null;
    }
    return report;
  }

  function candidateExport(input) { return buildCandidateExport(input, false); }

  function bankChecks(input) {
    const result = []; const seen = new Set();
    for (const entry of (Array.isArray(input?.bankChecks) ? input.bankChecks.slice(0, 4) : [])) {
      const hypothesis = BANK_HYPOTHESES.find(bank => bank.bank === entry?.bank);
      const key = entry?.deviceIndex + ':' + entry?.bank;
      if (!hypothesis || ![0, 1].includes(entry.deviceIndex) || seen.has(key)) continue;
      const project = (check) => {
        if (!check || check.bank !== entry.bank || check.scope !== 'single_decoded_payload'
          || !Number.isInteger(check.packetIndex) || check.packetIndex < 1 || check.packetIndex > 2048
          || !Number.isFinite(check.receivedAgeSec) || check.receivedAgeSec < 0 || check.receivedAgeSec >= 990
          || check.receivedAgeSec < input.lastPacketAgeSec || check.receivedAgeSec > input.retainedForSec + 90
          || !['explicit_zero', 'omitted_zero_candidate'].includes(check.encodingBasis)) return null;
        const required = [hypothesis.total, ...hypothesis.power];
        const present = Array.isArray(check.presentPowerFields) ? check.presentPowerFields : [];
        if (present.length > 4 || new Set(present).size !== present.length || present.some(field => !required.includes(field))) return null;
        const output = { bank: entry.bank, scope: 'single_decoded_payload', packetIndex: check.packetIndex,
          receivedAgeSec: check.receivedAgeSec, encodingBasis: check.encodingBasis, presentPowerFields: [...present],
          mappingVerified: false, roleVerified: false, measurementSimultaneityVerified: false };
        if (check.status === 'partial' && present.length < 4) return { ...output, status: 'partial' };
        if (present.length !== 4 || !Array.isArray(check.phaseValues) || check.phaseValues.length !== 3
          || ![check.reportedTotal, ...check.phaseValues].every(value => Number.isFinite(value) && Math.abs(value) <= 1000000)) return null;
        const phaseSum = check.phaseValues.reduce((sum, value) => sum + value, 0);
        const difference = check.reportedTotal - phaseSum;
        const tolerance = 0.001 + 0.000001 * (Math.abs(check.reportedTotal) + check.phaseValues.reduce((sum, value) => sum + Math.abs(value), 0));
        const status = Math.abs(difference) <= tolerance ? 'consistent' : 'mismatch';
        if (check.status !== status) return null;
        return { ...output, status, reportedTotal: check.reportedTotal, phaseValues: [...check.phaseValues], phaseSum, difference, tolerance };
      };
      const latest = project(entry.latest); const lastComplete = project(entry.lastComplete);
      if (!latest || (lastComplete && (lastComplete.status === 'partial' || lastComplete.packetIndex > latest.packetIndex
        || lastComplete.receivedAgeSec < latest.receivedAgeSec
        || (lastComplete.packetIndex === latest.packetIndex && JSON.stringify(lastComplete) !== JSON.stringify(latest))))) continue;
      seen.add(key); result.push({ deviceIndex: entry.deviceIndex, bank: entry.bank, latest, lastComplete });
    }
    return result;
  }

  // Separate historical evidence, never admitted back to the fresh preview or normal reports.
  function diagnosticExport(input, comparisonView = false) {
    const snapshot = input?.diagnosticSnapshot;
    if (snapshot?.kind !== 'historical_capture' || snapshot.simultaneous !== false
      || !Number.isFinite(snapshot.retainedForSec) || snapshot.retainedForSec < 0 || snapshot.retainedForSec >= 900
      || !Number.isFinite(snapshot.retentionRemainingSec) || snapshot.retentionRemainingSec <= 0 || snapshot.retentionRemainingSec > 900
      || Math.abs(snapshot.retainedForSec + snapshot.retentionRemainingSec - 900) > 0.01
      || !Number.isFinite(snapshot.lastPacketAgeSec) || snapshot.lastPacketAgeSec < 0
      || snapshot.lastPacketAgeSec > snapshot.retainedForSec + 90) return null;
    const devices = candidateRows(snapshot, snapshot.retainedForSec + 90 + 0.001).map(device => ({ ...device,
      readings: device.readings.filter(row => row.receivedAgeSec >= snapshot.lastPacketAgeSec) }));
    // The local comparison view may hold the full bounded 2 x 20 field projection;
    // its separate combined exporter reapplies the 7500-character sharing budget.
    return buildCandidateExport({ ...input, ...snapshot, devices }, true, comparisonView === true ? 20000 : 7500);
  }

  // Fixed, non-numeric explanations. A format checkbox is not proof that captured data exists.
  function candidateExportAvailability(input, snapshotAvailable, comparisonAvailable) {
    const identified = typeof input?.captureId === 'string' && /^[0-9a-f-]{36}$/.test(input.captureId);
    if (identified && snapshotAvailable === true) return comparisonAvailable === true ? 'ready' : 'scalar_only';
    if (!input) return 'not_loaded';
    if (input.reason === 'request_failed') return 'request_failed';
    if (['stopped', 'account_changed', 'capture_unavailable'].includes(input.reason)) return input.reason;
    if (input.enabled === false || input.reason === 'disabled') return 'numeric_disabled';
    const snapshot = input.diagnosticSnapshot;
    if ((Number.isFinite(snapshot?.retentionRemainingSec) && snapshot.retentionRemainingSec <= 0)
      || (Number.isFinite(snapshot?.retainedForSec) && snapshot.retainedForSec >= contract.retentionMs / 1000)) return 'expired';
    if (input.reason === 'no_eligible_meter' || input.reason === 'model_unverified') return 'no_eligible_meter';
    if (['missing_encoding', 'unsupported_encoding', 'invalid_header', 'no_supported_candidates', 'omitted_encoding_rejected'].includes(input.reason)) return 'decode_blocked';
    if (input.reason === 'no_samples') return 'no_samples';
    if (!identified) return 'capture_missing';
    return snapshot ? 'snapshot_invalid' : 'no_snapshot';
  }

  // Separate local display only: never pass candidate values to compact().
  function renderPreview(element, input, translate) {
    element.textContent = translate('preview_unavailable');
    const reasons = ['disabled', 'no_samples', 'no_eligible_meter', 'missing_encoding', 'unsupported_encoding',
      'invalid_header', 'model_unverified', 'no_supported_candidates', 'expired', 'stopped', 'account_changed', 'request_failed', 'capture_unavailable', 'omitted_encoding_rejected'];
    if (reasons.includes(input?.reason)) element.textContent = translate('preview_' + input.reason);
    if (input?.enabled !== true || input?.interpretation !== 'legacy_meter_overlap_unverified'
      || input.unitsVerified !== false || input.directionVerified !== false) return 0;
    let lifetime = 0;
    const rows = [];
    candidateRows(input).forEach((device) => {
      device.readings.forEach((row) => {
        const ttl = contract.staleMs - row.receivedAgeSec * 1000;
        lifetime = lifetime ? Math.min(lifetime, ttl) : ttl;
        const mapping = bankCandidate(row.field);
        const hint = mapping ? ` · ${translate('bank_candidate')} ${mapping.bank} / ${mapping.phase === null ? translate('bank_total_power')
          : translate('bank_phase') + ' ' + mapping.phase + ' ' + translate('bank_' + mapping.quantity)} (${mapping.suggestedUnit}?)` : '';
        rows.push(`${translate('meter')} ${device.deviceIndex + 1} · ${translate('preview_field')} ${row.field}: ${row.value} (${translate('preview_candidate_unit')}: ${row.candidateUnit || translate('preview_unknown_unit')})${hint} · ${translate('preview_encoding_basis')}: ${translate('preview_basis_' + row.encodingBasis)} · ${translate('preview_receipt_age')}: ${Math.floor(row.receivedAgeSec)} s`);
      });
    });
    if (rows.length) element.textContent = translate('preview_warning') + '\n' + rows.join('\n');
    else if (input.reason === 'ready') element.textContent = translate('preview_expired');
    return lifetime;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { describe, render, compact, renderPreview, candidateExport, diagnosticExport, bankCandidate, candidateExportAvailability };
  else root.EcoFlowDualCtStatus = { describe, render, compact, renderPreview, candidateExport, diagnosticExport, bankCandidate, candidateExportAvailability };
}(typeof window === 'undefined' ? {} : window));
