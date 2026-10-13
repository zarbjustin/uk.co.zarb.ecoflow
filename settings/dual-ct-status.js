'use strict';

(function expose(root) {
  const SOURCES = ['app_mqtt', 'developer_mqtt', 'developer_rest', 'linked_host_rest'];
  const STATES = ['not_started', 'discovering', 'listening', 'stopped', 'complete', 'sample_limit',
    'account_changed', 'no_explicit_model', 'transport_unavailable', 'discovery_unavailable'];
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
        .map((route) => ({ index: route.deviceIndex + 1, source: route.source, status: route.status })) : [],
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
    status.routes.forEach((route) => append(`${translate('meter')} ${route.index}: ${translate(route.source)} — ${translate('route_' + route.status)}.`));
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
    const report = { reportType: 'dual_ct_compact', schemaVersion: 3,
      appVersion: typeof version === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(version) ? version : 'unknown',
      summary: describe(evidence), inventory, jsonShapes: [], shapes: [], structureOmitted: false, metadataOmitted: false,
      observationScope: 'retained_capture_history', recentObservations: Array.from(recent.values()).slice(0, 8),
      structureCoverage: { groupsAvailable: available.length, groupsIncluded: 0,
        fieldsAvailable: available.reduce((sum, shape) => sum + shape.fields.length, 0), fieldsIncluded: 0 },
      channelMapping: 'unverified', valuesCaptured: evidence?.valuesCaptured === true,
      valuesIncluded: false, pairingEnabled: false,
      contributesToEnergy: false, controlsEnabled: false };
    const size = () => JSON.stringify(report, null, 2).length;
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
  function candidateExport(input) {
    if (input?.enabled !== true || input?.interpretation !== 'legacy_meter_overlap_unverified'
      || input.unitsVerified !== false || input.directionVerified !== false) return null;
    const units = { 515: 'W', 962: 'W', 963: 'W', 772: 'W', 956: 'V', 957: 'V', 771: 'V', 958: 'A', 959: 'A', 784: 'A' };
    const devices = []; const seen = new Set();
    (Array.isArray(input.devices) ? input.devices.slice(0, 2) : []).forEach((device) => {
      if (![0, 1].includes(device?.deviceIndex)) return;
      const readings = [];
      (Array.isArray(device.readings) ? device.readings.slice(0, 10) : []).forEach((row) => {
        const key = device.deviceIndex + ':' + row?.field;
        if (!Number.isInteger(row?.field) || !units[row.field] || units[row.field] !== row.candidateUnit || seen.has(key)
          || !Number.isFinite(row.value) || Math.abs(row.value) > 1000000
          || !Number.isFinite(row.receivedAgeSec) || row.receivedAgeSec < 0 || row.receivedAgeSec >= 90) return;
        seen.add(key);
        readings.push({ field: row.field, value: row.value, candidateUnit: row.candidateUnit, receivedAgeSec: row.receivedAgeSec });
      });
      if (readings.length) devices.push({ deviceIndex: device.deviceIndex, readings });
    });
    if (!devices.length) return null;
    return { reportType: 'dual_ct_candidate_preview', schemaVersion: 1, enabled: true,
      appVersion: typeof input.appVersion === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(input.appVersion) ? input.appVersion : 'unknown',
      interpretation: 'legacy_meter_overlap_unverified', source: 'app_mqtt', cmdFunc: 254, cmdId: 21,
      unitsVerified: false, directionVerified: false, measurementTimestampKnown: false, hardwareValidated: false,
      channelMapping: 'unverified', pairingEnabled: false, contributesToEnergy: false, controlsEnabled: false, devices };
  }

  // Separate local display only: never pass candidate values to compact().
  function renderPreview(element, input, translate) {
    element.textContent = translate('preview_unavailable');
    const reasons = ['disabled', 'no_samples', 'no_eligible_meter', 'missing_encoding', 'unsupported_encoding',
      'invalid_header', 'model_unverified', 'no_supported_candidates', 'expired', 'stopped', 'account_changed', 'request_failed', 'capture_unavailable'];
    if (reasons.includes(input?.reason)) element.textContent = translate('preview_' + input.reason);
    if (input?.enabled !== true || input?.interpretation !== 'legacy_meter_overlap_unverified'
      || input.unitsVerified !== false || input.directionVerified !== false) return 0;
    const units = { 515: 'W', 962: 'W', 963: 'W', 772: 'W', 956: 'V', 957: 'V', 771: 'V', 958: 'A', 959: 'A', 784: 'A' };
    let lifetime = 0;
    const rows = [];
    const seen = new Set();
    (Array.isArray(input.devices) ? input.devices.slice(0, 2) : []).forEach((device) => {
      if (![0, 1].includes(device?.deviceIndex)) return;
      (Array.isArray(device.readings) ? device.readings.slice(0, 10) : []).forEach((row) => {
        const key = device.deviceIndex + ':' + row?.field;
        if (!Number.isInteger(row?.field) || !units[row.field] || units[row.field] !== row.candidateUnit || seen.has(key)
          || !Number.isFinite(row.value) || Math.abs(row.value) > 1000000
          || !Number.isFinite(row.receivedAgeSec) || row.receivedAgeSec < 0 || row.receivedAgeSec >= 90) return;
        seen.add(key);
        const ttl = (90 - row.receivedAgeSec) * 1000;
        lifetime = lifetime ? Math.min(lifetime, ttl) : ttl;
        rows.push(`${translate('meter')} ${device.deviceIndex + 1} · ${translate('preview_field')} ${row.field}: ${row.value} (${translate('preview_candidate_unit')}: ${row.candidateUnit}) · ${translate('preview_receipt_age')}: ${Math.floor(row.receivedAgeSec)} s`);
      });
    });
    if (rows.length) element.textContent = translate('preview_warning') + '\n' + rows.join('\n');
    return lifetime;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { describe, render, compact, renderPreview, candidateExport };
  else root.EcoFlowDualCtStatus = { describe, render, compact, renderPreview, candidateExport };
}(typeof window === 'undefined' ? {} : window));
