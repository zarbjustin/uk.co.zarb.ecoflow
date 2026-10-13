'use strict';

(function expose(root) {
  const SOURCES = ['app_mqtt', 'developer_mqtt', 'developer_rest', 'linked_host_rest'];
  const STATES = ['not_started', 'discovering', 'listening', 'stopped', 'complete', 'sample_limit',
    'account_changed', 'no_explicit_model', 'transport_unavailable', 'discovery_unavailable'];
  function describe(input) {
    const count = (value, max) => (Number.isInteger(value) && value >= 0 && value <= max ? value : 0);
    return {
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
  }
  function render(element, evidence, translate) {
    const status = describe(evidence); element.textContent = '';
    const append = (text) => { const p = element.ownerDocument.createElement('p'); p.textContent = text; element.appendChild(p); };
    append(translate(status.state));
    if (status.cleanupFailures) append(translate('cleanup_warning'));
    append(`${translate('devices')}: ${status.devices}. ${translate('samples')}: ${status.samples}. ${translate('rejected')}: ${status.rejected}.`);
    if (status.age !== null) append(`${translate('age')}: ${status.age} s.`);
    status.routes.forEach((route) => append(`${translate('meter')} ${route.index}: ${translate(route.source)} — ${translate('route_' + route.status)}.`));
    if (status.observed) append(translate('observed_help'));
    else if (status.state !== 'not_started' && status.state !== 'discovering') append(translate('no_data_help'));
    append(translate('snapshot_help'));
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { describe, render };
  else root.EcoFlowDualCtStatus = { describe, render };
}(typeof window === 'undefined' ? {} : window));
