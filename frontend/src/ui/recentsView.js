/* ui/recentsView.js — extracted from main.js (B6 batch).
 * Recents list rendering (rAF throttle + React bridge publish + filter chips).
 * Zero-behavior-change lift. Session list data comes from session modules;
 * the window.renderRecents bridge in main.js stays as the public entry.
 */
import { _publishSessionList } from '../session/organize.js';
import { hasCachedProjects, loadCachedProjects } from '../projects/projectCache.ts';
import { refreshRecentsFilterChipData } from '../react/sidebar/sidebar.bridge.ts';
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
  refreshRecentsFilterData();
}

/* An empty project list and a failed request both settle the project lookup.
   React owns the chip markup; this module only keeps its source data current. */
var __projectsFetchState = 'idle';

export function refreshRecentsFilterData() {
  if (!hasCachedProjects() && __projectsFetchState === 'idle') {
    __projectsFetchState = 'pending';
    loadCachedProjects(function () { return apiFetch('/api/projects'); }).then(function () {
      __projectsFetchState = 'ready';
      refreshRecentsFilterChipData();
    }).catch(function () {
      /* Keep failure settled; the user can refresh the page to retry. */
      __projectsFetchState = 'failed';
    });
  }
  refreshRecentsFilterChipData();
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
