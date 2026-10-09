import type { MouseEvent as ReactMouseEvent, RefObject } from 'react';

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

export interface SessionListBridge {
  getSnapshot: () => SessionListSnapshot;
  publish: (snapshot: Omit<SessionListSnapshot, 'revision'>) => void;
  subscribe: (listener: () => void) => () => void;
}

export interface SessionProjectOption {
  id: string;
  name: string;
}

export interface SessionRowMenuProps {
  session: SessionItem;
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  projects: SessionProjectOption[] | null;
  saving: boolean;
  onClose: () => void;
  onBack: () => void;
  onChooseProject: (projectId: string) => void;
  onRename: (event: ReactMouseEvent) => void;
  onTag: (event: ReactMouseEvent) => void;
  onPin: () => void;
  onArchive: (event: ReactMouseEvent) => void;
  onDelete: (event: ReactMouseEvent) => void;
  onMoveToProject: () => void;
}

declare global {
  interface Window {
    __socratesSessionListBridge?: SessionListBridge;
    getRecents?: () => ReadonlyArray<{ id: string; title?: string; topic?: string; updated_at?: number; updatedAt?: number; created_at?: number; createdAt?: number; total_q?: number; totalQ?: number; mode?: string; phase?: string; kind?: string; pinned?: boolean; tags?: string[]; archivedAt?: number | null }>;
    getSessionLabel?: (id: string) => string;
    setRecentsSearch?: (q: string) => void;
    openTagEditor?: (id: string, e: MouseEvent) => void;
    actuallyDeleteSession?: (id: string, e: MouseEvent) => void;
    onSessionDragStart?: (event: DragEvent, sessionId: string) => void;
    onSessionDragEnd?: (event: DragEvent) => void;
    loadSession?: (id: string) => void;
    SERVER_SESSIONS_FETCH_FAILED?: boolean;
    retryRecentsFetch?: () => void;
  }
}
