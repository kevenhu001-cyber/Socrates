import type { Message, Session, ToolCall } from '@socrates/contracts';
import { create } from 'zustand';

export type ChatStatus = 'idle' | 'sending' | 'streaming' | 'error';
export interface ChatState {
  sessions: Session[];
  activeSessionId: string | null;
  draft: string;
  status: ChatStatus;
  error: string | null;
  setSessions(sessions: Session[]): void;
  selectSession(id: string | null): void;
  setDraft(draft: string): void;
  appendMessage(message: Message): void;
  appendDelta(text: string): void;
  applyToolCall(toolCall: ToolCall): void;
  setStatus(status: ChatStatus, error?: string | null): void;
}

export const useChatStore = create<ChatState>((set) => ({
  sessions: [], activeSessionId: null, draft: '', status: 'idle', error: null,
  setSessions: (sessions) => set({ sessions }),
  selectSession: (activeSessionId) => set({ activeSessionId }),
  setDraft: (draft) => set({ draft }),
  appendMessage: (message) => set((state) => ({ sessions: updateActive(state, (session) => ({ ...session, messages: [...session.messages || [], message] })) })),
  appendDelta: (text) => set((state) => ({ sessions: updateActive(state, (session) => {
    const messages = [...session.messages || []];
    const last = messages[messages.length - 1];
    if (last?.role === 'assistant') messages[messages.length - 1] = { ...last, rawText: `${last.rawText || ''}${text}` };
    else messages.push({ clientId: `assistant-${Date.now()}`, role: 'assistant', rawText: text });
    return { ...session, messages };
  }) })),
  applyToolCall: (toolCall) => set((state) => ({ sessions: updateActive(state, (session) => {
    const messages = [...session.messages || []];
    const index = messages.length - 1;
    if (index >= 0) messages[index] = { ...messages[index], toolCalls: [...messages[index].toolCalls || [], toolCall] };
    return { ...session, messages };
  }) })),
  setStatus: (status, error = null) => set({ status, error }),
}));

function updateActive(state: Pick<ChatState, 'sessions' | 'activeSessionId'>, update: (session: Session) => Session) {
  return state.sessions.map((session) => session.id === state.activeSessionId ? update(session) : session);
}

export const selectActiveSession = (state: ChatState) => state.sessions.find((session) => session.id === state.activeSessionId) || null;
