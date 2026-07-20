/* ── Sidebar nav dispatcher (PR-A of the sidebar overhaul) ──
   Centralises active-state highlighting for the 5 secondary nav
   buttons (Library / Projects / Scheduled / Plugins / More) and
   routes each click to the right openXxx() function.

   The 5 openXxx() functions exported here are stubs in PR-A —
   each preserves the *old* behavior of the button it replaces so
   PR-A can land without breaking anything. The real feature
   implementations replace these bodies in:
     - PR-B (Library)        → openLibrary
     - PR-C (Projects/Spaces)→ openProjects
     - PR-D (Scheduled)      → openScheduled
     - PR-E (Plugins market) → openPlugins
   The dispatcher pattern is unchanged across those PRs; only the
   function bodies swap.

   `setActiveNav(name)` toggles the `.active` class on the matching
   `.sidebar-nav-btn[data-nav="…"]` so the user sees which sidebar
   view is in focus. `closeAllPanels()` hides every sidebar body
   panel (knowledge / recents / mistakes / library / spaces /
   scheduled / plugins) so the dispatcher can pivot the sidebar to
   any one of them.

   `More` is special: it opens an anchored popover, not a panel —
   so `openMoreNav()` calls into sidebar/morePopover.js, and
   `setActiveNav("more")` lights up the button while the popover
   is open without hiding the current panel underneath. */

import { toggleMorePopover } from "./morePopover.js";

/* Names of the 5 secondary nav buttons, in render order. */
var NAV_NAMES = ["library", "projects", "scheduled", "plugins", "more"];

/* Which `openXxx` handles which nav. New buttons go here. */
var NAV_OPENERS = {
  library:   openLibrary,
  projects:  openProjects,
  scheduled: openScheduled,
  plugins:   openPlugins,
  more:      openMoreNav,
};

/* The set of sidebar body panels that need to be hidden when a
   different view is selected. `recents` and `more` don't show a
   dedicated panel — recents is the default, more opens a popover
   that overlays the current view. */
var PANEL_IDS = [
  "knowledgePanel",
  "recentsPanel",
  "mistakesPanel",
  "libraryPanel",
  "spacesPanel",
  "scheduledPanel",
  "pluginsPanel",
];

/* The matching view-button ids in the search row that mirror the
   tab system (Knowledge / Recents / Mistakes). The dispatcher
   clears their `.active` class so no row is left highlighted. */
var TAB_BTN_IDS = ["tabKnowledge", "tabRecents", "tabMistakes"];

function _byId(id) { return document.getElementById(id); }
function _byNav(name) { return document.querySelector('.sidebar-nav-btn[data-nav="' + name + '"]'); }

/* ── setActiveNav(name) ──
   Toggle `.active` on the matching .sidebar-nav-btn. Pass `null` to
   clear every active button (e.g. when the user navigates to a
   non-sidebar view). The "new" button (compose) and the soon-pending
   Scheduled button are left alone unless explicitly named. */
export function setActiveNav(name) {
  for (var i = 0; i < NAV_NAMES.length; i++) {
    var btn = _byNav(NAV_NAMES[i]);
    if (btn) btn.classList.toggle("active", NAV_NAMES[i] === name);
  }
}

/* ── closeAllPanels() ──
   Hide every sidebar body panel. Used when a sidebar nav button
   opens a panel that supersedes the current one. The matching
   search-row tab button's `.active` is also cleared so no row
   remains highlighted. */
export function closeAllPanels() {
  for (var i = 0; i < PANEL_IDS.length; i++) {
    var p = _byId(PANEL_IDS[i]);
    if (p) p.classList.add("hidden");
  }
  for (var j = 0; j < TAB_BTN_IDS.length; j++) {
    var b = _byId(TAB_BTN_IDS[j]);
    if (b) b.classList.remove("active");
  }
}

/* ── openNav(name) ──
   Dispatch a nav name to its opener. Used by the inline onclick on
   each .sidebar-nav-btn. Sets the matching .active state and
   closes the other panels before delegating. */
export function openNav(name) {
  var opener = NAV_OPENERS[name];
  if (!opener) return;
  /* Light up the button first so the UI feels responsive even when
     the opener does an async setup. */
  setActiveNav(name);
  /* Library/Projects/Plugins/Scheduled open a body panel; close the
     existing one before showing the new one. More opens a popover
     on top — leave the current panel visible underneath. */
  if (name !== "more") closeAllPanels();
  try { opener(); } catch (e) { /* swallow — keep nav click idempotent */ }
}

/* ── Per-button openers (PR-B through PR-E) ── */

/* ── PR-B: Library — files & artifacts library ── */
export function openLibrary() {
  var p = _byId("libraryPanel");
  if (!p) return;
  p.classList.remove("hidden");
  _renderLibrary();
}

function _renderLibrary() {
  var list = _byId("libraryList");
  if (!list) return;
  list.innerHTML = '<div class="loading" style="padding:24px;text-align:center"><span></span><span></span><span></span></div>';
  _fetchLibraryData().then(function (data) {
    if (!data || (!data.files.length && !data.artifacts.length)) {
      var activeTab = document.querySelector('.library-tab.active');
      var tab = activeTab ? activeTab.getAttribute('data-library-tab') : 'files';
      list.innerHTML = '<div class="library-empty">' + (tab === 'files'
        ? _t("sidebar.library.empty")
        : _t("sidebar.library.artifact.empty")) + '</div>';
      return;
    }
    var html = '';
    var activeTab = document.querySelector('.library-tab.active');
    var tab = activeTab ? activeTab.getAttribute('data-library-tab') : 'files';
    var items = tab === 'files' ? data.files : data.artifacts;
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var icon = _fileIcon(item.kind || item.type);
      var name = item.name || item.title || 'untitled';
      var meta = item.uploadedAt || item.createdAt || '';
      meta = meta ? _formatTime(meta) : '';
      html += '<div class="library-item" onclick="' + (tab === 'files' ? 'window.open && window.open("/api/files/' + item.id + '")' : '') + '">'
        + '<span class="library-item-icon">' + icon + '</span>'
        + '<div class="library-item-info">'
        + '<div class="library-item-name">' + _esc(name) + '</div>'
        + '<div class="library-item-meta">' + _esc(meta) + '</div>'
        + '</div></div>';
    }
    list.innerHTML = html;
    var count = _byId("libraryCount");
    if (count) count.textContent = items.length;
  }).catch(function () {
    list.innerHTML = '<div class="library-empty">' + _t("sidebar.library.empty") + '</div>';
  });
}

function _fetchLibraryData() {
  return Promise.all([
    window.apiFetch && window.apiFetch("/api/files").then(function (r) { return r.json(); }).catch(function () { return { files: [] }; }),
    window.apiFetch && window.apiFetch("/api/artifacts").then(function (r) { return r.json(); }).catch(function () { return { artifacts: [] }; }),
  ]).then(function (results) {
    return { files: (results[0] && results[0].files) || [], artifacts: (results[1] && results[1].artifacts) || [] };
  });
}

/* exposed for the library tab switcher */
window.switchLibraryTab = function (tab) {
  var tabs = document.querySelectorAll('.library-tab');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.toggle('active', tabs[i].getAttribute('data-library-tab') === tab);
  }
  _renderLibrary();
};

/* ── PR-C: Projects — spaces panel ── */
export function openProjects() {
  var p = _byId("spacesPanel");
  if (!p) return;
  p.classList.remove("hidden");
  _renderSpaces();
}

function _renderSpaces() {
  var list = _byId("spacesList");
  if (!list) return;
  list.innerHTML = '<div class="loading" style="padding:24px;text-align:center"><span></span><span></span><span></span></div>';
  window.apiFetch("/api/projects").then(function (r) { return r.json(); }).then(function (data) {
    var rows = data.projects || [];
    if (!rows.length) {
      list.innerHTML = '<div class="spaces-empty">' + _t("sidebar.spaces.empty") + '</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var pr = rows[i];
      var color = pr.color || 'hsl(var(--accent-000))';
      html += '<div class="spaces-item" onclick="window.switchTab && window.switchTab(\'recents\'); window.setRecentsFilter && window.setRecentsFilter(\'' + _esc(pr.id) + '\')">'
        + '<span class="spaces-item-color" style="background:' + _esc(color) + '"></span>'
        + '<div class="spaces-item-info">'
        + '<div class="spaces-item-name">' + _esc(pr.name) + '</div>'
        + (pr.description ? '<div class="spaces-item-count">' + _esc(pr.description) + '</div>' : '')
        + '</div></div>';
    }
    list.innerHTML = html;
  }).catch(function () {
    list.innerHTML = '<div class="spaces-empty">' + _t("sidebar.spaces.empty") + '</div>';
  });
}

/* exposed for the create project button */
window.openCreateProject = function () {
  var name = prompt(_t("sidebar.spaces.createName"));
  if (!name) return;
  window.apiFetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: name }),
  }).then(function () { _renderSpaces(); }).catch(function () {});
};

/* ── PR-D: Scheduled — scheduled tasks panel ── */
export function openScheduled() {
  var p = _byId("scheduledPanel");
  if (!p) return;
  p.classList.remove("hidden");
  _renderScheduled();
}

function _renderScheduled() {
  var list = _byId("scheduledList");
  if (!list) return;
  list.innerHTML = '<div class="loading" style="padding:24px;text-align:center"><span></span><span></span><span></span></div>';
  window.apiFetch("/api/scheduled-tasks").then(function (r) { return r.json(); }).then(function (data) {
    var rows = data.tasks || [];
    if (!rows.length) {
      list.innerHTML = '<div class="scheduled-empty">' + _t("sidebar.scheduled.empty") + '</div>';
      return;
    }
    var now = new Date();
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var t = rows[i];
      var statusClass = t.status === 'active' ? 'active' : t.status === 'paused' ? 'paused' : 'completed';
      var nextRun = t.nextRunAt ? _formatTime(t.nextRunAt) : '—';
      var freq = _t("sidebar.scheduled." + t.frequency) || t.frequency;
      html += '<div class="scheduled-item">'
        + '<svg class="scheduled-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>'
        + '<div class="scheduled-item-info">'
        + '<div class="scheduled-item-title">' + _esc(t.title) + '</div>'
        + '<div class="scheduled-item-meta">'
        + '<span class="scheduled-item-status ' + statusClass + '"></span>'
        + '<span>' + _esc(freq) + '</span>'
        + '<span>' + _esc(nextRun) + '</span>'
        + '</div></div></div>';
    }
    list.innerHTML = html;
  }).catch(function () {
    list.innerHTML = '<div class="scheduled-empty">' + _t("sidebar.scheduled.empty") + '</div>';
  });
}

/* exposed for the create scheduled task button */
window.openCreateScheduledTask = function () {
  var title = prompt(_t("sidebar.scheduled.createTitle"));
  if (!title) return;
  window.apiFetch("/api/scheduled-tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: title, frequency: "once" }),
  }).then(function () { _renderScheduled(); }).catch(function () {});
};

/* ── PR-E: Plugins — plugins panel ── */
export function openPlugins() {
  var p = _byId("pluginsPanel");
  if (!p) return;
  p.classList.remove("hidden");
  _renderPlugins();
}

function _renderPlugins() {
  var list = _byId("pluginsList");
  if (!list) return;
  list.innerHTML = '<div class="loading" style="padding:24px;text-align:center"><span></span><span></span><span></span></div>';
  window.apiFetch("/api/plugins").then(function (r) { return r.json(); }).then(function (data) {
    var rows = data.plugins || [];
    if (!rows.length) {
      list.innerHTML = '<div class="plugins-empty">' + _t("sidebar.plugins.empty") + '</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < rows.length; i++) {
      var pl = rows[i];
      var isOn = pl.isEnabled !== false;
      html += '<div class="plugins-item">'
        + '<svg class="plugins-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="3"/><rect x="5" y="10" width="6" height="4" rx="1"/><rect x="13" y="10" width="6" height="4" rx="1"/></svg>'
        + '<div class="plugins-item-info">'
        + '<div class="plugins-item-name">' + _esc(pl.name) + '</div>'
        + (pl.description ? '<div class="plugins-item-desc">' + _esc(pl.description) + '</div>' : '')
        + '</div>'
        + '<button type="button" class="plugins-item-toggle' + (isOn ? ' on' : '') + '" onclick="window.togglePlugin && window.togglePlugin(\'' + pl.id + '\', ' + (!isOn) + ')"></button>'
        + '</div>';
    }
    list.innerHTML = html;
  }).catch(function () {
    list.innerHTML = '<div class="plugins-empty">' + _t("sidebar.plugins.empty") + '</div>';
  });
}

/* exposed for plugin toggle + browse */
window.togglePlugin = function (id, enabled) {
  window.apiFetch("/api/plugins/" + id, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isEnabled: enabled }),
  }).then(function () { _renderPlugins(); }).catch(function () {});
};

window.openPluginMarketplace = function () {
  window.apiFetch("/api/plugins/marketplace").then(function (r) { return r.json(); }).then(function (data) {
    var rows = data.plugins || [];
    if (!rows.length) {
      window.showToast && window.showToast("No plugins available in the marketplace yet.", 2000);
      return;
    }
    var msg = "Available plugins:\n";
    for (var i = 0; i < rows.length; i++) {
      msg += "• " + rows[i].name + (rows[i].description ? ": " + rows[i].description : "") + "\n";
    }
    var choice = prompt(msg + "\nEnter plugin name to install (or Cancel):");
    if (!choice) return;
    var match = null;
    for (var j = 0; j < rows.length; j++) {
      if (rows[j].name.toLowerCase() === choice.toLowerCase()) { match = rows[j]; break; }
    }
    if (!match) { window.showToast && window.showToast("Plugin not found.", 2000); return; }
    window.apiFetch("/api/plugins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: match.name, description: match.description, type: match.type }),
    }).then(function () { _renderPlugins(); window.showToast && window.showToast("Installed " + match.name, 2000); })
    .catch(function () {});
  }).catch(function () {});
};

/* ── Helpers ── */
function _t(key) {
  return (typeof window.t === "function" ? window.t(key) : key) || key;
}
function _esc(s) {
  if (typeof s !== "string") return s || '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _formatTime(iso) {
  try {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    var now = new Date();
    var diff = now - d;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch (_) { return iso; }
}
function _fileIcon(kind) {
  var icons = {
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
    pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15h6M9 12h6M9 18h3"/></svg>',
    text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  };
  return icons[kind] || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>';
}

/* More → delegates to the morePopover module. */
export function openMoreNav() {
  try { toggleMorePopover(); } catch (_) { /* popover module not yet loaded */ }
}
