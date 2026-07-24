/**
 * Shared contracts for the session-list (recents) React migration boundary.
 *
 * The legacy `main.js` owns the session data via `SERVER_SESSIONS` and
 * `doRenderRecents()`. In React mode, the legacy renderer publishes the
 * session list data through this bridge so the React component can render
 * the session items declaratively.
 */

export interface SessionItem {
  id: string;
  title: string;
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
}

export interface SessionListSnapshot {
  sessions: ReadonlyArray<SessionItem>;
  currentSessionId: string | null;
  searchQuery: string;
  filter: string | null;
  fetchFailed: boolean;
  revision: number;
}

export interface SessionListBridge {
  getSnapshot: () => SessionListSnapshot;
  publish: (snapshot: Omit<SessionListSnapshot, 'revision'>) => void;
  subscribe: (listener: () => void) => () => void;
}

declare global {
  interface Window {
    __socratesSessionListBridge?: SessionListBridge;
    getRecents?: () => ReadonlyArray<{ id: string; title?: string; topic?: string; updated_at?: number; updatedAt?: number; created_at?: number; createdAt?: number; total_q?: number; totalQ?: number; mode?: string; phase?: string; kind?: string; pinned?: boolean; tags?: string[]; archivedAt?: number | null }>;
    getRecentsFilter?: () => string | null;
    getSessionLabel?: (id: string) => string;
    setRecentsFilter?: (val: string | null) => void;
    setRecentsSearch?: (q: string) => void;
    openTagEditor?: (id: string, e: MouseEvent) => void;
    actuallyDeleteSession?: (id: string, e: MouseEvent) => void;
    onSessionDragStart?: (event: DragEvent, sessionId: string) => void;
    onSessionDragEnd?: (event: DragEvent) => void;
    loadSession?: (id: string) => void;
    SERVER_SESSIONS_FETCH_FAILED?: boolean;
    retryRecentsFetch?: () => void;
    __projectsCache?: ReadonlyArray<{ id: string; name: string }>;
    clearRecentsFilter?: () => void;
  }
}
