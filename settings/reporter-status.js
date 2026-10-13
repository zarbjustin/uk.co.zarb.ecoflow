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
      if (result.state === 'active') {
        append(translate('activation_only'));
        append(translate('trial_sources'));
      }
      if (result.state === 'active' && trial.updatePending === true) append(translate('update_pending'));
    });
    append(translate('scope'));
    append(translate('snapshot'));
    const explanationKeys = { individual_flow_unverified: 'individual_flow_unverified',
      expired: 'reading_expired', write_failed: 'application_failed', not_reported: 'reading_not_reported' };
    (Array.isArray(report.drivers) ? report.drivers : []).slice(0, 8).forEach(driver => {
      const reasons = new Set();
      (Array.isArray(driver.readingExplanations) ? driver.readingExplanations : []).slice(0, 64)
        .forEach(entry => Object.values(entry?.readings || {}).forEach(reason => {
          if (Object.hasOwn(explanationKeys, reason)) reasons.add(explanationKeys[reason]);
        }));
      reasons.forEach(key => append(translate(key)));
      (Array.isArray(driver.counterContinuity) ? driver.counterContinuity : []).slice(0, 64).forEach(entry => {
        append(translate('counter_scope'));
        const fields = ['accuChgEnergy', 'accuDsgEnergy'].map(key => entry?.fields?.[key]);
        if (fields.some(f => f?.possibleStall === true)) append(translate('counter_possible_stall'));
        if (fields.some(f => ['missing', 'invalid', 'stale'].includes(f?.status))) append(translate('counter_incomplete'));
      });
    });
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
        if (driver.id !== 'stream_5000_system' && driver.pairedCount > 0) append(translate('unit_scope'));
        if ((Array.isArray(driver.readingFreshness) ? driver.readingFreshness : []).some(entry =>
          Object.values(entry?.readings || {}).some(field => field?.applicationStatus === 'write_failed'))) {
          append(translate('application_failed'));
        }
        (Array.isArray(driver.physicalPower) ? driver.physicalPower : []).slice(0, 64).forEach(power => {
          if (power?.status === 'linked_power_unverified') append(translate('linked_unit_power'));
        });
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
    if (report.drivers?.some(driver => driver.id === 'stream_unit' && driver.pairedCount > 0)) append(translate('original_unit_scope'));
  }

  function download(report, doc, urlApi, BlobType, schedule = setTimeout) {
    const date = typeof report?.capturedAt === 'string' ? new Date(report.capturedAt) : null;
    const stamp = date && Number.isFinite(date.getTime()) ? date.toISOString().replace(/[:.]/g, '-') : 'snapshot';
    const blob = new BlobType([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = urlApi.createObjectURL(blob);
    const anchor = doc.createElement('a');
    let scheduled = false;
    try {
      anchor.href = url;
      anchor.download = report?.reportType === 'dual_ct_compact' ? 'ecoflow-dual-ct-compact.json'
        : report?.reportType === 'dual_ct_candidate_preview' ? 'ecoflow-dual-ct-candidates.json' : `ecoflow-integration-${stamp}.json`;
      doc.body.appendChild(anchor);
      anchor.click();
      // Some browsers/webviews consume the URL after the click has returned.
      // Revoking synchronously races the actual download. This is a request,
      // not proof that the mobile host has saved a file.
      schedule(() => urlApi.revokeObjectURL(url), 60000);
      scheduled = true;
    } finally {
      anchor.remove();
      if (!scheduled) urlApi.revokeObjectURL(url);
    }
  }

  /** Lossless fallback for hosts that block downloads and long forum posts.
   * Parts belong to one frozen snapshot; concatenation reconstructs the JSON.
   * No upload, polling, persistent storage, trimming or privacy expansion.
   */
  function reportParts(text) {
    if (typeof text !== 'string' || !text) return [];
    const parts = [];
    for (let start = 0; start < text.length;) {
      let end = Math.min(start + 8000, text.length);
      if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
      parts.push(text.slice(start, end)); start = end;
    }
    return parts;
  }

  function checksum(bytes) {
    // Copy-integrity check, not authentication or encryption.
    let hash = 2166136261;
    bytes.forEach(byte => { hash = Math.imul(hash ^ byte, 16777619) >>> 0; });
    return hash.toString(16).padStart(8, '0');
  }

  /** ASCII transport avoids smart quotes, checkbox conversion and split JSON. */
  function reportMessages(text) {
    if (typeof text !== 'string' || !text) return [];
    const bytes = new TextEncoder().encode(text);
    if (bytes.length > 2304000) throw new Error('Report exceeds message limit. Use the JSON download.');
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    const encoded = btoa(binary);
    const count = Math.ceil(encoded.length / 6000);
    const stamp = `${checksum(bytes)}-${bytes.length}`;
    return Array.from({ length: count }, (_, i) =>
      `\`\`\`text\nECOFLOW-REPORT-1 ${stamp} ${i + 1}/${count}\n${encoded.slice(i * 6000, (i + 1) * 6000)}\n\`\`\``);
  }

  /** Reassemble only complete, internally consistent parts. Never repair values. */
  function reassembleReportMessages(messages) {
    const fail = () => { throw new Error('Incomplete, mixed or damaged report parts.'); };
    if (!Array.isArray(messages) || !messages.length || messages.length > 512) return fail();
    let stamp; let count; const parts = new Map();
    messages.forEach(message => {
      if (typeof message !== 'string' || message.length > 8000) return fail();
      let body = message.trim().replace(/\r\n/g, '\n');
      // Also accept a rendered forum code block copied without Markdown fences.
      if (body.startsWith('```')) {
        const fenced = /^```text\r?\n([\s\S]*)\r?\n```$/.exec(body);
        if (!fenced) return fail();
        body = fenced[1];
      }
      const match = /^ECOFLOW-REPORT-1 ([a-f0-9]{8}-[0-9]+) ([0-9]+)\/([0-9]+)\r?\n([A-Za-z0-9+/=]+)$/.exec(body);
      if (!match) return fail();
      const index = Number(match[2]); const total = Number(match[3]);
      if (total < 1 || total > 512 || index < 1 || index > total || parts.has(index)
        || (stamp && stamp !== match[1]) || (count && count !== total)) return fail();
      stamp = match[1]; count = total; parts.set(index, match[4]);
    });
    if (parts.size !== count) return fail();
    let binary;
    try { binary = atob(Array.from({ length: count }, (_, i) => parts.get(i + 1)).join('')); } catch { return fail(); }
    if (binary.length > 2304000) return fail();
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    if (`${checksum(bytes)}-${bytes.length}` !== stamp) return fail();
    try {
      const result = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      JSON.parse(result);
      return result;
    } catch { return fail(); }
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

  function renderCaptureGuide(element, report, translate) {
    element.textContent = '';
    const keys = report ? ['capture_guide_refresh', 'capture_guide_screenshots', 'capture_guide_json',
      'capture_guide_log', 'capture_guide_privacy'] : ['refresh'];
    keys.forEach((key, index) => {
      const p = element.ownerDocument.createElement('p');
      p.textContent = `${report ? `${index + 1}. ` : ''}${translate(key)}`;
      element.appendChild(p);
    });
  }

  const api = { describe, render, download, reportParts, reportMessages, reassembleReportMessages, renderCapture, renderCaptureGuide };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EcoFlowReporterStatus = api;
}(typeof window === 'undefined' ? {} : window));
