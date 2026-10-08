import type { Message, Session, ToolCall } from '@socrates/contracts';
import { create } from 'zustand';
import { applyEdit, rollbackAfter } from './edit.ts';

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
  beginTurn(sessionId: string, turnId: string, text: string, attachments?: Message['attachments'], assistantOnly?: boolean): boolean;
  updateTurn(turnId: string, update: (message: Message) => Message): void;
  /** Attach durable file ids to the turn's user message after upload. */
  setTurnAttachments(turnId: string, attachments: Message['attachments']): void;
  /** Rewind a session to a user turn (edit: rewrite + drop the tail;
   * regenerate: unchanged text, drop the tail). Returns the dropped
   * messages so the caller can queue explicit server deletes. */
  rewindSession(sessionId: string, anchorClientId: string, newText?: string): Message[] | null;
  finishTurn(turnId: string, error?: string | null): void;
  setStatus(status: ChatStatus, error?: string | null): void;
}

/* Universal keeps transcript-local ephemeral UI (for example mistake-book
 * redo cards) keyed by the active session id. A local→server adoption is the
 * one legitimate transition where the old id disappears at the same moment
 * activeSessionId changes. Destructive transitions (delete/project removal/
 * remote reconciliation) therefore retain the departing active row for one
 * navigation boundary, hidden from visibleSessions. That prevents consumers
 * from mistaking a destructive removal for id adoption. The marker is a
 * Symbol so it can never leak into persisted session JSON. */
const TRANSITION_RETIRED = Symbol('transition-retired-session');
type TransitionSession = Session & { [TRANSITION_RETIRED]?: true };
const TRANSITION_RETIRED_AT = '1970-01-01T00:00:00.000Z';

function stripTransitionRows(sessions: Session[]): Session[] {
  return sessions.filter((session) => !(session as TransitionSession)[TRANSITION_RETIRED]);
}

function retainDepartingActive(previous: Session[], oldActiveId: string | null, next: Session[], nextActiveId: string | null): Session[] {
  if (!oldActiveId || oldActiveId === nextActiveId || next.some((session) => session.id === oldActiveId)) return next;
  const departed = previous.find((session) => session.id === oldActiveId);
  if (!departed) return next;
  const transition: TransitionSession = {
    ...departed,
    archivedAt: departed.archivedAt || TRANSITION_RETIRED_AT,
    [TRANSITION_RETIRED]: true,
  };
  return [...next, transition];
}

const emptyState = { sessions: [] as Session[], activeSessionId: null, draft: '', status: 'idle' as ChatStatus, error: null, turnId: null, turnSessionId: null };
export const useChatStore = create<ChatState>((set, get) => ({
  ...emptyState,
  reset: () => set({ ...emptyState, sessions: [] }),
  setSessions: (sessions) => set({ sessions }),
  reconcileSessions: (rows) => set((state) => {
    const previous = stripTransitionRows(state.sessions);
    const existing = new Map(previous.map((s) => [s.id, s]));
    const remoteIds = new Set(rows.map((s) => s.id));
    const local = previous.filter((s) => !remoteIds.has(s.id) && (isLocalSessionId(s.id) || s.id === state.turnSessionId));
    const reconciled = sortSessions([...local, ...rows.map((row) => ({ ...existing.get(row.id), ...row, messages: existing.get(row.id)?.messages ?? [] }))]);
    const activeSessionId = reconciled.some((s) => s.id === state.activeSessionId) ? state.activeSessionId : reconciled[0]?.id ?? null;
    return { sessions: retainDepartingActive(previous, state.activeSessionId, reconciled, activeSessionId), activeSessionId };
  }),
  patchSession: (id, patch) => set((state) => ({ sessions: state.sessions.map((s) => s.id === id ? { ...s, ...patch } : s) })),
  adoptSessionId: (id, saved) => set((state) => ({
    // Save replies contain scalar metadata only, never replace local messages.
    // Deliberately do NOT retain the old id here: disappearance is the signal
    // that this is a real local→server adoption, not a destructive transition.
    sessions: stripTransitionRows(state.sessions).map((s) => s.id === id ? { ...s, ...saved, messages: s.messages } : s),
    activeSessionId: state.activeSessionId === id ? saved.id : state.activeSessionId,
    turnSessionId: state.turnSessionId === id ? saved.id : state.turnSessionId,
  })),
  removeProject: (id) => set((state) => {
    const previous = stripTransitionRows(state.sessions);
    const remaining = previous.filter((s) => s.projectId !== id);
    const activeSessionId = remaining.some((s) => s.id === state.activeSessionId) ? state.activeSessionId : remaining.find((s) => !s.archivedAt)?.id ?? null;
    return { sessions: retainDepartingActive(previous, state.activeSessionId, remaining, activeSessionId), activeSessionId };
  }),
  archiveSession: (id, projectFilter = null) => set((state) => {
    const previous = stripTransitionRows(state.sessions);
    const sessions = previous.map((s) => s.id === id ? { ...s, archivedAt: new Date().toISOString() } : s);
    const next = visibleSessions(sessions, projectFilter)[0];
    return { sessions, activeSessionId: state.activeSessionId === id ? next?.id ?? null : state.activeSessionId };
  }),
  unarchiveSession: (id, fallback) => set((state) => {
    // Restoring clears the flag on a known row; a server-fetched archived
    // row that was never in the store is inserted (messages lazy-load).
    const previous = stripTransitionRows(state.sessions);
    const known = previous.some((s) => s.id === id);
    const sessions = known
      ? previous.map((s) => s.id === id ? { ...s, archivedAt: null } : s)
      : fallback ? [...previous, { ...fallback, archivedAt: null }] : previous;
    return { sessions };
  }),
  deleteSession: (id, projectFilter = null) => set((state) => {
    // The server purge is immediate. Locally, if this was the active row, keep
    // one hidden transition copy so active-id observers can distinguish the
    // purge from adoptSessionId; the next explicit navigation/reconcile drops it.
    const previous = stripTransitionRows(state.sessions);
    const remaining = previous.filter((s) => s.id !== id);
    const next = visibleSessions(remaining, projectFilter)[0];
    const activeSessionId = state.activeSessionId === id ? next?.id ?? null : state.activeSessionId;
    return { sessions: retainDepartingActive(previous, state.activeSessionId, remaining, activeSessionId), activeSessionId };
  }),
  selectProject: (id) => {
    const state = get();
    const sessions = stripTransitionRows(state.sessions);
    const list = visibleSessions(sessions, id);
    const selected = list.some((s) => s.id === state.activeSessionId) ? state.activeSessionId : list[0]?.id ?? null;
    set({ sessions, activeSessionId: selected });
    return selected;
  },
  selectSession: (activeSessionId) => set((state) => ({ sessions: stripTransitionRows(state.sessions), activeSessionId })),
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
  beginTurn: (sessionId, turnId, text, attachments, assistantOnly = false) => {
    if (get().turnId || !get().sessions.some((s) => s.id === sessionId)) return false;
    set((state) => ({
      turnId, turnSessionId: sessionId, status: 'sending', error: null, draft: assistantOnly ? state.draft : '',
      sessions: updateSession(state, sessionId, (s) => ({ ...s, messages: [
        ...s.messages || [],
        ...(assistantOnly ? [] : [{ clientId: `${turnId}-user`, role: 'user' as const, rawText: text, ...(attachments?.length ? { attachments } : {}) }]),
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
  rewindSession: (sessionId, anchorClientId, newText) => {
    const session = get().sessions.find((s) => s.id === sessionId);
    if (!session) return null;
    const messages = session.messages || [];
    const rolled = newText === undefined
      ? rollbackAfter(messages, anchorClientId)
      : applyEdit(messages, anchorClientId, newText);
    if (!rolled) return null;
    set((state) => ({ sessions: updateSession(state, sessionId, (s) => ({ ...s, messages: rolled.kept })) }));
    return rolled.dropped;
  },
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
export { applyEdit, applyRegenerate, buildBranchSession, findRegenerateTarget, rollbackAfter, type Rollback } from './edit.ts';
export { createMessageOutbox, OUTBOX_MAX_OPS, OUTBOX_STORAGE_KEY, type MessageOutbox, type OutboxDeps, type OutboxOp, type OutboxOpType } from './outbox.ts';
export { STREAM_MAX_ATTEMPTS, STREAM_RETRYABLE_STATUS, isRetryableStatus, offlineGuard, shouldRetryInterruptedStream, type StreamRetryDecision } from './retry.ts';
