'use strict';
(function expose(root) {
  function mount(container, Homey) {
    const t = key => Homey.__('coordination.' + key);
    document.getElementById('coordinationTitle').textContent = t('title');
    const fields = ['grid', 'externalSoc', 'externalPower', 'streamPower', 'secondary'];
    let token = null, clientId = null, catalog = [], previous = null, generation = 0, expiry, pending = false, saved = null;
    const controls = {};
    function el(tag, text, parent, id) {
      const node = document.createElement(tag); if (text) node.textContent = text;
      if (id) node.id = id; (parent || container).appendChild(node); return node;
    }
    function check(key) {
      const label = el('label', '', container); label.className = 'beta-toggle';
      const box = el('input', '', label, 'coord-' + key); box.type = 'checkbox'; box.checked = false;
      el('span', t(key), label); return box;
    }
    const overview = el('p', t('overview')); overview.className = 'help';
    el('p', t('permission')).className = 'help';
    const consent = check('consent');
    const body = el('div'); body.hidden = true;
    const status = el('p', t('disabled'), container, 'coord-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const load = el('button', t('load'), body, 'coord-load'); load.type = 'button';
    el('p', t('privacy'), body).className = 'help';
    const form = el('fieldset', '', body, 'coord-bindings');
    form.style.minWidth = '0';
    el('legend', t('bindings'), form);
    const label = el('label', t('site'), form); label.htmlFor = 'coord-site';
    const site = el('input', '', form, 'coord-site'); site.value = ''; site.maxLength = 64; site.autocomplete = 'off';
    const roleLabel = el('label', t('secondaryRole'), form); roleLabel.htmlFor = 'coord-secondary-role';
    const role = el('select', '', form, 'coord-secondary-role');
    ['none', 'solar_inverter', 'hybrid_inverter', 'load'].forEach(value => { const option = el('option', t('role_' + value), role); option.value = value; });
    const slotRows = {};
    fields.forEach(slot => {
      const row = el('div', '', form); slotRows[slot] = row;
      const caption = el('label', t(slot), row); caption.htmlFor = 'coord-' + slot;
      const select = el('select', '', row, 'coord-' + slot); controls[slot] = { select };
      const signLabel = el('label', t('polarity'), row); signLabel.htmlFor = 'coord-sign-' + slot;
      const sign = el('select', '', row, 'coord-sign-' + slot); controls[slot].sign = sign;
      const options = slot === 'externalSoc' ? ['soc'] : slot === 'grid' ? ['', 'import', 'export']
        : slot === 'secondary' ? ['', 'to_house', 'from_house'] : ['', 'charging', 'discharging'];
      options.forEach(value => { const option = el('option', t(value ? 'sign_' + value : 'choose'), sign); option.value = value; });
    });
    const acknowledgementBox = el('div', '', body);
    function ack(key) { const label = el('label', '', acknowledgementBox); label.className = 'beta-toggle';
      const box = el('input', '', label, 'coord-' + key); box.type = 'checkbox'; el('span', t(key), label); return box; }
    const reviewed = ack('reviewed'), noManual = ack('noManualOverride'), noConflict = ack('noCompetingController'), other = ack('otherSourcesReviewed');
    const save = el('button', t('save'), body, 'coord-save'); save.type = 'button'; save.className = 'secondary-action';
    const forget = el('button', t('forget'), body, 'coord-forget'); forget.type = 'button'; forget.className = 'secondary-action';
    const evaluate = el('button', t('evaluate'), body, 'coord-evaluate'); evaluate.type = 'button';
    const result = el('div', '', body, 'coord-result'); result.setAttribute('role', 'status'); result.setAttribute('aria-live', 'polite');
    const warning = el('p', t('timing'), body); warning.className = 'help';
    // Independent consent: page-preview access never starts or extends background Flow monitoring.
    let flowEpoch = 0, flowBusy = false, flowActive = false;
    const flowBox = el('fieldset', '', container, 'coord-flow-panel'); flowBox.style.minWidth = '0';
    el('legend', t('flow_title'), flowBox); el('p', t('flow_help'), flowBox).className = 'help';
    const flowLabel = el('label', '', flowBox); flowLabel.className = 'beta-toggle';
    const flowConsent = el('input', '', flowLabel, 'coord-flow-consent'); flowConsent.type = 'checkbox'; flowConsent.checked = false;
    el('span', t('flow_consent'), flowLabel);
    function flowNumber(id, key, value, min, max) {
      const label = el('label', t(key), flowBox); label.htmlFor = id;
      const input = el('input', '', flowBox, id); input.type = 'number'; input.value = String(value); input.min = String(min); input.max = String(max); input.step = '1';
      return input;
    }
    const startSoc = flowNumber('coord-flow-start-soc', 'flow_start_soc', 98, 1, 100);
    const stopSoc = flowNumber('coord-flow-stop-soc', 'flow_stop_soc', 97, 0, 99);
    const flowStart = el('button', t('flow_start'), flowBox, 'coord-flow-start'); flowStart.type = 'button';
    const flowStop = el('button', t('flow_stop'), flowBox, 'coord-flow-stop'); flowStop.type = 'button';
    const flowCheck = el('button', t('flow_check'), flowBox, 'coord-flow-check'); flowCheck.type = 'button';
    const flowStatus = el('p', t('flow_not_checked'), flowBox, 'coord-flow-status'); flowStatus.setAttribute('role', 'status'); flowStatus.setAttribute('aria-live', 'polite');
    function flowUpdate() {
      const start = Number(startSoc.value), stop = Number(stopSoc.value);
      const validPolicy = startSoc.value !== '' && stopSoc.value !== '' && Number.isFinite(start) && Number.isFinite(stop)
        && start >= 1 && start <= 100 && stop >= 0 && stop < start;
      flowStart.disabled = flowBusy || !validPolicy || !flowConsent.checked || !consent.checked || !catalog.length
        || ![reviewed, noManual, noConflict, other].every(box => box.checked);
    }
    function flowView(value) { flowActive = value.active === true;
      flowStatus.textContent = t(flowActive ? 'flow_running' : 'flow_off')
        + (flowActive ? ' · ' + t('flow_state') + ': ' + (['waiting', 'review_candidate', 'blocked'].includes(value.state) ? t('state_' + value.state) : t('unknown'))
          + ' · ' + reason(value.reason) : '');
      if (flowActive && Number.isFinite(value.priorityStartSoc) && Number.isFinite(value.priorityStopSoc)) {
        flowStatus.textContent += ' · ' + t('flow_thresholds') + ': ' + value.priorityStartSoc + '/' + value.priorityStopSoc;
      }
    }
    function flowRequest(data, callback) {
      const epoch = flowEpoch; let done = false;
      const timer = setTimeout(() => finish(new Error('timeout')), 12000);
      function finish(error, value) { if (done) return; done = true; clearTimeout(timer);
        if (epoch !== flowEpoch) return; callback(error, value || {}); }
      Homey.api('POST', '/coordination-flow-monitor', data, finish);
    }
    function stopFlow(messageKey) {
      flowEpoch += 1; flowBusy = false; flowConsent.checked = false; flowActive = false; flowUpdate();
      flowRequest({ action: 'stop' }, (error, value) => {
        if (error) flowStatus.textContent = t('flow_stop_unconfirmed'); else {
          flowView(value); if (typeof messageKey === 'string') flowStatus.textContent += ' ' + t(messageKey);
        }
      });
    }
    function invalidateFlow() { if (flowActive || flowBusy) stopFlow(); }
    flowConsent.addEventListener('change', () => { if (!flowConsent.checked) stopFlow(); flowUpdate(); });
    [startSoc, stopSoc].forEach(input => input.addEventListener('input', () => { invalidateFlow(); flowUpdate(); }));
    flowStop.addEventListener('click', stopFlow);
    flowCheck.addEventListener('click', () => flowRequest({ action: 'status' }, (error, value) => {
      flowStatus.textContent = error ? t('flow_failed') : ''; if (!error) flowView(value);
    }));
    flowStart.addEventListener('click', () => {
      if (flowStart.disabled) return;
      flowBusy = true; flowUpdate(); flowStatus.textContent = t('flow_starting');
      // Revision compare-and-swap prevents a delayed start from undoing a later Stop/source edit.
      flowRequest({ action: 'status' }, (error, value) => {
        if (error || !Number.isInteger(value.revision)) { flowBusy = false; flowStatus.textContent = t('flow_failed'); flowUpdate(); return; }
        flowRequest({ action: 'start', expectedRevision: value.revision, flowConsent: flowConsent.checked, bindings: bindings(),
          policy: { startSoc: Number(startSoc.value), stopSoc: Number(stopSoc.value) },
          acknowledgements: { noManualOverride: noManual.checked, noCompetingController: noConflict.checked, otherSourcesReviewed: other.checked } },
        (err, state) => { flowBusy = false; flowUpdate();
          if (err) { stopFlow(typeof err.message === 'string' && err.message.includes('coordination_flow_unverified_preview_source')
            ? 'flow_unverified_source' : 'flow_failed'); return; } flowView(state);
        });
      });
    });
    function invalidate() { previous = null; generation += 1; clearTimeout(expiry); result.replaceChildren(); }
    function update() {
      body.hidden = !consent.checked; slotRows.secondary.hidden = role.value === 'none';
      load.disabled = !consent.checked || pending;
      evaluate.disabled = save.disabled = !consent.checked || !catalog.length || pending;
      flowUpdate();
    }
    function bindings() {
      const sources = {};
      fields.forEach(slot => {
        if (slot === 'secondary' && role.value === 'none') return;
        const selected = controls[slot].select.value === '' ? null : catalog[Number(controls[slot].select.value)];
        if (!selected) return;
        sources[slot] = { deviceId: selected.deviceId, driverId: selected.driverId, capabilityId: selected.capabilityId,
          unit: selected.unit, positiveMeans: controls[slot].sign.value };
      });
      return { schemaVersion: 1, siteKey: site.value.trim(), reviewed: reviewed.checked, secondaryRole: role.value, sources };
    }
    function populate() {
      fields.forEach(slot => {
        const select = controls[slot].select; select.replaceChildren();
        const empty = el('option', t('choose'), select); empty.value = '';
        catalog.forEach((row, index) => {
          if ((slot === 'externalSoc') !== (row.unit === '%')) return;
          const option = el('option', row.name + ' — ' + row.title + ' (' + row.unit + ')', select); option.value = String(index);
        });
        const prior = saved?.sources?.[slot];
        if (prior) { const index = catalog.findIndex(row => row.deviceId === prior.deviceId && row.driverId === prior.driverId
          && row.capabilityId === prior.capabilityId && row.unit === prior.unit);
          if (index >= 0) { select.value = String(index); controls[slot].sign.value = prior.positiveMeans; }
        }
      });
      if (saved) { site.value = typeof saved.siteKey === 'string' ? saved.siteKey : ''; role.value = saved.secondaryRole || 'none'; }
      [reviewed, noManual, noConflict, other].forEach(box => { box.checked = false; }); update();
    }
    function request(data, callback) {
      if (pending) return;
      pending = true; update(); const epoch = generation; let done = false;
      const timeout = setTimeout(() => finish(null, { reason: 'read_timeout', state: 'blocked' }), 12000);
      function finish(error, response) {
        if (done) return; done = true; clearTimeout(timeout);
        if (epoch !== generation || !consent.checked) return;
        pending = false; update(); callback(error, response || {});
      }
      Homey.api('POST', '/coordination-workspace', { ...data, consent: true, token, clientId }, finish);
    }
    function reason(value) {
      const groups = {
        recent: 'recent', preview_disabled: 'disabled', consent_required: 'disabled', busy: 'busy', rate_limited: 'rate',
        monitor_starting: 'flow_starting', selected_readings_current: 'recent', selected_readings_unavailable: 'missing',
        session_expired: 'session', read_failed: 'failed', read_timeout: 'failed', bindings_invalid: 'invalid',
        device_unavailable: 'missing', capability_contract_changed: 'contract', reading_unknown: 'missing',
        timestamp_unknown: 'timestamp', reading_stale: 'expired', reading_invalid: 'invalid',
        missing_or_stale_input: 'expired', incoherent_reading_times: 'skew',
        controller_ownership_unverified: 'ownership', other_sources_unreviewed: 'ownership',
        external_battery_priority: 'priority', external_battery_still_charging: 'priority',
        opposing_battery_flows: 'flows', external_battery_discharging: 'flows', stream_discharging: 'flows',
        grid_import_present: 'importing', insufficient_observed_export: 'noSurplus',
        surplus_dwell_or_cooldown: 'dwell', observed_surplus_for_review: 'candidate',
        unadvanced_power_readings: 'unchanged', duplicate_evaluation: 'unchanged',
      };
      return t(groups[value] || 'reason_unknown');
    }
    function show(response, elapsed) {
      result.replaceChildren();
      el('h3', t('state_' + (['waiting', 'review_candidate'].includes(response.state) ? response.state : 'blocked')), result);
      el('p', reason(response.reason), result);
      (response.readings || []).slice(0, 5).forEach(row => {
        if (!fields.includes(row.slot)) return;
        const paragraph = el('p', t(row.slot) + ': ', result);
        if (typeof row.value === 'number' && Number.isFinite(row.value) && row.status === 'recent') paragraph.appendChild(document.createTextNode(
          new Intl.NumberFormat(t('number_locale'), { maximumFractionDigits: 2 }).format(row.value) + ' ' + row.unit));
        else paragraph.appendChild(document.createTextNode(t('unknown')));
        paragraph.appendChild(document.createTextNode(' · ' + reason(row.status) + (typeof row.ageSec === 'number' ? ' · ' + Math.floor(row.ageSec) + ' s' : '')));
      });
      el('p', t('disabledActions'), result);
      previous = response.decision || null;
      const remaining = Number(response.expiresAt) - Number(response.capturedAt) - elapsed;
      clearTimeout(expiry);
      if (response.readings?.some(row => row.value !== null) && remaining > 0 && remaining <= 60000) {
        expiry = setTimeout(() => { invalidate(); status.textContent = t('expired'); }, remaining);
      } else if (response.readings?.some(row => row.value !== null)) {
        invalidate(); status.textContent = t('expired');
      }
    }
    consent.addEventListener('change', () => {
      invalidate(); pending = false;
      [reviewed, noManual, noConflict, other].forEach(box => { box.checked = false; });
      if (!consent.checked) { const old = token; token = null; catalog = []; populate();
        if (old || clientId) Homey.api('POST', '/coordination-workspace', { action: 'revoke', token: old, clientId }, () => {});
        clientId = null;
      }
      status.textContent = t(consent.checked ? 'enabled' : 'disabled'); update();
    });
    [site, role, ...fields.flatMap(slot => [controls[slot].select, controls[slot].sign])]
      .forEach(node => node.addEventListener('change', () => { invalidate(); pending = false;
        invalidateFlow();
        [reviewed, noManual, noConflict, other].forEach(box => { box.checked = false; });
        status.textContent = t('changed'); update(); }));
    [reviewed, noManual, noConflict, other].forEach(node => node.addEventListener('change', () => {
      invalidateFlow();
      invalidate(); pending = false; status.textContent = t('changed'); update();
    }));
    load.addEventListener('click', () => {
      invalidate(); status.textContent = t('loading');
      clientId = root.crypto?.randomUUID?.() || (String(Date.now()) + '-' + String(generation));
      request({ action: 'open' }, (error, response) => {
        if (error || !response.token) { status.textContent = error ? t('failed') : reason(response.reason); return; }
        token = response.token;
        request({ action: 'catalog' }, (err, data) => { catalog = err ? [] : data.sources || []; populate();
          status.textContent = err ? t('failed') : t(catalog.length ? 'loaded' : 'empty'); });
      });
    });
    evaluate.addEventListener('click', () => {
      clearTimeout(expiry); result.replaceChildren(); const requestedAt = Date.now();
      request({ action: 'evaluate', bindings: bindings(), previous,
        acknowledgements: { noManualOverride: noManual.checked, noCompetingController: noConflict.checked, otherSourcesReviewed: other.checked } },
      (error, response) => { if (error) { previous = null; status.textContent = t('failed'); } else { status.textContent = t('snapshot'); show(response, Date.now() - requestedAt); } });
    });
    save.addEventListener('click', () => {
      const value = bindings(); if (!value.reviewed) { status.textContent = reason('bindings_invalid'); return; }
      request({ action: 'validate', bindings: value }, (error, response) => {
        if (error || !response.bindings) { status.textContent = error ? t('failed') : reason(response.reason); return; }
        const epoch = generation;
        Homey.set('streamCoordinationBindingsV1', response.bindings, err => {
          if (!err) saved = response.bindings;
          if (epoch === generation && consent.checked) status.textContent = t(err ? 'failed' : 'saved');
        });
      });
    });
    forget.addEventListener('click', () => { invalidateFlow(); invalidate(); saved = null; site.value = ''; role.value = 'none'; populate();
      Homey.set('streamCoordinationBindingsV1', null, error => { status.textContent = t(error ? 'failed' : 'forgotten'); }); });
    Homey.get('streamCoordinationBindingsV1', (error, value) => { if (!error && value?.schemaVersion === 1) saved = value; });
    function clear() { invalidate(); consent.checked = false; catalog = []; pending = false;
      if (token || clientId) Homey.api('POST', '/coordination-workspace', { action: 'revoke', token, clientId }, () => {});
      token = null; clientId = null; populate(); status.textContent = t('disabled'); update(); }
    root.addEventListener('pagehide', clear);
    document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
    update();
  }
  root.EcoFlowCoordinationSettings = { mount };
}(window));
