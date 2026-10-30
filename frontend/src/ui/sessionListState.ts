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
