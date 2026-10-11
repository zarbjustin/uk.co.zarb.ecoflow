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
    if (!Array.isArray(trials) || !trials.length) { append(translate('none')); return; }
    trials.forEach((trial, index) => {
      const result = describe(trial);
      append(`${translate('battery')} ${index + 1}: ${translate(result.state)}`);
      append(translate(result.action));
    });
    append(translate('scope'));
    append(translate('snapshot'));
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

  const api = { describe, render, download };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EcoFlowReporterStatus = api;
}(typeof window === 'undefined' ? {} : window));
