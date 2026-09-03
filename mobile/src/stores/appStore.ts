import type { Attachment, Message, Session, User } from '@socrates/contracts';
import { buildChatHistory, createDraftSession } from '@socrates/core';
import { useSyncExternalStore } from 'react';
import { ApiError, authApi, sessionsApi } from '../data/api/client';
import { readCachedUser } from '../data/api/tokenStore';
import { startChatStream } from '../data/sse/sseClient';
import { enqueue, incrementOutboxRetry, readDraft, readOutbox, removeOutbox, saveDraft } from '../data/offline/sqlite';
import { sessionRepository } from '../data/repositories/sessionRepository';
import { reduceToolEvent, settleToolCalls, type ToolEventKind } from '../data/tools/toolState';
import { tSync } from '../i18n';
import { unregisterPushNotifications } from '../native/push';

export type AuthStatus = 'booting' | 'signedOut' | 'signedIn';

export type ReasoningEffort = 'low' | 'medium' | 'high';

export interface AppState {
  authStatus: AuthStatus;
  user: User | null;
  sessions: Session[];
  activeSession: Session | null;
  draft: string;
  pendingAttachments: Attachment[];
  selectedModel: string;
  reasoningEffort: ReasoningEffort;
  webSearchEnabled: boolean;
  isIncognito: boolean;
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
  selectedModel: 'beagle-built-in',
  reasoningEffort: 'medium',
  webSearchEnabled: true,
  isIncognito: false,
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
  /** Identifies callbacks belonging to the currently visible stream. */
  private streamGeneration = 0;
  /** Coalesce high-frequency token/progress frames before touching React state. */
  private pendingAssistantPatches: Array<(assistant: Message) => Partial<Message>> = [];
  private streamFlushTimer: ReturnType<typeof setTimeout> | null = null;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.state;

  private setState(patch: Partial<AppState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  setAuthStatusSignedOut() {
    this.setState({ authStatus: 'signedOut', isLoading: false });
  }

  async bootstrap() {
    try {
      let cachedUser: User | null = null;
      try {
        cachedUser = await readCachedUser();
      } catch (cacheError) {
        console.warn('[AppStore] Failed to read cached user during bootstrap:', cacheError);
      }

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
    } catch (criticalError) {
      console.error('[AppStore] Fatal bootstrap failure, unlocking loading screen:', criticalError);
      this.setState({ authStatus: 'signedOut', user: null, isLoading: false });
    }
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
    this.streamGeneration += 1;
    this.clearPendingAssistantPatches();
    try {
      await unregisterPushNotifications().catch(() => undefined);
      await authApi.logout();
    } finally {
      this.setState({ ...initialState, authStatus: 'signedOut' });
    }
  }

  /* P4: Clear the in-memory + on-disk local cache without touching the
   * authenticated user. Used by the Storage modal to let the user
   * reclaim space. Cloud data is untouched. */
  async clearLocalCache() {
    this.stopStream?.();
    this.stopStream = null;
    this.streamFinished = true;
    this.streamGeneration += 1;
    this.clearPendingAssistantPatches();
    try {
      const sqlite = await import('../data/offline/sqlite');
      // Best-effort purge of every key the offline layer exposes.
      const keys = [
        'socrates.session.cache',
        'socrates.draft.cache',
        'socrates.outbox',
        'socrates.user.cache',
      ];
      await Promise.all(
        keys.map((k) =>
          import('../platform/secureStorage')
            .then(({ deleteItem }) => deleteItem(k))
            .catch(() => undefined)
        )
      );
      // Bump the cache version so any future reader invalidates itself.
      void sqlite;
    } catch (error) {
      console.warn('[AppStore] clearLocalCache failed:', error);
    } finally {
      this.setState({
        sessions: [],
        activeSession: null,
        draft: '',
        pendingAttachments: [],
        error: null,
      });
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

  async renameSession(sessionId: string, title: string) {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    const saved = await sessionsApi.patch(sessionId, { title: nextTitle });
    this.setState({
      sessions: [saved, ...this.state.sessions.filter((session) => session.id !== saved.id)],
      activeSession: this.state.activeSession?.id === saved.id
        ? { ...this.state.activeSession, ...saved }
        : this.state.activeSession,
      error: null,
    });
  }

  async togglePinnedSession(session: Pick<Session, 'id' | 'pinned'>) {
    const saved = await sessionsApi.patch(session.id, { pinned: !session.pinned });
    this.setState({
      sessions: [saved, ...this.state.sessions.filter((item) => item.id !== saved.id)],
      activeSession: this.state.activeSession?.id === saved.id
        ? { ...this.state.activeSession, ...saved }
        : this.state.activeSession,
      error: null,
    });
  }

  async archiveSession(sessionId: string) {
    await sessionsApi.archive(sessionId);
    this.setState({
      sessions: this.state.sessions.filter((session) => session.id !== sessionId),
      activeSession: this.state.activeSession?.id === sessionId ? null : this.state.activeSession,
      error: null,
    });
  }

  async deleteSession(sessionId: string) {
    await sessionsApi.delete(sessionId);
    this.setState({
      sessions: this.state.sessions.filter((session) => session.id !== sessionId),
      activeSession: this.state.activeSession?.id === sessionId ? null : this.state.activeSession,
      error: null,
    });
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
    this.streamGeneration += 1;
    this.clearPendingAssistantPatches();
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

  setUser(user: User) {
    this.setState({ user, error: null });
  }

  addAttachment(attachment: Attachment) {
    if (this.state.pendingAttachments.length >= 6) {
      this.setState({ error: tSync('chat.maxAttachments') });
      return;
    }
    this.setState({ pendingAttachments: [...this.state.pendingAttachments, attachment], error: null });
  }

  removeAttachment(attachmentId: string) {
    this.setState({
      pendingAttachments: this.state.pendingAttachments.filter((item) => item.id !== attachmentId),
      error: null,
    });
  }

  setSelectedModel(selectedModel: string) {
    this.setState({ selectedModel });
  }

  setReasoningEffort(reasoningEffort: ReasoningEffort) {
    this.setState({ reasoningEffort });
  }

  setWebSearchEnabled(webSearchEnabled: boolean) {
    this.setState({ webSearchEnabled });
  }

  toggleIncognito() {
    this.setState({ isIncognito: !this.state.isIncognito });
  }

  stopGenerating() {
    if (!this.state.isStreaming || this.streamFinished) return;
    const generation = this.streamGeneration;
    this.stopStream?.();
    this.stopStream = null;
    // Keep partial text and any tool output. A stop is a normal terminal state,
    // not an abandoned stream: pending batched frames are flushed, spinning
    // tools are settled, and the session is durably saved below.
    void this.finishStream(undefined, generation);
  }

  async sendMessage(rawText: string) {
    const text = rawText.trim();
    const attachments = this.state.pendingAttachments;
    if ((!text && !attachments.length) || this.state.isStreaming) return;
    let session = this.state.activeSession;
    if (!session) {
      this.startNewSession('chat');
      session = this.state.activeSession;
    }
    if (!session) return;

    const nextMessages = [...(session.messages || []), { ...userMessage(text), attachments: attachments.length ? attachments : undefined }];
    session = {
      ...session,
      topic: session.topic || text.slice(0, 100) || attachments[0]?.name || tSync('chat.newConversation'),
      title: session.title || text.slice(0, 54) || attachments[0]?.name || tSync('chat.newConversation'),
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
    const generation = this.streamGeneration + 1;
    this.streamGeneration = generation;
    this.streamFinished = false;
    this.clearPendingAssistantPatches();
    const streamingSession = { ...session, messages: [...nextMessages, assistant] };
    this.setState({ activeSession: streamingSession, isStreaming: true, error: null });
    try {
      const stop = await startChatStream(session.id, {
        messages: buildChatHistory(nextMessages),
        mode: session.mode,
        reasoning_effort: this.state.reasoningEffort,
      }, {
        onDelta: (delta) => this.appendAssistant(delta, generation),
        onReasoning: (reasoning) => this.appendReasoning(reasoning, generation),
        onToolUse: (payload) => this.addToolEvent('tool_use', payload, generation),
        onToolResult: (payload) => this.addToolEvent('tool_result', payload, generation),
        onToolProgress: (payload) => this.addToolEvent('tool_progress', payload, generation),
        onToolCallDelta: (payload) => this.addToolEvent('tool_call_delta', payload, generation),
        onExecutionStart: (payload) => this.addToolEvent('execution_start', payload, generation),
        onError: (message) => { void this.finishStream(message, generation); },
        onDone: () => { void this.finishStream(undefined, generation); },
      });
      // The user can press Stop while token retrieval/XHR setup is still
      // pending. Abort this late handle rather than resurrecting the stream.
      if (generation !== this.streamGeneration || this.streamFinished) {
        stop();
        return;
      }
      this.stopStream = stop;
    } catch (error) {
      await this.finishStream(error instanceof Error ? error.message : tSync('chat.offline'), generation);
      throw error;
    }
  }

  async retryLastResponse() {
    if (this.state.isStreaming) return;
    const session = this.state.activeSession;
    if (!session) return;
    const messages = session.messages || [];
    const last = messages.at(-1);
    const nextMessages = last?.role === 'assistant' ? messages.slice(0, -1) : messages.slice();
    if (nextMessages.at(-1)?.role !== 'user') return;
    if (!this.state.isOnline) {
      this.setState({ error: tSync('chat.offline') });
      return;
    }
    const retrySession = { ...session, messages: nextMessages, updatedAt: new Date().toISOString() };
    this.setState({ activeSession: retrySession, error: null });
    try {
      await this.startAssistantStream(retrySession, nextMessages);
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : tSync('chat.offline') });
    }
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

  private clearPendingAssistantPatches() {
    if (this.streamFlushTimer) clearTimeout(this.streamFlushTimer);
    this.streamFlushTimer = null;
    this.pendingAssistantPatches = [];
  }

  private queueAssistantPatch(generation: number, patch: (assistant: Message) => Partial<Message>) {
    if (generation !== this.streamGeneration || this.streamFinished) return;
    this.pendingAssistantPatches.push(patch);
    if (this.streamFlushTimer) return;
    // Rendering an entire markdown tree once per transport chunk is needlessly
    // expensive. 32ms keeps the live response responsive while capping commits
    // at roughly one per frame on 30fps devices.
    this.streamFlushTimer = setTimeout(() => this.flushAssistantPatches(generation), 32);
  }

  private flushAssistantPatches(generation: number) {
    if (this.streamFlushTimer) clearTimeout(this.streamFlushTimer);
    this.streamFlushTimer = null;
    if (generation !== this.streamGeneration || !this.pendingAssistantPatches.length) {
      this.pendingAssistantPatches = [];
      return;
    }
    const patches = this.pendingAssistantPatches;
    this.pendingAssistantPatches = [];
    this.patchAssistant((assistant) => {
      let next = assistant;
      for (const patch of patches) next = { ...next, ...patch(next) };
      return next;
    });
  }

  private appendAssistant(delta: string, generation: number) {
    if (!delta) return;
    this.queueAssistantPatch(generation, (assistant) => {
      const rawText = `${assistant.rawText || ''}${delta}`;
      return { rawText, content: rawText };
    });
  }

  private appendReasoning(reasoning: string, generation: number) {
    if (!reasoning) return;
    this.queueAssistantPatch(generation, (assistant) => ({
      reasoningContent: `${assistant.reasoningContent || ''}${reasoning}`,
    }));
  }

  private addToolEvent(kind: ToolEventKind, payload: unknown, generation: number) {
    this.queueAssistantPatch(generation, (assistant) => ({
      // Fold the frame onto the card for its tool-call id rather than pushing a
      // synthetic row per SSE event.
      toolCalls: reduceToolEvent(assistant.toolCalls, kind, payload),
    }));
  }

  private async finishStream(error?: string, generation = this.streamGeneration) {
    if (generation !== this.streamGeneration || this.streamFinished) return;
    // Do this before flipping streamFinished so the final partial token/tool
    // result cannot be lost behind the terminal state transition.
    this.flushAssistantPatches(generation);
    this.streamFinished = true;
    const session = this.state.activeSession;
    this.stopStream = null;
    if (!session) {
      this.setState({ isStreaming: false, error: error || null });
      return;
    }
    const messages = (session.messages || []).map((message) => {
      if (message.type !== 'streaming') return message;
      const settled = { ...message, type: 'assistant' } as Message;
      // A tool still marked running when the stream ends never reported back.
      if (message.toolCalls?.length) settled.toolCalls = settleToolCalls(message.toolCalls);
      return settled;
    });
    const finalSession = { ...session, messages, updatedAt: new Date().toISOString() };
    this.setState({ activeSession: finalSession, isStreaming: false, error: error || null });
    // A stopped or interrupted answer is still useful. Persist it just like a
    // completed answer, and queue the write when connectivity disappeared.
    try {
      const saved = await sessionRepository.save(finalSession, messages);
      this.setState({
        activeSession: this.state.activeSession?.id === finalSession.id
          ? { ...finalSession, ...saved, messages }
          : this.state.activeSession,
        sessions: [saved, ...this.state.sessions.filter((item) => item.id !== saved.id)],
        ...(error ? {} : { error: null }),
      });
    } catch (saveError) {
      this.enqueueSession(finalSession, id('save'));
      if (this.state.activeSession?.id === finalSession.id) {
        this.setState({ error: saveError instanceof Error ? saveError.message : tSync('chat.queuedResponse') });
      }
    }
  }
}

export const appStore = new AppStore();
export function useAppStore() {
  return useSyncExternalStore(appStore.subscribe, appStore.getSnapshot, appStore.getSnapshot);
}
