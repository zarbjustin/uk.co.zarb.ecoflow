(function () {
  'use strict';
  function mount(container, Homey) {
    const t = key => Homey.__('coordination.' + key);
    container.replaceChildren();
    const summary = container.parentElement.querySelector('summary');
    if (summary) summary.textContent = t('external_title');
    function text(tag, value, id) {
      const node = document.createElement(tag); node.textContent = value;
      if (id) node.id = id; container.appendChild(node); return node;
    }
    text('h3', t('external_title'), 'coord-external-notice');
    text('p', t('external_help'));
    const status = text('p', t('external_checking'), 'coord-status');
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    // Read presence only; no device catalog, token, automatic monitor, or settings write.
    try {
      Homey.get('streamCoordinationBindingsV1', (error, value) => {
        status.textContent = t(error ? 'external_read_failed' : value == null ? 'external_none' : 'external_saved');
      });
    } catch { status.textContent = t('external_read_failed'); }
  }
  window.EcoFlowCoordinationSettings = { mount };
}());
