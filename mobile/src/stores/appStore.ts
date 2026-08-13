import type { Attachment, Message, Session, User } from '@socrates/contracts';
import { createDraftSession, messageText } from '@socrates/core';
import { useSyncExternalStore } from 'react';
import { ApiError, authApi } from '../data/api/client';
import { readCachedUser } from '../data/api/tokenStore';
import { startChatStream } from '../data/sse/sseClient';
import { enqueue, incrementOutboxRetry, readDraft, readOutbox, removeOutbox, saveDraft } from '../data/offline/sqlite';
import { sessionRepository } from '../data/repositories/sessionRepository';
import { reduceToolEvent, settleToolCalls, type ToolEventKind } from '../data/tools/toolState';
import { tSync } from '../i18n';
import { unregisterPushNotifications } from '../native/push';

export type AuthStatus = 'booting' | 'signedOut' | 'signedIn';

export interface AppState {
  authStatus: AuthStatus;
  user: User | null;
  sessions: Session[];
  activeSession: Session | null;
  draft: string;
  pendingAttachments: Attachment[];
  isLoading: boolean;
  isStreaming: boolean;
  isOnline: boolean;
  error: string | null;
}

const initialState: AppState = {
  authStatus: 'booting',
  user: null,
  sessions: [],
  activeSession: null,
  draft: '',
  pendingAttachments: [],
  isLoading: false,
  isStreaming: false,
  isOnline: true,
  error: null,
};

function id(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function uuid() {
  const hex = () => Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0');
  return `${hex()}-${hex().slice(0, 4)}-4${hex().slice(1, 4)}-8${hex().slice(1, 4)}-${hex()}${hex().slice(0, 4)}`;
}

function userMessage(text: string): Message {
  return { clientId: id('user'), role: 'user', rawText: text, content: text, type: 'user' };
}

class AppStore {
  private state = initialState;
  private listeners = new Set<() => void>();
  private stopStream: (() => void) | null = null;
  private streamFinished = false;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.state;

  private setState(patch: Partial<AppState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  async bootstrap() {
    const cachedUser = await readCachedUser();
    try {
      const user = await authApi.me();
      this.setState({ authStatus: 'signedIn', user, error: null });
    } catch (error) {
      const credentialFailure = error instanceof ApiError && (error.status === 401 || error.status === 403);
      if (!cachedUser || credentialFailure) {
        this.setState({ authStatus: 'signedOut', user: null, isLoading: false });
        return;
      }
      this.setState({
        authStatus: 'signedIn',
        user: cachedUser,
        isOnline: false,
        isLoading: false,
        error: tSync('chat.offlineBanner'),
      });
    }
    await Promise.allSettled([this.refreshSessions(), this.syncOutbox()]);
  }

  async login(email: string, password: string) {
    this.setState({ isLoading: true, error: null });
    try {
      const user = await authApi.login(email, password);
      this.setState({ authStatus: 'signedIn', user, isLoading: false });
      await Promise.allSettled([this.refreshSessions(), this.syncOutbox()]);
    } catch (error) {
      this.setState({ isLoading: false, error: error instanceof Error ? error.message : tSync('auth.cannotSignIn') });
      throw error;
    }
  }

  async loginWithUser(user: User) {
    this.setState({ authStatus: 'signedIn', user, isLoading: false, error: null });
    await Promise.allSettled([this.refreshSessions(), this.syncOutbox()]);
  }

  async logout() {
    this.stopStream?.();
    this.stopStream = null;
    this.streamFinished = true;
    try {
      await unregisterPushNotifications().catch(() => undefined);
      await authApi.logout();
    } finally {
      this.setState({ ...initialState, authStatus: 'signedOut' });
    }
  }

  async refreshSessions() {
    this.setState({ isLoading: true });
    try {
      const sessions = await sessionRepository.list();
      this.setState({ sessions, isLoading: false, error: null });
    } catch (error) {
      this.setState({
        isLoading: false,
        error: error instanceof Error ? error.message : tSync('library.refreshFailed'),
      });
      throw error;
    }
  }

  setOnline(isOnline: boolean) {
    this.setState({ isOnline });
    if (isOnline) void this.syncOutbox();
  }

  async syncOutbox() {
    if (!this.state.isOnline || this.state.authStatus !== 'signedIn' || this.state.isStreaming) return;
    for (const item of readOutbox()) {
      try {
        if (item.operation === 'upsert-session' || item.operation === 'create-session') {
          const payload = item.payload as unknown as Session;
          const messages = payload.messages || [];
          const saved = await sessionRepository.save(payload, messages);
          const synced = { ...payload, ...saved, messages };
          this.setState({
            activeSession: this.state.activeSession?.id === synced.id ? synced : this.state.activeSession,
            sessions: [saved, ...this.state.sessions.filter((session) => session.id !== saved.id)],
            error: null,
          });
          const last = messages.at(-1);
          if (last?.role === 'user') {
            await this.startAssistantStream(synced, messages);
          }
          removeOutbox(item.id);
          if (this.state.isStreaming) break;
        } else {
          removeOutbox(item.id);
        }
      } catch {
        incrementOutboxRetry(item.id);
        break;
      }
    }
  }

  async openSession(sessionId: string) {
    this.setState({ isLoading: true, error: null });
    const session = await sessionRepository.get(sessionId);
    this.setState({ activeSession: session, draft: session ? readDraft(session.id) : '', pendingAttachments: [], isLoading: false });
  }

  async resumeForeground() {
    const sessionId = this.state.activeSession?.id;
    const tasks: Promise<unknown>[] = [this.refreshSessions(), this.syncOutbox()];
    if (sessionId) tasks.push(sessionRepository.get(sessionId).then((session) => {
      if (session) this.setState({ activeSession: session });
    }));
    await Promise.allSettled(tasks);
  }

  startNewSession(mode: 'chat' | 'tutor' = 'chat', preserveComposer = false, projectId?: string | null) {
    this.stopStream?.();
    this.stopStream = null;
    this.streamFinished = true;
    const session = createDraftSession(uuid(), mode);
    this.setState({
      activeSession: projectId ? { ...session, projectId } : session,
      draft: preserveComposer ? this.state.draft : '',
      pendingAttachments: preserveComposer ? this.state.pendingAttachments : [],
      error: null,
      isStreaming: false,
    });
  }

  setDraft(draft: string) {
    const sessionId = this.state.activeSession?.id;
    if (sessionId) saveDraft(sessionId, draft);
    this.setState({ draft });
  }

  setError(error: string | null) {
    this.setState({ error });
  }

  addAttachment(attachment: Attachment) {
    this.setState({ pendingAttachments: [...this.state.pendingAttachments, attachment], error: null });
  }

  removeAttachment(attachmentId: string) {
    this.setState({
      pendingAttachments: this.state.pendingAttachments.filter((attachment) => attachment.id !== attachmentId),
    });
  }

  stopGenerating() {
    this.stopStream?.();
    this.stopStream = null;
    this.streamFinished = true;
    this.setState({ isStreaming: false });
  }

  async sendMessage(rawText: string) {
    const text = rawText.trim();
    if (!text || this.state.isStreaming) return;
    let session = this.state.activeSession;
    if (!session) {
      this.startNewSession('chat');
      session = this.state.activeSession;
    }
    if (!session) return;

    const attachments = this.state.pendingAttachments;
    const nextMessages = [...(session.messages || []), { ...userMessage(text), attachments: attachments.length ? attachments : undefined }];
    session = {
      ...session,
      topic: session.topic || text.slice(0, 100),
      title: session.title || text.slice(0, 54),
      messages: nextMessages,
      updatedAt: new Date().toISOString(),
    };
    this.setState({ activeSession: session, draft: '', pendingAttachments: [], error: null });

    if (!this.state.isOnline) {
      this.enqueueSession(session, nextMessages.at(-1)?.clientId || id('client'));
      this.setState({ error: tSync('chat.queued') });
      return;
    }

    try {
      const saved = await sessionRepository.save(session, nextMessages);
      session = { ...session, ...saved, messages: nextMessages };
      this.setState({ activeSession: session });
      await this.startAssistantStream(session, nextMessages);
    } catch (error) {
      this.enqueueSession(session, nextMessages.at(-1)?.clientId || id('client'));
      this.setState({ isOnline: false, error: error instanceof Error ? error.message : tSync('chat.offline') });
    }
  }

  private enqueueSession(session: Session, clientId: string) {
    enqueue({
      id: id('outbox'),
      sessionId: session.id,
      clientId,
      operation: 'upsert-session',
      payload: session as never,
      retryCount: 0,
      createdAt: new Date().toISOString(),
    });
  }

  private async startAssistantStream(session: Session, nextMessages: Message[]) {
    if (this.state.isStreaming) return;
    const assistant: Message = { clientId: id('assistant'), role: 'assistant', rawText: '', content: '', type: 'streaming' };
    this.streamFinished = false;
    const streamingSession = { ...session, messages: [...nextMessages, assistant] };
    this.setState({ activeSession: streamingSession, isStreaming: true, error: null });
    this.stopStream = await startChatStream(session.id, {
      messages: nextMessages.map((message) => ({ role: message.role, content: messageText(message) })),
      mode: session.mode,
    }, {
      onDelta: (delta) => this.appendAssistant(delta),
      onReasoning: (reasoning) => this.appendReasoning(reasoning),
      onToolUse: (payload) => this.addToolEvent('tool_use', payload),
      onToolResult: (payload) => this.addToolEvent('tool_result', payload),
      onToolProgress: (payload) => this.addToolEvent('tool_progress', payload),
      onToolCallDelta: (payload) => this.addToolEvent('tool_call_delta', payload),
      onExecutionStart: (payload) => this.addToolEvent('execution_start', payload),
      onError: (message) => this.finishStream(message),
      onDone: () => this.finishStream(),
    });
  }

  /**
   * Replaces the trailing assistant message with a new object. Mutating it in
   * place kept its identity, so `React.memo` and FlatList row bailouts could
   * skip streaming updates entirely.
   */
  private patchAssistant(patch: (assistant: Message) => Partial<Message>) {
    const session = this.state.activeSession;
    const messages = session?.messages;
    const assistant = messages?.at(-1);
    if (!session || !messages || !assistant || assistant.role !== 'assistant') return;
    const next = messages.slice(0, -1);
    next.push({ ...assistant, ...patch(assistant) });
    this.setState({ activeSession: { ...session, messages: next } });
  }

  private appendAssistant(delta: string) {
    this.patchAssistant((assistant) => {
      const rawText = `${assistant.rawText || ''}${delta}`;
      return { rawText, content: rawText };
    });
  }

  private appendReasoning(reasoning: string) {
    this.patchAssistant((assistant) => ({
      reasoningContent: `${assistant.reasoningContent || ''}${reasoning}`,
    }));
  }

  private addToolEvent(kind: ToolEventKind, payload: unknown) {
    this.patchAssistant((assistant) => ({
      // Fold the frame onto the card for its tool-call id rather than pushing a
      // synthetic row per SSE event.
      toolCalls: reduceToolEvent(assistant.toolCalls, kind, payload),
    }));
  }

  private async finishStream(error?: string) {
    if (this.streamFinished) return;
    this.streamFinished = true;
    const session = this.state.activeSession;
    this.stopStream = null;
    if (!session) return;
    const messages = (session.messages || []).map((message) => {
      if (message.type !== 'streaming') return message;
      const settled = { ...message, type: 'assistant' } as Message;
      // A tool still marked running when the stream ends never reported back.
      if (message.toolCalls?.length) settled.toolCalls = settleToolCalls(message.toolCalls);
      return settled;
    });
    const finalSession = { ...session, messages, updatedAt: new Date().toISOString() };
    this.setState({ activeSession: finalSession, isStreaming: false, error: error || null });
    if (!error) {
      try {
        const saved = await sessionRepository.save(finalSession, messages);
        this.setState({ activeSession: { ...finalSession, ...saved }, sessions: [saved, ...this.state.sessions.filter((item) => item.id !== saved.id)] });
      } catch (saveError) {
        this.enqueueSession(finalSession, id('save'));
        this.setState({ error: saveError instanceof Error ? saveError.message : tSync('chat.queuedResponse') });
      }
    }
  }
}

export const appStore = new AppStore();
export function useAppStore() {
  return useSyncExternalStore(appStore.subscribe, appStore.getSnapshot, appStore.getSnapshot);
}
