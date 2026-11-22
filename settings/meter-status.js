'use strict';

// Render only fixed-label local evidence. No polling, identities or HTML injection.
(function expose(root) {
  function describe(evidence) {
    const grid = evidence?.activeGrid;
    const validAge = typeof grid?.ageSec === 'number' && Number.isFinite(grid.ageSec) && grid.ageSec >= 0;
    const fresh = grid?.stale === false && validAge && grid.ageSec <= 90
      && typeof grid.value === 'number' && Number.isFinite(grid.value);
    const source = ['direct_meter', 'linked_installation'].includes(grid?.source) ? grid.source : 'unknown';
    return {
      state: !grid ? 'waiting' : !fresh ? 'stale' : source === 'unknown' ? 'waiting' : source,
      ageSec: validAge ? Math.ceil(grid.ageSec) : null,
      value: fresh && source !== 'unknown' ? grid.value : null,
    };
  }

  function render(element, report, translate) {
    element.textContent = '';
    const doc = element.ownerDocument;
    const append = (text) => {
      const p = doc.createElement('p');
      p.textContent = text;
      element.appendChild(p);
    };
    if (!report) { append(translate('refresh')); return; }
    const meters = Array.isArray(report.smartMeters) ? report.smartMeters : [];
    const recovery = Array.isArray(report.dualCtEnergyRecovery) ? report.dualCtEnergyRecovery : [];
    const linked = recovery.filter(row => row?.mode === 'single_phase' && /^[a-z_]{1,48}$/.test(row.linkedPowerStatus || ''));
    linked.forEach(row => append(translate('linked_title') + ' · ' + translate('linked_' + row.linkedPowerStatus)));
    if (!meters.length && !linked.length) { append(translate('none')); return; }
    meters.forEach((meter, index) => {
      const status = describe(meter?.evidence);
      append(`${translate('meter')} ${index + 1}: ${translate(status.state)}`);
      if (status.ageSec !== null) append(`${translate('age')}: ${status.ageSec} s`);
      if (status.value !== null) append(`${translate('power')}: ${status.value} W`);
      append(translate(status.state === 'direct_meter' ? 'direct_help'
        : status.state === 'linked_installation' ? 'fallback_help' : 'missing_help'));
      append(translate('accounting'));
    });
    append(translate('snapshot'));
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { describe, render };
  else root.EcoFlowMeterStatus = { describe, render };
}(typeof window === 'undefined' ? {} : window));
