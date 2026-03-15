/* public/js/section-help.js */
(() => {
  const REGISTRY_URL = '/data/help-registry.json';
  const PANEL_ID = 'section-help-popover';
  let registryPromise = null;
  let activeButton = null;

  const ensurePanel = () => {
    let panel = document.getElementById(PANEL_ID);
    if (panel) {
      return panel;
    }

    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.className = 'section-help-popover';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-live', 'polite');
    panel.innerHTML = `
      <div class="section-help-popover__inner">
        <div class="section-help-popover__header">
          <div>
            <p class="section-help-popover__eyebrow">Help</p>
            <h2 class="section-help-popover__title" id="section-help-popover-title"></h2>
          </div>
          <button class="section-help-popover__close" type="button" aria-label="Close help">Close</button>
        </div>
        <p class="section-help-popover__summary"></p>
        <p class="section-help-popover__body"></p>
      </div>
    `;
    document.body.appendChild(panel);

    panel.querySelector('.section-help-popover__close')?.addEventListener('click', () => {
      closePanel();
    });

    return panel;
  };

  const loadRegistry = async () => {
    if (!registryPromise) {
      registryPromise = fetch(REGISTRY_URL, {
        credentials: 'same-origin',
        cache: 'no-store',
      })
        .then((response) => (response.ok ? response.json() : { entries: [] }))
        .catch(() => ({ entries: [] }));
    }
    return registryPromise;
  };

  const getEntry = async (page, section) => {
    const data = await loadRegistry();
    const entries = Array.isArray(data.entries) ? data.entries : [];
    return entries.find((entry) => entry.page === page && entry.section === section) || null;
  };

  const positionPanel = (panel, button) => {
    const rect = button.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const gutter = 12;
    let left = window.scrollX + rect.left;
    let top = window.scrollY + rect.bottom + gutter;

    const maxLeft = window.scrollX + window.innerWidth - panelRect.width - gutter;
    if (left > maxLeft) {
      left = Math.max(window.scrollX + gutter, maxLeft);
    }

    const maxTop = window.scrollY + window.innerHeight - panelRect.height - gutter;
    if (top > maxTop) {
      top = window.scrollY + rect.top - panelRect.height - gutter;
    }

    panel.style.left = `${Math.max(window.scrollX + gutter, left)}px`;
    panel.style.top = `${Math.max(window.scrollY + gutter, top)}px`;
  };

  const closePanel = () => {
    const panel = ensurePanel();
    panel.hidden = true;
    panel.removeAttribute('aria-labelledby');
    if (activeButton) {
      activeButton.setAttribute('aria-expanded', 'false');
      activeButton.focus({ preventScroll: true });
      activeButton = null;
    }
  };

  const openPanel = async (button) => {
    const page = button.dataset.helpPage;
    const section = button.dataset.helpSection;
    if (!page || !section) {
      return;
    }

    const entry = await getEntry(page, section);
    if (!entry) {
      return;
    }

    const panel = ensurePanel();
    panel.querySelector('.section-help-popover__title').textContent = entry.title || 'Help';
    panel.querySelector('.section-help-popover__summary').textContent = entry.summary || '';
    panel.querySelector('.section-help-popover__body').textContent = entry.body || '';
    panel.setAttribute('aria-labelledby', 'section-help-popover-title');

    if (activeButton && activeButton !== button) {
      activeButton.setAttribute('aria-expanded', 'false');
    }

    activeButton = button;
    button.setAttribute('aria-expanded', 'true');
    panel.hidden = false;
    positionPanel(panel, button);
  };

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('.section-help-trigger');
    const panel = document.getElementById(PANEL_ID);

    if (button) {
      event.preventDefault();
      if (activeButton === button && panel && !panel.hidden) {
        closePanel();
        return;
      }
      await openPanel(button);
      return;
    }

    if (panel && !panel.hidden && !event.target.closest('.section-help-popover')) {
      closePanel();
    }
  });

  document.addEventListener('keydown', (event) => {
    const panel = document.getElementById(PANEL_ID);
    if (event.key === 'Escape' && panel && !panel.hidden) {
      closePanel();
    }
  });

  window.addEventListener('resize', () => {
    const panel = document.getElementById(PANEL_ID);
    if (panel && !panel.hidden && activeButton) {
      positionPanel(panel, activeButton);
    }
  });

  window.addEventListener(
    'scroll',
    () => {
      const panel = document.getElementById(PANEL_ID);
      if (panel && !panel.hidden && activeButton) {
        positionPanel(panel, activeButton);
      }
    },
    true
  );
})();
