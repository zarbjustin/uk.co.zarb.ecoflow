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
    const jsonShapes = Array.isArray(evidence?.jsonShapes) ? evidence.jsonShapes.slice(0, 8)
      .filter((shape) => [0, 1].includes(shape?.deviceIndex)
        && ['app_json', 'developer_mqtt', 'developer_rest', 'linked_host_rest'].includes(shape?.source))
      .map((shape) => ({ deviceIndex: shape.deviceIndex, source: shape.source,
        fields: Array.isArray(shape.fields) ? shape.fields.slice(0, 16).filter((field) =>
          typeof field?.path === 'string' && field.path.length <= 150
          && field.path.split('.').every((key) => keys.has(key) || /^\[[0-3]\]$/.test(key))
          && ['null', 'array', 'object', 'number', 'string', 'boolean'].includes(field.type))
          .map((field) => ({ path: field.path, type: field.type })) : [] })) : [];
    const shapes = Array.isArray(evidence?.shapes) ? evidence.shapes.slice(0, 8)
      .filter((shape) => [0, 1].includes(shape?.deviceIndex) && Number.isInteger(shape.cmdFunc)
        && shape.cmdFunc >= 0 && shape.cmdFunc <= 65535 && Number.isInteger(shape.cmdId) && shape.cmdId >= 0 && shape.cmdId <= 65535)
      .map((shape) => ({ deviceIndex: shape.deviceIndex, cmdFunc: shape.cmdFunc, cmdId: shape.cmdId,
        fields: Array.isArray(shape.fields) ? shape.fields.slice(0, 16).filter((field) =>
          Number.isInteger(field?.field) && field.field > 0 && field.field <= 536870911 && [0, 1, 2, 5].includes(field.wire))
          .map((field) => ({ field: field.field, wire: field.wire })) : [] })) : [];
    const report = { reportType: 'dual_ct_compact', schemaVersion: 2,
      appVersion: typeof version === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(version) ? version : 'unknown',
      summary: describe(evidence), inventory, jsonShapes, shapes, structureOmitted: false, metadataOmitted: false,
      channelMapping: 'unverified', valuesCaptured: false, pairingEnabled: false,
      contributesToEnergy: false, controlsEnabled: false };
    if (JSON.stringify(report, null, 2).length > 7500) {
      report.jsonShapes = []; report.shapes = []; report.structureOmitted = true;
    }
    while (JSON.stringify(report, null, 2).length > 7500 && report.inventory.some((row) => row.candidates.length)) {
      const largest = report.inventory.reduce((a, b) => (a.candidates.length >= b.candidates.length ? a : b));
      largest.candidates.pop(); report.metadataOmitted = true;
    }
    return report;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { describe, render, compact };
  else root.EcoFlowDualCtStatus = { describe, render, compact };
}(typeof window === 'undefined' ? {} : window));
