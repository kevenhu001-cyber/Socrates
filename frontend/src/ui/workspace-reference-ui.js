/*
 * workspace-reference-ui.js
 *
 * Interactivity for the reference-styled workspace pages:
 *  - Spaces panel: filter pills, search-input filter, hide React duplicate chrome
 *  - Plugins panel: scope tabs (公开 / 个人),
 *                   add-button forwards to the marketplace opener.
 *                   (Static directory cards were removed: the live React
 *                   directory owns all plugin content and OpenConnector
 *                   actions, so the fallback shell keeps no dead buttons.)
 *  - Library panel: upload button forwards to #libraryUploadInput
 *
 * Also keeps the fallback reference shell from colliding with legacy page
 * chrome before a live React directory mounts. Once the live directory is
 * present, React owns its header and list and the shell CSS hides the static
 * fallback.
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

/* Suppress fallback/legacy chrome only before the live React directory is
   mounted. The live directory owns its header and list; hiding either here
   would make an opened workspace appear blank. */
function suppressReferenceDuplicates() {
  try {
    var style = document.createElement('style');
    style.setAttribute('data-source', 'workspace-reference-ui');
    style.textContent = [
      /* Once a live React directory mounts, chatgpt-v2.css hides the
         static shell via [data-live-directory]. Do not hide the live
         header/list here as well, or opening a workspace becomes blank. */
      '#spacesPanel.workspace-ref-active:not([data-live-directory="true"]) .workspace-page-head,',
      '#spacesPanel.workspace-ref-active:not([data-live-directory="true"]) .plugin-directory-head,',
      '#spacesPanel.workspace-ref-active:not([data-live-directory="true"]) .plugin-directory-search,',
      '#spacesPanel.workspace-ref-active:not([data-live-directory="true"]) .plugin-installed-strip,',
      '#spacesPanel.workspace-ref-active:not([data-live-directory="true"]) .plugin-directory-tabs,',
      '#spacesPanel.workspace-ref-active:not([data-live-directory="true"]) #pluginsList,',
      '#spacesPanel.workspace-ref-active:not([data-live-directory="true"]) .scheduled-empty-state,',
      '#spacesPanel.workspace-ref-active:not([data-live-directory="true"]) .scheduled-directory-head,',
      '#spacesPanel.workspace-ref-active:not([data-live-directory="true"]) .scheduled-task-list,',
      '#spacesPanel.workspace-ref-active:not([data-live-directory="true"]) .recents-empty-state { display: none !important; }',

      '#pluginsPanel.workspace-ref-active:not([data-live-directory="true"]) .workspace-page-head,',
      '#pluginsPanel.workspace-ref-active:not([data-live-directory="true"]) .plugin-directory-head,',
      '#pluginsPanel.workspace-ref-active:not([data-live-directory="true"]) .plugin-directory-search,',
      '#pluginsPanel.workspace-ref-active:not([data-live-directory="true"]) .plugin-installed-strip,',
      '#pluginsPanel.workspace-ref-active:not([data-live-directory="true"]) .plugin-directory-tabs,',
      '#pluginsPanel.workspace-ref-active:not([data-live-directory="true"]) .plugin-directory-list,',
      '#pluginsPanel.workspace-ref-active:not([data-live-directory="true"]) .plugin-directory-note,',
      '#pluginsPanel.workspace-ref-active:not([data-live-directory="true"]) .plugin-directory-warning,',
      '#pluginsPanel.workspace-ref-active:not([data-live-directory="true"]) #pluginsList:not(.visually-hidden),',

      '#libraryPanel.workspace-ref-active:not([data-live-directory="true"]) .workspace-page-head,',
      '#libraryPanel.workspace-ref-active:not([data-live-directory="true"]) .plugin-directory-head,',
      '#libraryPanel.workspace-ref-active:not([data-live-directory="true"]) #libraryList > *:not(.visually-hidden),',
      '#libraryPanel.workspace-ref-active:not([data-live-directory="true"]) .library-empty,',
      '#libraryPanel.workspace-ref-active:not([data-live-directory="true"]) #libraryPanelBody > * { display: none !important; }'
    ].join('\n');
    document.head.appendChild(style);
  } catch (_) { /* ignore */ }
}

/* Toggle the workspace-ref-active class when one of the workspace panels
   becomes visible. The CSS above combines it with data-live-directory so
   fallback chrome is suppressed without hiding the live React directory. */
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
    // Install the fallback-chrome rules before binding controls. The
    // injected style is inert for a live React directory because the
    // selectors require data-live-directory to be absent.
    suppressReferenceDuplicates();
    setupSpacesFilters();
    setupPluginsTabs();
    setupLibraryHeader();
    setupReferenceActiveTracker();
  }
})();
