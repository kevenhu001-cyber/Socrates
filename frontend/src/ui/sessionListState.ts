import { createImmutableBridge } from '../lib/bridge/createImmutableBridge.ts';

export interface SessionItem {
  id: string;
  title: string;
  projectId?: string | null;
  topic?: string;
  updatedAt: string | number | null;
  createdAt: string | number | null;
  totalQ?: number;
  mode?: string;
  phase?: string;
  kind?: string;
  pinned?: boolean;
  tags?: string[];
  label?: string;
  archivedAt?: number | null;
  branchedFrom?: { sessionId: string | null; messageId: string; reExplain?: boolean } | null;
}

export interface SessionListSnapshot {
  sessions: ReadonlyArray<SessionItem>;
  currentSessionId: string | null;
  searchQuery: string;
  filter: string | null;
  fetchFailed: boolean;
  revision: number;
}

type SessionListUpdate = Omit<SessionListSnapshot, 'revision'>;

/* The input can change several times before the frame-throttled publisher
   runs. Keep that pending value in the shared session-list module so the
   input and publisher use one source without a window mirror. */
let requestedSearchQuery = '';

export function getSessionListSearchQuery(): string {
  return requestedSearchQuery;
}

export function setSessionListSearchQuery(query: string): void {
  requestedSearchQuery = query || '';
  const current = sessionListState.getSnapshot();
  publishSessionListState({
    sessions: current.sessions,
    currentSessionId: current.currentSessionId,
    searchQuery: requestedSearchQuery,
    filter: current.filter,
    fetchFailed: current.fetchFailed,
  });
}

export const sessionListState = createImmutableBridge<SessionListSnapshot, SessionListUpdate>({
  initial: {
    sessions: Object.freeze([]),
    currentSessionId: null,
    searchQuery: '',
    filter: null,
    fetchFailed: false,
    revision: 0,
  },
  reducer: (_state, update) => ({
    ...update,
    sessions: update.sessions,
  }),
});

export function publishSessionListState(update: SessionListUpdate): void {
  const currentRows = sessionListState.getSnapshot().sessions;
  const sameRows = update.sessions.length === currentRows.length
    && update.sessions.every((row, index) => row === currentRows[index]);
  const sessions = sameRows ? currentRows : Object.freeze([...update.sessions]);
  sessionListState.dispatch({ ...update, sessions });
}

/** Optimistically highlight the selected row while the legacy load flow fetches it. */
export function setCurrentSessionId(id: string | null): void {
  const current = sessionListState.getSnapshot();
  if (current.currentSessionId === id) return;
  publishSessionListState({
    sessions: current.sessions,
    currentSessionId: id,
    searchQuery: current.searchQuery,
    filter: current.filter,
    fetchFailed: current.fetchFailed,
  });
}
