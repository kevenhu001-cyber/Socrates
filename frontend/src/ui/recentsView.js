/* ui/recentsView.js — extracted from main.js (B6 batch).
 * Recents list rendering (rAF throttle + React bridge publish + filter chips).
 * Zero-behavior-change lift. Session list data comes from session modules;
 * the window.renderRecents bridge in main.js stays as the public entry.
 */
import { _publishSessionList } from '../session/organize.js';
import { renderRecentsFilterChips as renderRecentsFilterChipsUI } from './recentsFilterChips.js';
import { getRecentsFilter } from '../sidebar/index.js';
import { getKnownTags } from '../session/recents.js';
import { apiFetch } from '../util/api.js';

var _renderRecentsPending = false;

export function renderRecents() {
  if (_renderRecentsPending) return;
  _renderRecentsPending = true;
  requestAnimationFrame(function () {
    _renderRecentsPending = false;
    doRenderRecents();
  });
}

export function doRenderRecents() {
  var cont = document.getElementById('recentsList');
  if (!cont) return;
  /* React owns the session list. Publish the snapshot via the bridge
     so React re-renders from state. The legacy innerHTML rendering
     was reachable only when session-list was not migrated, which is
     no longer possible after the always-on React runtime landed. */
  _publishSessionList();
  renderRecentsFilterChips();
}

/* One-shot projects fetch guard (module-local): an empty project list or a
   failed /api/projects call marks the cache as populated so renderRecents
   never re-fetches on every render. */
var __projectsFetchFailed = false;

export function renderRecentsFilterChips() {
  /* Fetch projects for the filter chips if not cached. P_projects-once —
     a successful response (including an empty project list) marks the
     cache as populated so we never re-fetch. Previously an empty list
     (`{projects: []}` for users with no projects) kept the
     `!projects.length` guard true, so the success handler recursively
     called renderRecentsFilterChips() → fetched again → looped
     indefinitely, flooding /api/projects. */
  var projects = window.__projectsCache;
  var fetched = Array.isArray(projects) || __projectsFetchFailed;
  if (!fetched && typeof apiFetch === 'function') {
    apiFetch('/api/projects').then(function (r) {
      window.__projectsCache = (r && r.projects) || [];
      renderRecentsFilterChips();
    }).catch(function () {
      /* Mark failure so we don't retry on every renderRecents call.
         The user can refresh the page to retry. */
      __projectsFetchFailed = true;
    });
  }
  renderRecentsFilterChipsUI({
    currentFilter: getRecentsFilter(),
    tags: getKnownTags().slice(0, 8),
    projects: projects || []
  });
}

/* Unified sidebar search state. Read by doRenderRecents() as a
   client-side title/topic filter. The setter keeps the input box in
   sync (so the empty-state "Clear search" link can reset it) and
   re-renders. */
var RECENTS_SEARCH_QUERY = "";

export function setRecentsSearch(q) {
  RECENTS_SEARCH_QUERY = q || "";
  try { window.RECENTS_SEARCH_QUERY = RECENTS_SEARCH_QUERY; } catch (_) {}
  var input = document.getElementById("sidebarSearch");
  if (input && input.value !== RECENTS_SEARCH_QUERY) input.value = RECENTS_SEARCH_QUERY;
  renderRecents();
}

export function getRecentsSearchQuery() {
  return RECENTS_SEARCH_QUERY;
}
