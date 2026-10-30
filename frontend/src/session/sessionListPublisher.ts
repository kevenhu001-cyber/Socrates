import { stateStore } from '../state/store.ts';
import { getRecents } from './recents.ts';
import type { SessionRow } from './store.ts';
import { getRecentsFilter } from '../sidebar/sidebar.service.ts';
import { filterRecentsByChip } from '../ui/recentsHelpers.ts';
import type { SessionItem } from '../ui/sessionListState.ts';
import { sameSessionRow, sessionRowFields } from './sessionRowModel.ts';
import { reportSwallow as reportEmptyCatch } from '../util/reportSwallow.ts';
import { getSessionListSearchQuery, publishSessionListState } from '../ui/sessionListState.ts';

export { sameSessionRow, sessionRowFields };

/* Hot-path session-list publisher.
 * Keep this module deliberately narrow: recents rendering needs a small
 * state publisher during normal app startup, but it does not need tag
 * editing, drag/drop project moves, or other organize interactions. */
let previousRows: SessionItem[] = [];
const rowCache: Record<string, SessionItem> = Object.create(null);

export function stableSessionRow(s: SessionRow): SessionItem {
  const next = sessionRowFields(s);
  const prev = rowCache[next.id];
  if (sameSessionRow(prev, next)) return prev;
  rowCache[next.id] = next;
  return next;
}

export function publishSessionList(): void {
  try {
    const allSessions = getRecents();
    const filter = getRecentsFilter();
    let sessions = filterRecentsByChip(allSessions, filter) as SessionRow[];
    const searchQ = getSessionListSearchQuery().trim().toLowerCase();
    if (searchQ) {
      sessions = sessions.filter(function (s) {
        const hay = (((s.title as string) || '') + ' ' + ((s.topic as string) || '')).toLowerCase();
        return hay.indexOf(searchQ) !== -1;
      });
    }

    const live: Record<string, boolean> = Object.create(null);
    for (let i = 0; i < allSessions.length; i++) {
      if (allSessions[i] && allSessions[i].id) live[allSessions[i].id] = true;
    }
    for (const key of Object.keys(rowCache)) {
      if (!live[key]) delete rowCache[key];
    }

    const nextRows = sessions.map(stableSessionRow);
    if (previousRows.length !== nextRows.length || nextRows.some((row, index) => row !== previousRows[index])) previousRows = nextRows;
    publishSessionListState({
      sessions: previousRows,
      currentSessionId: stateStore.read('currentSessionId') as string | null,
      searchQuery: searchQ,
      filter,
      fetchFailed: !!window.SERVER_SESSIONS_FETCH_FAILED,
    });
  } catch (error) {
    reportEmptyCatch(error, 'empty catch: session/sessionListPublisher.ts:63', 'expected');
    /* State publication is best-effort during boot/teardown. */
  }
}
