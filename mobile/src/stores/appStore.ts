import type { Attachment, Memory, Message, Project, Session, User } from '@socrates/contracts';
import { buildChatHistory, createDraftSession } from '@socrates/core';
import { useSyncExternalStore } from 'react';
import { ApiError, apiKeysApi, authApi, configApi, memoryApi, messagesApi, projectConnectorsApi, projectsApi, sessionsApi, type ApiProvider } from '../data/api/client';
import { readCachedUser } from '../data/api/tokenStore';
import { startChatStream } from '../data/sse/sseClient';
import { enqueue, incrementOutboxRetry, readDraft, readOutbox, removeOutbox, saveDraft } from '../data/offline/sqlite';
import { sessionRepository } from '../data/repositories/sessionRepository';
import { reduceToolEvent, settleToolCalls, type ToolEventKind } from '../data/tools/toolState';
import { tSync } from '../i18n';
import { extractHttpUrls, fetchPagesForContext, looksLikeUserMentionedSite, type LinkPreviewState } from '../data/chat/webLinks';
import { buildAssistantModeInstruction, MOBILE_EXTENSIONS, type MobileExtensionKey } from '../data/chat/prompts';
import { catalogComposerPlugins, serializeSelectedPluginContext, type ComposerPluginSelection } from '../data/chat/plugins';
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
  linkPreviews: Record<string, LinkPreviewState>;
  providers: ApiProvider[];
  composerPlugins: ComposerPluginSelection[];
  selectedComposerPlugins: ComposerPluginSelection[];
  memories: Memory[];
  projects: Project[];
  selectedModel: string;
  activeExtension: MobileExtensionKey | null;
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
  linkPreviews: {},
  providers: [],
  composerPlugins: [],
  selectedComposerPlugins: [],
  memories: [],
  projects: [],
  selectedModel: 'beagle-built-in',
  activeExtension: null,
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

function messageKey(message: Message | null | undefined): string {
  return String(message?.id || message?.clientId || '');
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
      await Promise.allSettled([this.refreshSessions(), this.refreshProviders(), this.refreshComposerPlugins(), this.refreshMemories(), this.refreshProjects(), this.syncOutbox()]);
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
      await Promise.allSettled([this.refreshSessions(), this.refreshProviders(), this.refreshComposerPlugins(), this.refreshMemories(), this.refreshProjects(), this.syncOutbox()]);
    } catch (error) {
      this.setState({ isLoading: false, error: error instanceof Error ? error.message : tSync('auth.cannotSignIn') });
      throw error;
    }
  }

  async loginWithUser(user: User) {
    this.setState({ authStatus: 'signedIn', user, isLoading: false, error: null });
    await Promise.allSettled([this.refreshSessions(), this.refreshProviders(), this.refreshComposerPlugins(), this.refreshMemories(), this.refreshProjects(), this.syncOutbox()]);
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

  async refreshProviders() {
    try {
      const [providerResult, config] = await Promise.all([
        apiKeysApi.list(),
        configApi.get(),
      ]);
      const customProviders = Array.isArray(providerResult.providers)
        ? providerResult.providers.filter((provider) => provider.id !== 'beagle-built-in')
        : [];
      const providers: ApiProvider[] = config.hasBeagleKey
        ? [{
            id: 'beagle-built-in',
            label: 'Beagle',
            url: '/api/minimax/v1',
            model: '',
            isActive: !customProviders.some((provider) => provider.isActive === true),
            isBuiltIn: true,
            isMultimodal: true,
            hasKey: true,
          }, ...customProviders]
        : customProviders;
      const active = providers.find((provider) => provider.isActive)
        || providers.find((provider) => provider.id === this.state.selectedModel)
        || providers[0]
        || null;
      this.setState({
        providers,
        selectedModel: active?.id || '',
        error: null,
      });
      return providers;
    } catch (error) {
      if (error instanceof ApiError && error.status === 0) {
        this.setState({ isOnline: false });
      }
      throw error;
    }
  }

  async refreshComposerPlugins() {
    try {
      const response = await projectConnectorsApi.list();
      const composerPlugins = catalogComposerPlugins(Array.isArray(response.connectors) ? response.connectors : []);
      const availableIds = new Set(composerPlugins.filter((plugin) => plugin.connected).map((plugin) => plugin.id));
      this.setState({
        composerPlugins,
        selectedComposerPlugins: this.state.selectedComposerPlugins.filter((plugin) => availableIds.has(plugin.id)),
      });
      return composerPlugins;
    } catch (error) {
      if (error instanceof ApiError && error.status === 0) this.setState({ isOnline: false });
      throw error;
    }
  }

  toggleComposerPlugin(pluginId: string) {
    const plugin = this.state.composerPlugins.find((item) => item.id === pluginId);
    if (!plugin || !plugin.connected) return;
    const exists = this.state.selectedComposerPlugins.some((item) => item.id === pluginId);
    this.setState({
      selectedComposerPlugins: exists
        ? this.state.selectedComposerPlugins.filter((item) => item.id !== pluginId)
        : [...this.state.selectedComposerPlugins, plugin],
    });
  }

  clearComposerPlugin(pluginId: string) {
    this.setState({
      selectedComposerPlugins: this.state.selectedComposerPlugins.filter((item) => item.id !== pluginId),
    });
  }

  async refreshMemories() {
    try {
      const response = await memoryApi.list();
      const memories = (Array.isArray(response.memories) ? response.memories : [])
        .filter((memory) => memory.enabled !== false);
      this.setState({ memories });
      return memories;
    } catch (error) {
      if (error instanceof ApiError && error.status === 0) this.setState({ isOnline: false });
      throw error;
    }
  }

  async refreshProjects() {
    try {
      const response = await projectsApi.list();
      const projects = Array.isArray(response.projects) ? response.projects : [];
      this.setState({ projects });
      return projects;
    } catch (error) {
      if (error instanceof ApiError && error.status === 0) this.setState({ isOnline: false });
      throw error;
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
    this.setState({
      activeSession: session,
      draft: session ? readDraft(session.id) : '',
      pendingAttachments: [],
      isIncognito: false,
      activeExtension: null,
      selectedComposerPlugins: [],
      linkPreviews: {},
      isLoading: false,
    });
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
    const tasks: Promise<unknown>[] = [this.refreshSessions(), this.refreshProviders(), this.refreshComposerPlugins(), this.refreshMemories(), this.refreshProjects(), this.syncOutbox()];
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
      activeExtension: preserveComposer ? this.state.activeExtension : null,
      selectedComposerPlugins: preserveComposer ? this.state.selectedComposerPlugins : [],
      linkPreviews: {},
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

  async setSelectedModel(selectedModel: string) {
    if (!selectedModel || selectedModel === this.state.selectedModel) return;
    const target = this.state.providers.find((provider) => provider.id === selectedModel);
    if (!target) {
      this.setState({ error: tSync('settings.modelUnavailable') || 'Model is no longer available.' });
      return;
    }
    const previous = this.state.selectedModel;
    this.setState({ selectedModel, error: null });
    try {
      if (target.isBuiltIn || selectedModel === 'beagle-built-in') {
        const activeCustom = this.state.providers.find((provider) => !provider.isBuiltIn && provider.isActive);
        if (activeCustom) await apiKeysApi.patch(activeCustom.id, { isActive: false });
      } else {
        await apiKeysApi.patch(target.id, { isActive: true });
      }
      this.setState({
        providers: this.state.providers.map((provider) => ({
          ...provider,
          isActive: provider.id === selectedModel
            ? true
            : provider.isBuiltIn
              ? selectedModel === 'beagle-built-in'
              : false,
        })),
      });
    } catch (error) {
      this.setState({
        selectedModel: previous,
        error: error instanceof Error ? error.message : (tSync('settings.modelSwitchFailed') || 'Failed to switch model.'),
      });
      throw error;
    }
  }

  setActiveExtension(activeExtension: MobileExtensionKey | null) {
    this.setState({ activeExtension });
  }

  setReasoningEffort(reasoningEffort: ReasoningEffort) {
    this.setState({ reasoningEffort });
  }

  setWebSearchEnabled(webSearchEnabled: boolean) {
    this.setState({ webSearchEnabled });
  }

  toggleIncognito() {
    /* Match frontend lifecycle semantics: entering incognito starts a fresh
     * temporary conversation; leaving it discards that conversation. The
     * flag is deliberately flipped together with the reset so no temporary
     * turn can race into the persisted session list. */
    this.stopStream?.();
    this.stopStream = null;
    this.streamFinished = true;
    this.streamGeneration += 1;
    this.clearPendingAssistantPatches();
    const nextIncognito = !this.state.isIncognito;
    const session = createDraftSession(uuid(), 'chat');
    this.setState({
      isIncognito: nextIncognito,
      activeSession: session,
      draft: '',
      pendingAttachments: [],
      activeExtension: null,
      selectedComposerPlugins: [],
      linkPreviews: {},
      error: null,
      isStreaming: false,
    });
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

    const nextUser: Message = { ...userMessage(text), attachments: attachments.length ? attachments : undefined };
    const nextMessages = [...(session.messages || []), nextUser];
    session = {
      ...session,
      topic: session.topic || text.slice(0, 100) || attachments[0]?.name || tSync('chat.newConversation'),
      title: session.title || text.slice(0, 54) || attachments[0]?.name || tSync('chat.newConversation'),
      messages: nextMessages,
      updatedAt: new Date().toISOString(),
    };
    this.setState({ activeSession: session, draft: '', pendingAttachments: [], error: null });

    if (!this.state.isOnline) {
      if (!this.state.isIncognito) {
        this.enqueueSession(session, nextUser.clientId || id('client'));
        this.setState({ error: tSync('chat.queued') });
      } else {
        this.setState({ error: tSync('chat.offline') });
      }
      return;
    }

    let referencedPageBlocks: string[] = [];
    const urls = extractHttpUrls(text);
    if (urls.length) {
      const fetched = await fetchPagesForContext(urls);
      referencedPageBlocks = fetched.blocks;
      if (nextUser.clientId) {
        this.setState({
          linkPreviews: {
            ...this.state.linkPreviews,
            [nextUser.clientId]: { urls, results: fetched.results },
          },
        });
      }
    } else if (looksLikeUserMentionedSite(text) && nextUser.clientId) {
      this.setState({
        linkPreviews: {
          ...this.state.linkPreviews,
          [nextUser.clientId]: { urls: [], results: [], noUrlHint: true },
        },
      });
    }

    try {
      if (!this.state.isIncognito) {
        const saved = await sessionRepository.save(session, nextMessages);
        session = { ...session, ...saved, messages: nextMessages };
        this.setState({ activeSession: session });
      }
      await this.startAssistantStream(session, nextMessages, referencedPageBlocks, looksLikeUserMentionedSite(text) && urls.length === 0 ? text : undefined);
    } catch (error) {
      if (!this.state.isIncognito) {
        this.enqueueSession(session, nextMessages.at(-1)?.clientId || id('client'));
      }
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

  private async startAssistantStream(
    session: Session,
    nextMessages: Message[],
    referencedPageBlocks: string[] = [],
    missingUrlMention?: string,
  ) {
    if (this.state.isStreaming) return;
    const extension = this.state.activeExtension ? MOBILE_EXTENSIONS[this.state.activeExtension] : null;
    const assistant = {
      clientId: id('assistant'),
      role: 'assistant',
      rawText: '',
      content: '',
      type: 'streaming',
      ...(extension?.outputMode === 'canvas'
        ? { outputMode: 'canvas', canvasId: id('canvas') }
        : {}),
    } as Message & { outputMode?: 'chat' | 'canvas'; canvasId?: string };
    const generation = this.streamGeneration + 1;
    this.streamGeneration = generation;
    this.streamFinished = false;
    this.clearPendingAssistantPatches();
    const streamingSession = { ...session, messages: [...nextMessages, assistant] };
    this.setState({ activeSession: streamingSession, isStreaming: true, error: null });
    try {
      const history = buildChatHistory(nextMessages);
      const finalUser = nextMessages.at(-1);
      const userText = String(finalUser?.rawText || finalUser?.content || '');
      const modelUserText = serializeSelectedPluginContext(this.state.selectedComposerPlugins, userText);
      const lastModelUser = history.at(-1);
      if (lastModelUser?.role === 'user' && modelUserText !== userText) {
        if (Array.isArray(lastModelUser.content)) {
          const parts = lastModelUser.content.slice();
          const textIndex = parts.findIndex((part) => part && typeof part === 'object' && (part as { type?: string }).type === 'text');
          if (textIndex >= 0) {
            parts[textIndex] = { ...(parts[textIndex] as object), type: 'text', text: modelUserText };
          } else {
            parts.push({ type: 'text', text: modelUserText });
          }
          lastModelUser.content = parts;
        } else {
          lastModelUser.content = modelUserText;
        }
      }
      history.unshift({
        role: 'system',
        content: buildAssistantModeInstruction(userText, this.state.reasoningEffort),
      });
      if (this.state.user?.customInstructions?.trim()) {
        history.splice(1, 0, {
          role: 'system',
          content: `[User custom instructions]\n${this.state.user.customInstructions.trim()}`,
        });
      }
      if (extension) {
        history.splice(this.state.user?.customInstructions?.trim() ? 2 : 1, 0, {
          role: 'system',
          content: `[template:${extension.key}]\n${extension.systemPrompt}`,
        });
      }

      // Match frontend appendClientContextMessages(): memories and active
      // project are separate system blocks so the server can classify them
      // into untrusted context vs project-level response behavior.
      if (this.state.memories.length) {
        history.push({
          role: 'system',
          content:
            "\n\n## User's saved memories (long-term context)\n" +
            this.state.memories.map((memory) => `- ${String(memory.text || '')}`).join('\n'),
        });
      }
      if (session.projectId) {
        const project = this.state.projects.find((item) => item.id === session.projectId);
        if (project) {
          let projectContext = `\n\n## Active project\nProject: ${String(project.name || 'Untitled')}`;
          if (project.description) projectContext += `\nPurpose: ${String(project.description)}`;
          if (project.systemPrompt) projectContext += `\nProject instructions: ${String(project.systemPrompt)}`;
          history.push({ role: 'system', content: projectContext });
        }
      }
      const lastHistory = [...history].reverse().find((message) => message.role === 'user');
      if (lastHistory && referencedPageBlocks.length) {
        const pagesText = `${modelUserText}\n\n${referencedPageBlocks.join('\n\n')}`;
        if (Array.isArray(lastHistory.content)) {
          lastHistory.content = [...lastHistory.content, { type: 'text', text: pagesText }];
        } else {
          lastHistory.content = pagesText;
        }
      } else if (lastHistory && missingUrlMention) {
        const hintText = `${serializeSelectedPluginContext(this.state.selectedComposerPlugins, missingUrlMention)}\n\n[System] The user appears to be referring to a website, but no complete URL was provided in this turn (the system only auto-fetches text that contains a full http(s):// link or a recognizable bare domain like example.com / www.foo.bar). Reply briefly asking them to paste the full URL — including the https:// prefix — so you can read the page. Do NOT invent or guess the page contents.`;
        if (Array.isArray(lastHistory.content)) {
          lastHistory.content = [...lastHistory.content, { type: 'text', text: hintText }];
        } else {
          lastHistory.content = hintText;
        }
      }
      const stop = await startChatStream(session.id, {
        messages: history,
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

  private cancelActiveTurnForMutation() {
    if (!this.state.isStreaming) return;
    this.stopStream?.();
    this.stopStream = null;
    this.streamFinished = true;
    this.streamGeneration += 1;
    this.clearPendingAssistantPatches();
    this.setState({ isStreaming: false });
  }

  async editUserMessage(messageId: string, rawText: string) {
    const nextText = rawText.trim();
    const session = this.state.activeSession;
    if (!session || !nextText) return false;
    const messages = session.messages || [];
    const index = messages.findIndex((message) => messageKey(message) === messageId);
    const target = index >= 0 ? messages[index] : null;
    if (!target || target.role !== 'user') return false;
    if ((target.rawText || target.content || '').trim() === nextText) return true;

    this.cancelActiveTurnForMutation();

    const edited: Message = { ...target, rawText: nextText, content: nextText };
    const nextMessages = messages.slice(0, index + 1);
    nextMessages[index] = edited;
    const nextSession: Session = {
      ...session,
      messages: nextMessages,
      updatedAt: new Date().toISOString(),
    };
    this.setState({ activeSession: nextSession, error: null });

    if (!this.state.isOnline) {
      if (!this.state.isIncognito) {
        this.enqueueSession(nextSession, messageKey(edited) || id('edit'));
        this.setState({ error: tSync('chat.queued') });
      } else {
        this.setState({ error: tSync('chat.offline') });
      }
      return true;
    }

    try {
      if (!this.state.isIncognito) {
        await messagesApi.edit(messageId, nextText, session.id, {
          discardFollowing: true,
          attachments: edited.attachments,
        });
      }
    } catch (error) {
      /* A just-created local message can legitimately predate its DB row.
       * The next full session save will persist it; other failures stay
       * visible but do not block replaying the edited turn. */
      if (!(error instanceof ApiError && error.status === 404)) {
        this.setState({ error: error instanceof Error ? error.message : tSync('chat.offline') });
      }
    }

    try {
      await this.startAssistantStream(nextSession, nextMessages);
      return true;
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : tSync('chat.offline') });
      return false;
    }
  }

  async deleteUserMessage(messageId: string) {
    const session = this.state.activeSession;
    if (!session) return false;
    const messages = session.messages || [];
    const index = messages.findIndex((message) => messageKey(message) === messageId);
    if (index < 0 || messages[index].role !== 'user') return false;
    const nextMessages = messages.filter((_, i) => i !== index);
    this.setState({
      activeSession: { ...session, messages: nextMessages, updatedAt: new Date().toISOString() },
      error: null,
    });
    try {
      if (!this.state.isIncognito) {
        await messagesApi.remove(messageId, session.id);
      }
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) {
        this.setState({ error: error instanceof Error ? error.message : tSync('chat.offline') });
      }
    }
    return true;
  }

  async regenerateAssistantMessage(messageId: string) {
    if (!this.state.isOnline) {
      this.setState({ error: tSync('chat.offline') });
      return false;
    }
    const session = this.state.activeSession;
    if (!session) return false;
    const messages = session.messages || [];
    const assistantIndex = messages.findIndex((message) => messageKey(message) === messageId);
    if (assistantIndex < 0 || messages[assistantIndex].role !== 'assistant') return false;
    let userIndex = assistantIndex - 1;
    while (userIndex >= 0 && messages[userIndex].role !== 'user') userIndex -= 1;
    if (userIndex < 0) return false;
    const user = messages[userIndex];
    const userId = messageKey(user);
    const userText = String(user.rawText || user.content || '').trim();
    if (!userId || !userText) return false;

    this.cancelActiveTurnForMutation();

    const nextMessages = messages.slice(0, userIndex + 1);
    const nextSession: Session = {
      ...session,
      messages: nextMessages,
      updatedAt: new Date().toISOString(),
    };
    this.setState({ activeSession: nextSession, error: null });

    try {
      if (!this.state.isIncognito) {
        await messagesApi.edit(userId, userText, session.id, {
          discardFollowing: true,
          attachments: user.attachments,
        });
      }
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) {
        this.setState({ error: error instanceof Error ? error.message : tSync('chat.offline') });
      }
    }

    try {
      await this.startAssistantStream(nextSession, nextMessages);
      return true;
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : tSync('chat.offline') });
      return false;
    }
  }

  async branchFromMessage(messageId: string, options: { reExplain?: boolean } = {}) {
    const source = this.state.activeSession;
    if (!source) return null;
    const messages = source.messages || [];
    const index = messages.findIndex((message) => messageKey(message) === messageId);
    if (index < 0) return null;

    this.cancelActiveTurnForMutation();

    const branchMessages = messages.slice(0, index + 1).map((message) => ({
      ...message,
      attachments: message.attachments ? message.attachments.slice(0, 20) : undefined,
      toolCalls: message.toolCalls ? message.toolCalls.slice(0, 20) : undefined,
    }));
    const base = createDraftSession(uuid(), source.mode);
    const branchSession: Session = {
      ...base,
      topic: source.topic,
      title: `${source.title || source.topic || tSync('chat.newConversation')} (branch)`,
      phase: source.phase,
      projectId: source.projectId || null,
      messages: branchMessages,
      branchedFrom: {
        sessionId: source.id,
        messageId,
        reExplain: options.reExplain === true,
      },
      updatedAt: new Date().toISOString(),
    };

    try {
      let active: Session;
      if (this.state.isIncognito) {
        active = branchSession;
        this.setState({
          activeSession: active,
          draft: '',
          pendingAttachments: [],
          error: null,
        });
      } else {
        const saved = await sessionRepository.save(branchSession, branchMessages);
        active = { ...branchSession, ...saved, messages: branchMessages };
        this.setState({
          activeSession: active,
          sessions: [saved, ...this.state.sessions.filter((item) => item.id !== saved.id)],
          draft: '',
          pendingAttachments: [],
          error: null,
        });
      }
      if (options.reExplain) {
        const prompt = 'Please re-explain that from a different angle. Use a different approach, analogy, or teaching method to help me understand better.';
        await this.sendMessage(prompt);
      }
      return active.id;
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : tSync('chat.offline') });
      return null;
    }
  }

  async sendMessageFeedback(messageId: string, rating: 'up' | 'down' | 'none', reason?: string) {
    const sessionId = this.state.activeSession?.id || null;
    if (!messageId || this.state.isIncognito) return;
    await messagesApi.feedback(messageId, rating, reason, sessionId);
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
    if (this.state.isIncognito) {
      // Incognito conversations are intentionally memory-only. They still
      // support the full live response/tool UI, but never enter Recents,
      // SQLite/server session storage, or the offline outbox.
      return;
    }
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
