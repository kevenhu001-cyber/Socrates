/*
 * workspace-reference-ui.js
 *
 * Interactivity for the reference-styled workspace pages:
 *  - Spaces panel: filter pills, search-input filter, hide React duplicate chrome
 *  - Plugins panel: top tabs (插件 / 技能), scope tabs (公开 / 个人),
 *                   add-button focus, demo card click affordance
 *  - Library panel: upload button forwards to #libraryUploadInput
 *
 * Also suppresses the React `WorkspacePageHeader` and legacy chatgpt-ui.css
 * page chrome while the reference head is active, so the user sees a single
 * (reference-aligned) header per page rather than two stacked copies.
 */

function bindRowToggle(buttons) {
  if (!buttons || !buttons.length) return;
  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      buttons.forEach(function (b) {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
      });
      try {
        document.dispatchEvent(new CustomEvent('workspace-reference:filter-change', {
          detail: { group: btn.parentElement?.dataset?.group, value: btn.dataset },
        }));
      } catch (_) { /* ignore */ }
    });
  });
}

function setupSpacesFilters() {
  var filterGroup = document.querySelector('#spacesPanel .spaces-panel-filters');
  if (filterGroup) {
    bindRowToggle(filterGroup.querySelectorAll('button'));
    filterGroup.dataset.group = 'spaces-filter';
  }
  var search = document.querySelector('#spacesPanel .spaces-panel-search');
  if (search) {
    search.addEventListener('input', function () {
      var q = (search.value || '').toLowerCase().trim();
      var rows = document.querySelectorAll('#spacesPanel .spaces-list-row');
      rows.forEach(function (row) {
        var text = (row.textContent || '').toLowerCase();
        row.style.display = !q || text.indexOf(q) > -1 ? '' : 'none';
      });
    });
  }
  var newBtn = document.querySelector('#spacesPanel .spaces-panel-new');
  if (newBtn) {
    newBtn.addEventListener('click', function () {
      try {
        if (typeof window.openCreateProject === 'function') window.openCreateProject();
      } catch (_) { /* swallow */ }
    });
  }
}

function setupPluginsTabs() {
  var topGroup = document.querySelector('#pluginsPanel .plugins-panel-tabs .pill');
  if (topGroup) {
    bindRowToggle(topGroup.querySelectorAll('button'));
    topGroup.dataset.group = 'plugins-top';
  }
  var scopeGroup = document.querySelector('#pluginsPanel .plugins-scope-tabs');
  if (scopeGroup) {
    bindRowToggle(scopeGroup.querySelectorAll('button'));
    scopeGroup.dataset.group = 'plugins-scope';
  }
  var addBtn = document.querySelector('#pluginsPanel .plugins-panel-add');
  if (addBtn) {
    addBtn.addEventListener('click', function () {
      try {
        if (typeof window.openPluginMarketplace === 'function') window.openPluginMarketplace();
      } catch (_) { /* swallow */ }
    });
  }
  var cards = document.querySelectorAll('#pluginsPanel .plugins-card');
  cards.forEach(function (card) {
    card.addEventListener('click', function () {
      try {
        document.dispatchEvent(new CustomEvent('workspace-reference:card-click', {
          detail: { name: card.querySelector('strong')?.textContent || '' },
        }));
      } catch (_) { /* ignore */ }
    });
  });
}

function setupLibraryHeader() {
  var upload = document.querySelector('#libraryPanel .library-panel-upload');
  if (upload) {
    upload.addEventListener('click', function () {
      var input = document.getElementById('libraryUploadInput');
      if (input) input.click();
    });
  }
}

/* Hide the React-rendered WorkspacePageHeader and legacy page chrome when
   our reference head is present. The React mount still targets the existing
   list containers, so we keep the legacy content for fall-back semantics
   but visually mute the duplicate headers. */
function suppressReferenceDuplicates() {
  try {
    var style = document.createElement('style');
    style.setAttribute('data-source', 'workspace-reference-ui');
    style.textContent = [
      '#spacesPanel.workspace-ref-active .workspace-page-head,',
      '#spacesPanel.workspace-ref-active .plugin-directory-head,',
      '#spacesPanel.workspace-ref-active .plugin-directory-search,',
      '#spacesPanel.workspace-ref-active .plugin-installed-strip,',
      '#spacesPanel.workspace-ref-active .plugin-directory-tabs,',
      '#spacesPanel.workspace-ref-active #pluginsList,',
      '#spacesPanel.workspace-ref-active .scheduled-empty-state,',
      '#spacesPanel.workspace-ref-active .scheduled-directory-head,',
      '#spacesPanel.workspace-ref-active .scheduled-task-list,',
      '#spacesPanel.workspace-ref-active .recents-empty-state { display: none !important; }',

      '#pluginsPanel.workspace-ref-active .workspace-page-head,',
      '#pluginsPanel.workspace-ref-active .plugin-directory-head,',
      '#pluginsPanel.workspace-ref-active .plugin-directory-search,',
      '#pluginsPanel.workspace-ref-active .plugin-installed-strip,',
      '#pluginsPanel.workspace-ref-active .plugin-directory-tabs,',
      '#pluginsPanel.workspace-ref-active .plugin-directory-list,',
      '#pluginsPanel.workspace-ref-active .plugin-directory-note,',
      '#pluginsPanel.workspace-ref-active .plugin-directory-warning,',
      '#pluginsPanel.workspace-ref-active #pluginsList:not(.visually-hidden),',
      '#pluginsPanel.workspace-ref-active .codex-mcp-card { display: none !important; }',

      '#libraryPanel.workspace-ref-active .workspace-page-head,',
      '#libraryPanel.workspace-ref-active .plugin-directory-head,',
      '#libraryPanel.workspace-ref-active #libraryList > *:not(.visually-hidden),',
      '#libraryPanel.workspace-ref-active .library-empty,',
      '#libraryPanel.workspace-ref-active #libraryPanelBody > * { display: none !important; }'
    ].join('\n');
    document.head.appendChild(style);
  } catch (_) { /* ignore */ }
}

/* Toggle the workspace-ref-active body class when one of the workspace
   panels becomes visible. The CSS above reads this class to decide what
   to hide, so legacy React-rendered headers don't double up with our
   static reference head. */
function setupReferenceActiveTracker() {
  var targets = ['spacesPanel', 'pluginsPanel', 'libraryPanel'];
  function syncActive() {
    targets.forEach(function (id) {
      var panel = document.getElementById(id);
      if (!panel) return;
      var isActive = panel.classList.contains('main-page')
        && !panel.classList.contains('hidden');
      panel.classList.toggle('workspace-ref-active', isActive);
    });
  }
  ['openProjects', 'openPlugins', 'openLibrary'].forEach(function (hookName) {
    var original = window[hookName];
    if (typeof original !== 'function') return;
    window[hookName] = function () {
      var result = original.apply(this, arguments);
      try { syncActive(); } catch (_) { /* ignore */ }
      return result;
    };
  });
  /* Run once on load too, in case the panel is already visible. */
  try { syncActive(); } catch (_) { /* ignore */ }
  /* MutationObserver for safety: when classes change we re-evaluate. */
  try {
    var observer = new MutationObserver(syncActive);
    targets.forEach(function (id) {
      var panel = document.getElementById(id);
      if (panel) observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
    });
  } catch (_) { /* ignore */ }
}

(function init() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
  function boot() {
    setupSpacesFilters();
    setupPluginsTabs();
    setupLibraryHeader();
    setupReferenceActiveTracker();
  }
})();
