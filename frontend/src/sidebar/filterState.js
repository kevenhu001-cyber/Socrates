/* ─────────────────────────────────────────────────────────────
   sidebar/filterState.js
   Unified sidebar filter state — single API surface that wraps
   the four orthogonal filter dimensions the sidebar currently
   manages:

     1. project  — main.js owns this via state.session.activeProjectFilter;
                   intentionally NOT routed through setFilter() because
                   the project chips have their own multi-state UX
                   (click = select project + scope recents; click-active
                   chip = clear). Project switching stays where it is.
     2. chip     — sidebar/index.js owns this via localStorage under
                   window.RECENTS_FILTER_KEY. Written via
                   window.setRecentsFilter (bridged); read directly
                   from localStorage to avoid a circular import.
     3. view     — persisted under 'socrates-sidebar-filter-view';
                   routed via window.switchTab (bridged in main.js).
     4. search   — main.js owns RECENTS_SEARCH_QUERY; routed via
                   window.setRecentsSearch (bridged).

   This module is the *one* place that syncs the chip DOM
   (aria-pressed + visual .is-active) and the panel-button DOM
   (aria-pressed), plus dispatches the active panel's render fn.
   Coalesced inside requestAnimationFrame so multiple writes per
   frame collapse to a single sync. */

const VIEW_STORAGE_KEY = "socrates-sidebar-filter-view";

/* Single source-of-truth snapshot. Refreshed by applySidebarFilter()
   before each DOM sync; external consumers should treat it as
   read-only. */
export const sidebarFilterState = {
  project: null,
  chip:    null,
  view:    "recents",
  search:  "",
};

/* ──────────── read / write helpers ──────────── */

function readChipFilter() {
  try {
    const k = window.RECENTS_FILTER_KEY;
    if (typeof k === "string") {
      const v = localStorage.getItem(k);
      return v || null;
    }
  } catch (_) {}
  return null;
}

function writeChipFilter(v) {
  /* Goes through the existing bridge so all chips (project + chip)
     funnel through one writer — no risk of overlapping writes
     racing each other in the same frame. */
  try {
    if (typeof window.setRecentsFilter === "function") {
      window.setRecentsFilter(v || null);
      return;
    }
  } catch (_) {}
  /* Defensive fallback if bridge isn't loaded yet (older boot
     order). Write directly under the localStorage key — the
     existing renderRecents() reads from there too. */
  try {
    const k = window.RECENTS_FILTER_KEY;
    if (typeof k === "string") {
      if (v) localStorage.setItem(k, v);
      else   localStorage.removeItem(k);
    }
  } catch (_) {}
}

function readSearchQuery() {
  /* main.js keeps RECENTS_SEARCH_QUERY as a module-level var; it
     isn't bridged because it's not used in any inline onclick. We
     mirror the latest input value here as a best-effort. If the
     bridge ever gets added, prefer it. */
  try {
    const input = document.getElementById("sidebarSearch");
    if (input) return input.value || "";
  } catch (_) {}
  return "";
}

function readViewPersisted() {
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_KEY);
    if (raw) {
      const v = JSON.parse(raw);
      if (v && (v.view === "recents" || v.view === "knowledge" || v.view === "mistakes")) {
        return v.view;
      }
    }
  } catch (_) {}
  return "recents";
}

function writeViewPersisted() {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY,
      JSON.stringify({ view: sidebarFilterState.view }));
  } catch (_) {}
}

/* Pull the latest value from every underlying store into the
   snapshot. Cheap; called on every apply. */
export function refreshSidebarFilterState() {
  try {
    const p = (window.state && window.state.session &&
               window.state.session.activeProjectFilter) || null;
    sidebarFilterState.project = p || null;
  } catch (_) { sidebarFilterState.project = null; }

  sidebarFilterState.chip = readChipFilter();
  sidebarFilterState.search = readSearchQuery();
  /* view is owned by us; just persist again as a safety net (it
     should already match localStorage). */
  const persisted = readViewPersisted();
  if (persisted !== sidebarFilterState.view) {
    /* First call after boot — adopt the persisted view. */
    sidebarFilterState.view = persisted;
  }
}

/* ──────────── public setter ──────────── */

/* setFilter(patch): accept any subset of { chip, view, search }.
   Each field routes to its underlying setter; then applySidebarFilter()
   runs to:
     - sync the chip DOM (aria-pressed + .is-active)
     - sync the panel-button DOM (aria-pressed + .is-current)
     - dispatch the active panel's render fn (renderRecents is always
       dispatched because the chip DOM sits inside the recents panel) */
export function setFilter(patch) {
  if (!patch || typeof patch !== "object") return;
  let touch = false;

  if ("view" in patch) {
    const v = String(patch.view || "");
    if (v === "recents" || v === "knowledge" || v === "mistakes") {
      sidebarFilterState.view = v;
      writeViewPersisted();
      if (typeof window.switchTab === "function") {
        try { window.switchTab(v); } catch (_) {}
      }
      touch = true;
    }
  }

  if ("chip" in patch) {
    /* null / '' / 'all' all mean "clear the chip filter" — same
       semantics onRecentsFilterChipClick used to apply. */
    const raw = patch.chip;
    const next = (raw === null || raw === "" || raw === "all")
                  ? null : String(raw);
    writeChipFilter(next);
    touch = true;
  }

  if ("search" in patch) {
    const v = String(patch.search || "");
    if (typeof window.setRecentsSearch === "function") {
      try { window.setRecentsSearch(v); } catch (_) {}
    }
    touch = true;
  }

  if (touch) applySidebarFilter();
}

/* ──────────── DOM sync + render dispatch ──────────── */

let _renderScheduled = false;
let _raf = (typeof requestAnimationFrame === "function")
              ? requestAnimationFrame
              : function (cb) { return setTimeout(cb, 16); };

/* Single entry point. Coalesced so callers firing several patches
   in the same task get one DOM sync. */
export function applySidebarFilter() {
  if (_renderScheduled) return;
  _renderScheduled = true;
  _raf(function () {
    _renderScheduled = false;
    refreshSidebarFilterState();
    syncChipDOM();
    syncPanelButtons();
    renderActivePanel();
  });
}

/* Mark every `.chip[data-chip]` element as pressed (or not)
   based on the current chip filter. Stateless — re-runs on every
   apply so chip changes from any source (tag pill click on a
   session row, "clear filter" link in an empty state, our own
   setFilter call) end up in visual sync. */
function syncChipDOM() {
  const cur = sidebarFilterState.chip || null;
  const chips = document.querySelectorAll(".chip[data-chip]");
  if (!chips || !chips.length) return;
  chips.forEach(function (btn) {
    const v = btn.getAttribute("data-chip");
    const isAll = (v === "all" || v === null || v === "");
    const active = (!cur && isAll) || (cur && v === cur);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
    if (active) btn.classList.add("is-active");
    else        btn.classList.remove("is-active");
  });
}

/* Mirror the active view onto the sidebar's tab buttons. switchTab()
   already manages the .active / .hidden classes for both buttons
   and panels; we just add aria-pressed + .is-current so screen
   readers and CSS hooks can target them. */
function syncPanelButtons() {
  const view = sidebarFilterState.view;
  const map = {
    knowledge: "tabKnowledge",
    mistakes:  "tabMistakes",
  };
  Object.keys(map).forEach(function (k) {
    const btn = document.getElementById(map[k]);
    if (!btn) return;
    const isCurrent = view === k;
    btn.setAttribute("aria-pressed", isCurrent ? "true" : "false");
    if (isCurrent) btn.classList.add("is-current");
    else           btn.classList.remove("is-current");
  });
}

/* Dispatch renders. renderRecents() always runs (the chip DOM
   lives inside the recents panel). Knowledge and Mistakes only
   re-render when their panel is the current view — both are
   expensive enough that we don't want to redo them silently on
   every chip click. */
function renderActivePanel() {
  try {
    if (typeof window.renderRecents === "function") window.renderRecents();
  } catch (_) {}
  const view = sidebarFilterState.view;
  try {
    if (view === "knowledge" && typeof window.renderKnowledgeView === "function") {
      window.renderKnowledgeView();
    }
    if (view === "mistakes" && typeof window.renderMistakes === "function") {
      window.renderMistakes();
    }
  } catch (_) {}
}

/* ──────────── boot ──────────── */

let _booted = false;

/* Runs once after the sidebar DOM is laid out. Restores the
   persisted view via switchTab() and triggers the first sync. */
export function bootSidebarFilter() {
  if (_booted) return;
  _booted = true;
  /* Adopt the persisted view BEFORE calling switchTab — that way
     the panel visibility matches what we'll render next. */
  sidebarFilterState.view = readViewPersisted();
  if (typeof window.switchTab === "function" &&
      sidebarFilterState.view !== "recents") {
    try { window.switchTab(sidebarFilterState.view); } catch (_) {}
  }
  applySidebarFilter();
}

/* ──────────── inline-handler friendly wrapper ──────────── */

/* Thin wrapper exposed on window. Mirrors onRecentsFilterChipClick()
   in behaviour but routes through setFilter() so the unified
   apply loop runs. The new chip HTML in recentsFilterChips.js
   uses onclick="onSidebarChipClick('...')"; the legacy chip
   HTML still uses onclick="onRecentsFilterChipClick('...')"
   and both paths remain functional. */
export function onSidebarChipClick(val) {
  const cur = sidebarFilterState.chip || null;
  let next;
  if (val == null || val === "" || val === "all") {
    next = null;
  } else if (val === cur) {
    next = null; /* toggle off */
  } else {
    next = String(val);
  }
  setFilter({ chip: next });
}
