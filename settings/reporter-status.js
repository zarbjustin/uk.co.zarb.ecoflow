'use strict';

(function expose(root) {
  function describe(trial) {
    if (trial?.rollbackAwaitingFreshOriginal === true) return { state: 'rollback', action: 'wait' };
    const status = trial?.enabled === true ? trial.status : trial?.readiness?.status;
    if (trial?.enabled === true && status === 'active') return { state: 'active', action: 'capture' };
    if (trial?.readiness?.eligible === true && status === 'active') return { state: 'ready', action: 'enable' };
    if (['resolution_unavailable', 'resolution_stale', 'reporter_unchanged', 'waiting_for_validation'].includes(status)) {
      return { state: 'lookup', action: 'check' };
    }
    if (['resolved_reporter_not_paired', 'aggregate_unavailable'].includes(status)) return { state: 'monitor', action: 'pair' };
    if (['ambiguous_representations', 'duplicate_energy_aggregate'].includes(status)) return { state: 'overlap', action: 'review' };
    if (['selected_reporter_changed', 'legacy_address_mismatch'].includes(status)) return { state: 'changed', action: 'capture' };
    if (['fields_missing_or_stale', 'fresh_comparison_required', 'fresh_peer_correlation_missing',
      'reporter_connection_unavailable', 'pending_apply'].includes(status)) return { state: 'waiting', action: 'wait' };
    return { state: 'failed', action: 'capture' };
  }

  function render(element, report, translate) {
    element.textContent = '';
    const append = text => {
      const p = element.ownerDocument.createElement('p');
      p.textContent = text;
      element.appendChild(p);
    };
    if (!report) { append(translate('refresh')); return; }
    const trials = report.drivers?.find(d => d.id === 'stream')?.monitoringTrial;
    if (!Array.isArray(trials) || !trials.length) append(translate('none'));
    (Array.isArray(trials) ? trials : []).forEach((trial, index) => {
      const result = describe(trial);
      append(`${translate('battery')} ${index + 1}: ${translate(result.state)}`);
      append(translate(result.action));
      if (result.state === 'active') append(translate('activation_only'));
    });
    append(translate('scope'));
    append(translate('snapshot'));
    // Separate diagnostic sources; never render API labels/IDs or stale numbers.
    const fresh = field => field?.stale === false && typeof field.value === 'number'
      && Number.isFinite(field.value) && Math.abs(field.value) <= 100000
      && typeof field.ageSec === 'number' && Number.isFinite(field.ageSec)
      && field.ageSec >= 0 && field.ageSec <= 180;
    const describeField = field => fresh(field)
      ? `${field.value} W (${translate('receipt_age')}: ${Math.floor(field.ageSec)} s)` : translate('field_unavailable');
    (Array.isArray(report.drivers) ? report.drivers : [])
      .filter(driver => ['stream_5000_unit', 'stream_5000_system', 'stream_ac5000'].includes(driver.id))
      .forEach(driver => {
        (Array.isArray(driver.systemFlow) ? driver.systemFlow : []).slice(0, 64).forEach((flow, index) => {
          append(`${translate('flow_sources')} ${index + 1}`);
          const meter = flow?.fields?.gridMeterW;
          const matrix = flow?.fields?.gridFlowNetW;
          append(`${translate('grid_meter')}: ${describeField(meter)}`);
          append(`${translate('grid_flow')}: ${describeField(matrix)}`);
          const comparable = fresh(meter) && fresh(matrix) && Math.abs(meter.ageSec - matrix.ageSec) <= 30;
          append(`${translate('grid_difference')}: ${comparable ? `${meter.value - matrix.value} W` : translate('field_unavailable')}`);
          append(translate('grid_scope'));
        });
      });
  }

  function download(report, doc, urlApi, BlobType) {
    const date = typeof report?.capturedAt === 'string' ? new Date(report.capturedAt) : null;
    const stamp = date && Number.isFinite(date.getTime()) ? date.toISOString().replace(/[:.]/g, '-') : 'snapshot';
    const blob = new BlobType([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = urlApi.createObjectURL(blob);
    const anchor = doc.createElement('a');
    try {
      anchor.href = url;
      anchor.download = `ecoflow-integration-${stamp}.json`;
      doc.body.appendChild(anchor);
      anchor.click();
    } finally {
      anchor.remove();
      urlApi.revokeObjectURL(url);
    }
  }

  function renderCapture(element, report, translate, now) {
    element.textContent = '';
    if (!report) return;
    const date = typeof report.capturedAt === 'string' ? new Date(report.capturedAt) : null;
    const captured = date?.getTime();
    const valid = Number.isFinite(captured) && Number.isFinite(now) && captured <= now;
    const version = typeof report.appVersion === 'string' && /^\d+\.\d+\.\d+$/.test(report.appVersion)
      ? report.appVersion : translate('capture_unknown');
    element.textContent = `${translate('capture_version')}: ${version}. ${translate('capture_time')}: ${valid
      ? date.toISOString() : translate('capture_unknown')}. ${translate('capture_elapsed')}: ${valid
      ? `${Math.floor((now - captured) / 1000)} s` : translate('capture_unknown')}. ${translate('capture_scope')}`;
  }

  const api = { describe, render, download, renderCapture };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EcoFlowReporterStatus = api;
}(typeof window === 'undefined' ? {} : window));
