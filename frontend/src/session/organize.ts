/* session/organize.ts — extracted from main.js (B6 batch).
 * Session tags, context menu, drag-to-project, row diff/publish helpers.
 * Zero-behavior-change lift. Render surfaces resolve via window.*.
 */
import { stateStore } from '../state/store.ts';
import { serverCache } from './serverCache.ts';
import { findServerSessionIndex, getKnownTags, getRecents, flushRecentsReconcile } from './recents.ts';
import type { SessionRow } from './store.ts';
import { getRecentsFilter } from '../sidebar/sidebar.service.ts';
import { filterRecentsByChip } from '../ui/recentsHelpers.ts';
import { getCachedProjects } from '../projects/projectCache.ts';
import { apiFetch } from '../util/api.ts';
import { showToast } from '../ui/toast.js';
import { renderTagEditor } from '../react/session-tags/tagEditorHost.tsx';
import type { TagEditorLabels, TagEditorPopoverProps } from '../react/session-tags/TagEditorPopover.tsx';
import type { SessionItem } from '../react/session-list/types.ts';
import { sameSessionRow as _sameRow, sessionRowFields as _sessionRowFields } from './sessionRowModel.ts';

export { _sameRow, _sessionRowFields };

/** Window surfaces this module reads or writes. */
interface OrganizeWindow extends Window {
  renderRecents?: () => void;
  RECENTS_SEARCH_QUERY?: string;
  __activeProject?: { id: string; name: string } | null;
}

/** The subset of an event the tag popover consumes. */
interface TagEditorEvent {
  stopPropagation(): void;
  preventDefault(): void;
  currentTarget?: Element | null;
}

interface TagBoundBody extends HTMLElement {
  _tagEditorClickBound?: boolean;
}

function _t(key: string, fallback?: string): string {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') {
      const v = window.t(key);
      if (v && v !== key) return v;
    }
  } catch {
    /* empty-catch: intentional — translation is best-effort */
  }
  return fallback != null ? fallback : key;
}
function _renderRecents(): void {
  try {
    const win = window as OrganizeWindow;
    if (typeof win.renderRecents === 'function') win.renderRecents();
  } catch {
    /* empty-catch: intentional — rendering is best-effort */
  }
}

function tagEditorLabels(): TagEditorLabels {
  return {
    title: _t('tag.title', 'Tags for this session'),
    empty: _t('tag.empty', 'No tags yet'),
    placeholder: _t('tag.placeholder', 'Add a tag and press Enter'),
    add: _t('tag.add', 'Add'),
    suggested: _t('tag.suggested', 'Suggested'),
    done: _t('tag.done', 'Done'),
    remove: _t('tag.remove', 'Remove'),
  };
}

function ensureTagPopover(): HTMLElement {
  let pop = document.getElementById('tagEditorPopover');
  if (!pop) {
    pop = document.createElement('div');
    pop.id = 'tagEditorPopover';
    pop.className = 'tag-editor-popover';
    document.body.appendChild(pop);
  }
  return pop;
}

/* Anchor to the row that opened the popover; the shell is a singleton, so
   position is recomputed on every open. React hands us the native event,
   whose `currentTarget` is the root container rather than the tag button,
   so fall back to the row attribute. */
function positionTagPopover(pop: HTMLElement, id: string, e?: TagEditorEvent | null): void {
  const fromEvent = e && e.currentTarget ? e.currentTarget.closest('.recent-item') : null;
  const row = fromEvent || document.querySelector('.recent-item[data-recent-actual="' + CSS.escape(id) + '"]');
  if (row) {
    const r = row.getBoundingClientRect();
    pop.style.transform = '';
    pop.style.top = Math.min(window.innerHeight - 300, r.bottom + 6) + 'px';
    pop.style.left = Math.max(8, Math.min(window.innerWidth - 340, r.right - 340)) + 'px';
  } else {
    pop.style.top = '20vh';
    pop.style.left = '50%';
    pop.style.transform = 'translateX(-50%)';
  }
}

function tagEditorProps(id: string): TagEditorPopoverProps {
  const idx = findServerSessionIndex(id);
  const session = idx >= 0 ? serverCache.sessions[idx] : null;
  return {
    tags: session && Array.isArray(session.tags) ? session.tags as string[] : [],
    knownTags: getKnownTags(),
    labels: tagEditorLabels(),
    onAdd: function (tag) { addTagToSession(id, tag); },
    onRemove: function (tag) { removeTagFromSession(id, tag); },
    onClose: closeTagEditor,
  };
}

/* Re-render an already-open popover from the cache after a tag mutation. */
function refreshTagEditor(id: string): void {
  const pop = document.getElementById('tagEditorPopover');
  if (!pop || !pop.classList.contains('visible') || pop.dataset.sessionId !== id) return;
  renderTagEditor(pop, tagEditorProps(id));
}

export function openTagEditor(id: string, e?: TagEditorEvent | null): void {
  if (e) { e.stopPropagation(); e.preventDefault(); }
  const idx = findServerSessionIndex(id);
  if (idx < 0) return;
  const pop = ensureTagPopover();
  pop.dataset.sessionId = id;
  positionTagPopover(pop, id, e);
  pop.classList.add('visible');
  renderTagEditor(pop, tagEditorProps(id));
  bindTagEditorDismiss();
}

/* Click-outside dismiss. Bound once, deferred so the click that opened the
   popover cannot immediately close it. */
function bindTagEditorDismiss(): void {
  setTimeout(function () {
    const body = document.body as TagBoundBody;
    if (body._tagEditorClickBound) return;
    body._tagEditorClickBound = true;
    document.addEventListener('click', function (ev) {
      const p = document.getElementById('tagEditorPopover');
      const target = ev.target as Element | null;
      if (p && p.classList.contains('visible') && target && !p.contains(target) && !target.closest('[data-tag-open]')) {
        closeTagEditor();
      }
    });
  }, 0);
}

export function closeTagEditor(): void {
  const pop = document.getElementById('tagEditorPopover');
  if (pop) pop.classList.remove('visible');
}
export function addTagToSession(id: string, tag: string | null): void {
  if (!tag) return;
  const idx = findServerSessionIndex(id);
  if (idx < 0) return;
  const s = serverCache.sessions[idx];
  const tags = Array.isArray(s.tags) ? (s.tags as string[]).slice() : [];
  s.tags = tags;
  if (tags.indexOf(tag) >= 0) return;
  if (tags.length >= 12) {
    showToast(_t('tags.maxTags'));
    return;
  }
  tags.push(tag);
  apiFetch('/api/sessions/' + encodeURIComponent(id) + '/tags', {
    method: 'PUT',
    body: { tags },
  }).catch(function (err) {
    const message = (err as { message?: string } | null)?.message;
    console.debug('[tags] server sync failed:', message);
  });
  _renderRecents();
  refreshTagEditor(id);
}
export function removeTagFromSession(id: string, tag: string | null): void {
  const idx = findServerSessionIndex(id);
  if (idx < 0) return;
  const s = serverCache.sessions[idx];
  s.tags = (Array.isArray(s.tags) ? s.tags as string[] : []).filter(function (t) { return t !== tag; });
  apiFetch('/api/sessions/' + encodeURIComponent(id) + '/tags', {
    method: 'PUT',
    body: { tags: s.tags },
  }).catch(function () {
    /* empty-catch: intentional — tags sync is best-effort */
  });
  _renderRecents();
  refreshTagEditor(id);
}
export function closeSessionContextMenu(): void {
  serverCache.ctxMenuSessionId = null;
  const sb = document.getElementById('sidebar');
  if (sb) sb.classList.remove('ctx-menu-block');
  const pop = document.getElementById('sessionContextMenu');
  if (pop) {
    pop.classList.remove('visible');
    setTimeout(function () {
      if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
    }, 200);
  }
}

/* Drag-and-drop session onto a project. */
let _dragSessionId: string | null = null;
export function onSessionDragStart(event: DragEvent, sessionId: string): void {
  _dragSessionId = sessionId;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', sessionId);
  }
  /* Add a class to the dragged element. */
  const target = event.target as Element | null;
  if (target) target.classList.add('dragging');
}
export function onSessionDragEnd(event: DragEvent): void {
  const target = event.target as Element | null;
  if (target) target.classList.remove('dragging');
  _dragSessionId = null;
}
/* Drop handler for project rows. Legacy spaces-panel entry point —
   currently unreferenced (drag move goes through the React session list);
   kept with _ prefix so the intent is explicit and lint stays green. */
export function _onProjectDrop(event: DragEvent, projectId: string): void {
  event.preventDefault();
  event.stopPropagation();
  const sessionId = _dragSessionId || (event.dataTransfer ? event.dataTransfer.getData('text/plain') : '');
  if (!sessionId || !projectId) return;
  moveSessionToProject(sessionId, projectId);
}
/* Expose drag functions globally so inline ondragstart/ondragend work. */

/* Move a session to a project. */
export function moveSessionToProject(sessionId: string, projectId: string): void {
  const projects = getCachedProjects();
  const project = projects.filter(function (p) { return p.id === projectId; })[0];
  if (!project) return;
  /* Update the session on the server. */
  if (typeof apiFetch === 'function') {
    apiFetch('/api/sessions/' + encodeURIComponent(sessionId), { method: 'PATCH', body: { projectId: projectId } })
      .then(function () {
        /* Update local state. */
        if (stateStore.read('currentSessionId') === sessionId) {
          stateStore.dispatch({ type: 'state/set', key: 'currentProjectId', value: projectId });
          (window as OrganizeWindow).__activeProject = project;
        }
        closeSessionContextMenu();
        /* P_recents-amplify — a project move changes a row field the local
           patch never sees, so this one needs a real fetch. flush() runs it
           now instead of on the next window, and still coalesces with any
           save that asked for a reconcile in the meantime. */
        flushRecentsReconcile();
        if (typeof (window as OrganizeWindow).renderRecents === 'function') _renderRecents();
        if (typeof showToast === 'function') showToast(_t('toast.movedToProject').replace('{name}', project.name));
      })
      .catch(function () {
        if (typeof showToast === 'function') showToast(_t('toast.moveSessionFailed'));
      });
  }
}
/* Click-outside dismiss for context menu.
   When ctx-menu-block is active (synthetic click from long-press),
   clicks inside #sidebar are ignored — they passed through the
   pointer-events:none barrier and are not intentional. */
(function () {
  document.addEventListener('click', function (ev) {
    const pop = document.getElementById('sessionContextMenu');
    const target = ev.target as Element | null;
    if (!pop || !pop.classList.contains('visible')) return;
    if (target && pop.contains(target)) return;
    const sb = document.getElementById('sidebar');
    if (sb) {
      /* If the block class is active and the click is inside the
         sidebar, it's a synthetic click from long-press — ignore. */
      if (sb.classList.contains('ctx-menu-block') && target && sb.contains(target)) return;
    }
    closeSessionContextMenu();
  });
})();

/* P_render-throttle — coalesce rapid _renderRecents() calls into a
   single animation frame. Without this, saveCurrentSession (called
   3-5x per chat turn) triggers 3-5 full list rebuilds, causing
   visible stutter with 20+ sessions. */
/* React migration bridge — publishes the session list data so the React
   session list component can render declaratively. Works under `?react=1`;
   legacy mode never installs the bridge, so this is a cheap no-op. */
/* PERF: returns the PREVIOUS row object when every field is equal, so an
   unchanged row is referentially identical across publishes. Without this
   the mapper minted fresh objects each time and React.memo on SessionRow
   could never hit. */
const _rowCache: Record<string, SessionItem> = Object.create(null);
export function _stableSessionRow(s: SessionRow): SessionItem {
  const next = _sessionRowFields(s);
  const prev = _rowCache[next.id];
  if (_sameRow(prev, next)) return prev;
  _rowCache[next.id] = next;
  return next;
}
export function _publishSessionList(): void {
  try {
    const bridge = window.__socratesSessionListBridge;
    if (!bridge || typeof bridge.publish !== 'function') return;
    const allSessions = getRecents();
    let sessions = allSessions;
    const filter = getRecentsFilter();
    /* Apply the persistent tag filter, same as doRenderRecents. */
    sessions = filterRecentsByChip(sessions, filter) as SessionRow[];
    /* Apply search filter. */
    const searchQ = (((typeof window !== 'undefined' && (window as OrganizeWindow).RECENTS_SEARCH_QUERY) || '')).trim().toLowerCase();
    if (searchQ) {
      sessions = sessions.filter(function (s) {
        const hay = (((s.title as string) || '') + ' ' + ((s.topic as string) || '')).toLowerCase();
        return hay.indexOf(searchQ) !== -1;
      });
    }
    /* Drop cache entries for sessions that no longer exist, so deleting
       sessions in a long-lived tab cannot grow _rowCache without bound.
       Keyed off the UNFILTERED list — a row hidden by the current tag or
       search filter is still live and must keep its identity. */
    const _live: Record<string, boolean> = Object.create(null);
    for (let _i = 0; _i < allSessions.length; _i++) {
      if (allSessions[_i] && allSessions[_i].id) _live[allSessions[_i].id] = true;
    }
    const _keys = Object.keys(_rowCache);
    for (let _k = 0; _k < _keys.length; _k++) {
      if (!_live[_keys[_k]]) delete _rowCache[_keys[_k]];
    }
    bridge.publish({
      sessions: sessions.map(_stableSessionRow),
      currentSessionId: stateStore.read('currentSessionId') as string | null,
      searchQuery: searchQ,
      filter: filter,
      fetchFailed: !!window.SERVER_SESSIONS_FETCH_FAILED,
    });
  } catch {
    /* empty-catch: intentional — the React bridge is best-effort */
  }
}


export function cycleActiveProject(): void {
  const projects = getCachedProjects();
  if (!projects.length) return;
  const current = stateStore.read('currentProjectId');
  let idx = -1;
  if (current) idx = projects.findIndex(function (p) { return p.id === current; });
  const next = projects[(idx + 1) % projects.length];
  if (!next) return;
  /* Move current chat to the next project. */
  stateStore.dispatch({ type: 'state/set', key: 'currentProjectId', value: next.id });
  (window as OrganizeWindow).__activeProject = next;
  const sessionId = stateStore.read('currentSessionId') as string | null;
  if (sessionId) {
    /* The try/catch that used to wrap this call could never see a failure:
       apiFetch() is async, so a rejected PATCH escaped as an unhandled
       rejection. Attach the handler to the promise itself; the
       flushRecentsReconcile() below reconciles the list either way. */
    Promise.resolve()
      .then(function () { return apiFetch('/api/sessions/' + encodeURIComponent(sessionId), { method: 'PATCH', body: { projectId: next.id } }); })
      .catch(function (err) { console.warn('[projects] failed to move session to project:', (err as { message?: string } | null)?.message || err); });
  }
  flushRecentsReconcile();
  if (typeof (window as OrganizeWindow).renderRecents === 'function') _renderRecents();
  if (typeof showToast === 'function') showToast(_t('toast.projectSwitched').replace('{name}', next.name));
}
