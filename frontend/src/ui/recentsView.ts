/* ui/recentsView.ts — extracted from main.js (B6 batch).
 * Recents list rendering (rAF throttle + module-state publish + filter chips).
 * Zero-behavior-change lift. Session list data comes from session modules;
 * the window.renderRecents bridge in main.js stays as the public entry.
 */
import { publishSessionList } from '../session/sessionListPublisher.ts';
import { hasCachedProjects, loadCachedProjects } from '../projects/projectCache.ts';
import { refreshRecentsFilterChipData } from '../sidebar/sidebar.service.ts';
import { apiFetch } from '../util/api.ts';
import { setSessionListSearchQuery } from './sessionListState.ts';


let _renderRecentsPending = false;

export function renderRecents() {
  if (_renderRecentsPending) return;
  _renderRecentsPending = true;
  requestAnimationFrame(function () {
    _renderRecentsPending = false;
    doRenderRecents();
  });
}

export function doRenderRecents() {
  const cont = document.getElementById('recentsList');
  if (!cont) return;
  /* React owns the session list. Publish the snapshot through shared state
     so React re-renders from the module store. The legacy innerHTML rendering
     was reachable only when session-list was not migrated, which is
     no longer possible after the always-on React runtime landed. */
  publishSessionList();
  refreshRecentsFilterData();
}

/* An empty project list and a failed request both settle the project lookup.
   React owns the chip markup; this module only keeps its source data current. */
let __projectsFetchState = 'idle';

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

/* Unified sidebar search state. The frame-throttled publisher applies it
   as a client-side title/topic filter. The setter keeps the input box in
   sync (so the empty-state "Clear search" link can reset it) and re-renders. */
export function setRecentsSearch(q: string) {
  const query = q || '';
  setSessionListSearchQuery(query);
  renderRecents();
}
