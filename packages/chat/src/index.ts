import type { Message, Session, ToolCall } from '@socrates/contracts';
import { create } from 'zustand';

export type ChatStatus = 'idle' | 'sending' | 'streaming' | 'error';
export interface ChatState {
  sessions: Session[];
  activeSessionId: string | null;
  draft: string;
  status: ChatStatus;
  error: string | null;
  turnId: string | null;
  turnSessionId: string | null;
  reset(): void;
  setSessions(sessions: Session[]): void;
  reconcileSessions(sessions: Session[]): void;
  patchSession(id: string, patch: Partial<Session>): void;
  adoptSessionId(id: string, saved: Session): void;
  removeProject(id: string): void;
  archiveSession(id: string, projectFilter?: string | null): void;
  unarchiveSession(id: string, fallback?: Session): void;
  deleteSession(id: string, projectFilter?: string | null): void;
  selectProject(id: string | null): string | null;
  selectSession(id: string | null): void;
  setDraft(draft: string): void;
  appendMessage(message: Message, sessionId?: string): void;
  appendDelta(text: string): void;
  applyToolCall(toolCall: ToolCall): void;
  beginTurn(sessionId: string, turnId: string, text: string, attachments?: Message['attachments']): boolean;
  updateTurn(turnId: string, update: (message: Message) => Message): void;
  /** Attach durable file ids to the turn's user message after upload. */
  setTurnAttachments(turnId: string, attachments: Message['attachments']): void;
  finishTurn(turnId: string, error?: string | null): void;
  setStatus(status: ChatStatus, error?: string | null): void;
}

const emptyState = { sessions: [] as Session[], activeSessionId: null, draft: '', status: 'idle' as ChatStatus, error: null, turnId: null, turnSessionId: null };
export const useChatStore = create<ChatState>((set, get) => ({
  ...emptyState,
  reset: () => set({ ...emptyState, sessions: [] }),
  setSessions: (sessions) => set({ sessions }),
  reconcileSessions: (rows) => set((state) => {
    const existing = new Map(state.sessions.map((s) => [s.id, s]));
    const remoteIds = new Set(rows.map((s) => s.id));
    const local = state.sessions.filter((s) => isLocalSessionId(s.id) || (s.id === state.turnSessionId && !remoteIds.has(s.id)));
    const sessions = sortSessions([...local, ...rows.map((row) => ({ ...existing.get(row.id), ...row, messages: existing.get(row.id)?.messages ?? [] }))]);
    return { sessions, activeSessionId: sessions.some((s) => s.id === state.activeSessionId) ? state.activeSessionId : sessions[0]?.id ?? null };
  }),
  patchSession: (id, patch) => set((state) => ({ sessions: state.sessions.map((s) => s.id === id ? { ...s, ...patch } : s) })),
  adoptSessionId: (id, saved) => set((state) => ({
    // Save replies contain scalar metadata only, never replace local messages.
    sessions: state.sessions.map((s) => s.id === id ? { ...s, ...saved, messages: s.messages } : s),
    activeSessionId: state.activeSessionId === id ? saved.id : state.activeSessionId,
    turnSessionId: state.turnSessionId === id ? saved.id : state.turnSessionId,
  })),
  removeProject: (id) => set((state) => {
    const sessions = state.sessions.filter((s) => s.projectId !== id);
    return { sessions, activeSessionId: sessions.some((s) => s.id === state.activeSessionId) ? state.activeSessionId : sessions.find((s) => !s.archivedAt)?.id ?? null };
  }),
  archiveSession: (id, projectFilter = null) => set((state) => {
    const sessions = state.sessions.map((s) => s.id === id ? { ...s, archivedAt: new Date().toISOString() } : s);
    const next = visibleSessions(sessions, projectFilter)[0];
    return { sessions, activeSessionId: state.activeSessionId === id ? next?.id ?? null : state.activeSessionId };
  }),
  unarchiveSession: (id, fallback) => set((state) => {
    // Restoring clears the flag on a known row; a server-fetched archived
    // row that was never in the store is inserted (messages lazy-load).
    const known = state.sessions.some((s) => s.id === id);
    const sessions = known
      ? state.sessions.map((s) => s.id === id ? { ...s, archivedAt: null } : s)
      : fallback ? [...state.sessions, { ...fallback, archivedAt: null }] : state.sessions;
    return { sessions };
  }),
  deleteSession: (id, projectFilter = null) => set((state) => {
    // Purge removes the row everywhere (mirrors DELETE /sessions/:id which
    // wipes messages/files/artifacts/runs); never leave a tombstone behind.
    const sessions = state.sessions.filter((s) => s.id !== id);
    const next = visibleSessions(sessions, projectFilter)[0];
    return { sessions, activeSessionId: state.activeSessionId === id ? next?.id ?? null : state.activeSessionId };
  }),
  selectProject: (id) => {
    const state = get();
    const list = visibleSessions(state.sessions, id);
    const selected = list.some((s) => s.id === state.activeSessionId) ? state.activeSessionId : list[0]?.id ?? null;
    set({ activeSessionId: selected });
    return selected;
  },
  selectSession: (activeSessionId) => set({ activeSessionId }),
  setDraft: (draft) => set({ draft }),
  appendMessage: (message, sessionId) => set((state) => ({ sessions: updateSession(state, sessionId ?? state.activeSessionId, (s) => ({ ...s, messages: [...s.messages || [], message] })) })),
  appendDelta: (text) => {
    const state = get();
    if (state.turnId) state.updateTurn(state.turnId, (m) => ({ ...m, rawText: `${m.rawText || ''}${text}` }));
  },
  applyToolCall: (tool) => {
    const state = get();
    if (state.turnId) state.updateTurn(state.turnId, (m) => ({ ...m, toolCalls: mergeToolCall(m.toolCalls || [], tool) }));
  },
  beginTurn: (sessionId, turnId, text, attachments) => {
    if (get().turnId || !get().sessions.some((s) => s.id === sessionId)) return false;
    set((state) => ({
      turnId, turnSessionId: sessionId, status: 'sending', error: null, draft: '',
      sessions: updateSession(state, sessionId, (s) => ({ ...s, messages: [
        ...s.messages || [],
        { clientId: `${turnId}-user`, role: 'user', rawText: text, ...(attachments?.length ? { attachments } : {}) },
        { clientId: turnId, role: 'assistant', rawText: '', reasoningContent: '' },
      ] })),
    }));
    return true;
  },
  updateTurn: (turnId, update) => set((state) => state.turnId !== turnId ? {} : ({
    sessions: updateSession(state, state.turnSessionId, (s) => ({ ...s, messages: s.messages?.map((m) => m.clientId === turnId ? update(m) : m) })),
  })),
  setTurnAttachments: (turnId, attachments) => set((state) => state.turnId !== turnId ? {} : ({
    sessions: updateSession(state, state.turnSessionId, (s) => ({ ...s, messages: s.messages?.map((m) => m.clientId === `${turnId}-user` ? { ...m, attachments } : m) })),
  })),
  finishTurn: (turnId, error = null) => set((state) => state.turnId === turnId ? { turnId: null, turnSessionId: null, status: error ? 'error' : 'idle', error } : {}),
  setStatus: (status, error = null) => set({ status, error }),
}));

function updateSession(state: Pick<ChatState, 'sessions'>, id: string | null, update: (session: Session) => Session) {
  return state.sessions.map((s) => s.id === id ? update(s) : s);
}
export function mergeToolCall(tools: ToolCall[], tool: ToolCall) {
  return tools.some((t) => t.id === tool.id) ? tools.map((t) => t.id === tool.id ? { ...t, ...tool } : t) : [...tools, tool];
}
export function isLocalSessionId(id: string) { return id === 'welcome' || id.startsWith('session-'); }
export function sortSessions(sessions: Session[]) {
  return [...sessions].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (Date.parse(b.updatedAt || '') || 0) - (Date.parse(a.updatedAt || '') || 0));
}
export function visibleSessions(sessions: Session[], projectId: string | null = null) {
  return sortSessions(sessions.filter((s) => !s.archivedAt && (!projectId || s.projectId === projectId)));
}
export const selectActiveSession = (state: ChatState) => state.sessions.find((s) => s.id === state.activeSessionId) || null;
export { runChatTurn } from './turn.ts';
