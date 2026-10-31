/* session/loader.ts — extracted from main.js (B2 batch).
 * Session loading (loadSession/loadExamSession) + transients + current-id.
 * Zero-behavior-change lift. Main.js-local list surfaces
 * (renderRecents, the recents reconciler) resolve via window.* at call time.
 * P_save-drain-removed: loadSession no longer waits on the save pipeline — the
 * save queue posts a self-contained snapshot (see session/saveState.ts).
 */
import { afterSessionPaint } from './afterSessionPaint.ts';
import { stateStore } from '../state/store.ts';
import { saveState } from './saveState.ts';
import { serverCache } from './serverCache.ts';
import { turnState } from '../chat/turnState.ts';
import { apiFetch } from '../util/api.ts';
import { refreshCachedProjects } from '../projects/projectCache.ts';
import { appMode, ensureSessionShape, setAppMode, syncAppModeUI, syncSidebarForMode, type AppMode } from '../config/providers.ts';
import { pushChatIdToURL, pushExamIdToURL } from './store.ts';
import { clearLegacyMsgListChildren } from '../ui/messageListDom.ts';
import { buildTeachingPlanFromKB, syncCurrentNodeFromTeachingPlan } from '../chat/teachingPlan.ts';
import { stateView } from '../tutor/diagnosticFlow.ts';
import { publishReactChatRuntime } from '../ui/reactBridge.ts';
import { showToast } from '../ui/toast.js';
import { detailCache, type CacheEntry } from './detailCache.ts';
import {
  restoreSessionMessage,
  restoreLocalAssistantFallback,
  restoreInterruptedResponse,
  mirrorSessionHistory,
  type PersistedMessage,
} from './historyRestore.ts';
import { reattachPendingTurn } from './pendingTurnRestore.ts';
import { seedSyncedMessages } from './persistence.ts';
import { toggleShareBtn } from '../ui/share.ts';
import { activateMainView } from '../ui/mainViewController.ts';
import { clearComposer } from '../composer/controller.ts';
import { closeSidebarOnMobile } from '../sidebar/sidebar.service.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { dispatchExam, dispatchSession, dispatchUi } from '../store/index.ts';
import type { ExamQuestion } from '../exam/types.ts';

export { reattachPendingTurn };

/** GET /api/sessions/:id, as far as loading and restoring reads it. */
export interface LoadedSession {
  id: string;
  topic?: string;
  title?: string | null;
  domain?: string | null;
  mode?: AppMode;
  kind?: string;
  phase?: string;
  projectId?: string | null;
  assistantId?: string | null;
  kbNodes?: unknown[];
  mistakes?: unknown[];
  messages?: PersistedMessage[];
  examData?: ExamDataShape | null;
  teachingPlan?: unknown;
  teachingStage?: string;
  currentExampleIdx?: number;
  practiceAttempts?: number;
  practicePhase?: string;
  currentNode?: number;
  totalQ?: number;
  branchedFrom?: unknown;
  boundariesHistory?: unknown[];
  mistakeFilter?: string;
  [key: string]: unknown;
}

export interface ExamDataShape {
  questions?: ExamQuestion[];
  topic?: string;
  count?: number;
  lang?: string;
  difficulty?: string;
  types?: string[];
  answers?: Record<string, unknown>;
  submitted?: boolean;
  [key: string]: unknown;
}

/** Window surfaces the loader reads at call time. */
interface LoaderWindow extends Window {
  renderRecents?: () => void;
  clearActiveTemplate?: () => void;
}

function _t(key: string, fallback?: string): string {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') {
      const v = window.t(key);
      if (v && v !== key) return v;
    }
  } catch (e) { reportSwallow(e, 'session/loader._t'); }
  return fallback != null ? fallback : key;
}
function _appMode(): string {
  return appMode;
}
function _renderRecents(): void {
  try {
    const win = window as LoaderWindow;
    if (typeof window !== 'undefined' && typeof win.renderRecents === 'function') win.renderRecents();
  } catch (e) { reportSwallow(e, 'session/loader._renderRecents'); }
}
function _clearActiveTemplate(): void {
  try {
    const win = window as LoaderWindow;
    if (typeof window !== 'undefined' && typeof win.clearActiveTemplate === 'function') win.clearActiveTemplate();
  } catch (e) { reportSwallow(e, 'session/loader._clearActiveTemplate'); }
}

function restoredExamQuestions(session: LoadedSession): ExamQuestion[] {
  const questions = session.examData && Array.isArray(session.examData.questions)
    ? session.examData.questions : [];
  return questions.map((question, index) => ({ ...question, _idx: index }));
}

function buildRestoredExamState(session: LoadedSession, questions: ExamQuestion[]) {
  const exam = session.examData;
  return {
    examCancel: false,
    examReadOnly: false,
    examTopic: (exam && exam.topic) || session.topic || '',
    examCount: (exam && exam.count) || questions.length,
    examLang: (exam && exam.lang) || 'English',
    examDifficulty: (exam && exam.difficulty) || 'intermediate',
    examTypes: exam && Array.isArray(exam.types) ? exam.types : [],
    examQuestions: questions,
    examAnswers: (exam && exam.answers || {}) as Record<string, string | number | undefined>,
    examSubmitted: !!(exam && exam.submitted),
    examViewMode: 'questions' as const,
    examStatusMessage: '',
    examStatusDetail: '',
  };
}

function restoreExamState(session: LoadedSession, questions: ExamQuestion[]): void {
  dispatchSession({ type: 'session/set', key: 'currentSessionId', value: session.id });
  dispatchUi({ type: 'ui/set', key: '_examInView', value: true });
  dispatchExam({ type: 'exam/patch', patch: buildRestoredExamState(session, questions) });
  try { pushExamIdToURL(session.id); }
  catch (error) { reportSwallow(error, 'session/loader.loadSession.examUrl'); }
}

export async function loadExamSession(session: LoadedSession): Promise<void> {
  const { mountExamView } = await import('../react/exam/mount.tsx');
  mountExamView();
  activateMainView('examView', document);
  const questions = restoredExamQuestions(session);
  restoreExamState(session, questions);
  toggleShareBtn();
  _renderRecents();
  const scroller = document.getElementById('scrollContainer') || document.getElementById('msgScroll');
  if (scroller) scroller.scrollTop = 0;
}
/* F2c — clear every cross-round transient so a previous session's
   web-search cache, call metadata, composer draft, plan fields, or
   pending-chat payload cannot leak into the next one. Called from
   loadSession() (server-driven switch) and startSession() (user
   clicks Begin with a new topic). */
export function resetSessionTransients(): void {
  stateStore.dispatch({ type: 'state/batch', patch: {
    searchContext: null,
    searchResults: [],
    searchContextAt: 0,
    searchContextCount: 0,
    searchContextQuery: null,
    searchContextError: null,
    lastCallSource: null,
    lastCallError: null,
    sessionTitle: null,
  } });
  try { clearComposer('chat'); } catch (e) { reportSwallow(e, 'session/loader.resetSessionTransients'); }
  try { if (turnState.pendingChatContent !== undefined) turnState.pendingChatContent = null; } catch (e) { reportSwallow(e, 'session/loader.resetSessionTransients~3'); }
  try { if (turnState.pendingAttachments !== undefined) turnState.pendingAttachments = null; } catch (e) { reportSwallow(e, 'session/loader.resetSessionTransients~4'); }
  /* F2a-ext — clear the active template so a slash-command template
     (/quiz, /summarize, etc.) from the previous session doesn't
     inject its systemPrompt into the new session's LLM call via
     injectTemplateSystemPrompt (main.js:3910). The template is a
     user-level tool, not a session-scoped state; resetting it on
     session switch prevents the #1 cross-session context leak. */
  try { _clearActiveTemplate(); } catch (e) { reportSwallow(e, 'session/loader.resetSessionTransients~5'); }
}

/* F2d — update the canonical session id in stateStore. Its lookup table
   keeps the legacy and namespaced state views synchronized. */
export function setCurrentSessionId(id: string | null, silent?: boolean): void {
  stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: id });
  if (!silent) publishReactChatRuntime({ type: 'state-synced', reason: 'session-id-changed' });
}

function syncRestoredTutorPlan(): void {
  const nodes = stateStore.read('kbNodes') as unknown[] | null;
  if (_appMode() === 'chat' || !nodes || !nodes.length) return;
  stateStore.dispatch({
    type: 'state/set', key: 'teachingPlan', value: buildTeachingPlanFromKB(stateView()),
  });
  const planSync = syncCurrentNodeFromTeachingPlan(stateView());
  if (planSync) stateStore.dispatch({ type: 'state/batch', patch: planSync });
}

/* A cache-hit paints immediately; this background fetch refreshes it and
   starts a normal load only when the server's session has changed. */
function revalidateCachedSession(
  id: string,
  session: LoadedSession,
  cachedDetail: CacheEntry | null,
  abortController: AbortController,
): void {
  if (!cachedDetail || session.kind === 'exam' || detailCache.isFresh(cachedDetail)) return;
  const paintedSignature = cachedDetail.sig;
  Promise.resolve().then(function () {
    return apiFetch<LoadedSession>('/api/sessions/' + encodeURIComponent(id), { signal: abortController.signal });
  }).then(function (fresh) {
    if (!fresh || abortController.signal.aborted || saveState.loadSessionId !== id) return;
    if (stateStore.read('currentSessionId') !== id) return;
    detailCache.store(id, fresh);
    if (detailCache.signature(fresh) !== paintedSignature) {
      detailCache.invalidate(id);
      loadSession(id);
    }
  }).catch(function () { /* empty-catch: intentional — a failed revalidate keeps the painted copy */ });
}

/* Keep stale-load races inert, preserve the previous transcript for transient
   failures, and clear only genuinely missing sessions from the visible view. */
function evictMissingSession(id: string): void {
  /* Malformed aliases may still resolve through recents reconciliation. */
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '');
  try {
    if (!isUuid) return;
    const index = serverCache.sessions.findIndex((session) => session.id === id);
    if (index >= 0) serverCache.sessions.splice(index, 1);
  } catch (error) {
    reportSwallow(error, 'session/loader.handleSessionLoadFailure.removeMissing');
  }
}

function shouldResetMissingSessionView(id: string): boolean {
  const currentId = stateStore.read('currentSessionId');
  const isUrlMatch = typeof location !== 'undefined'
    && location.search.indexOf('chat=' + encodeURIComponent(id)) >= 0;
  return currentId === id || !currentId || isUrlMatch;
}

function clearMissingSessionUrl(): void {
  try {
    if (/[?&]chat=/i.test(location.search)) {
      const url = new URL(location.href);
      url.searchParams.delete('chat');
      // Build the target from the parsed parts rather than `url.href`, so the
      // replacement can only ever drop the `chat` param and never rewrite the
      // origin/path. `url.search` already carries its leading `?`.
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    }
  } catch (error) {
    reportSwallow(error, 'session/loader.handleSessionLoadFailure.clearUrl');
  }
}

function resetMissingSessionView(): void {
  try {
    clearLegacyMsgListChildren();
    stateStore.dispatch({ type: 'state/batch', patch: {
      currentSessionId: null, topic: '', kbNodes: [], phase: 'topic',
    } });
    stateStore.dispatch({ type: 'session/replace-messages', payload: [] });
    publishReactChatRuntime({ type: 'state-synced', reason: 'session-not-found' });
    activateMainView('topicSetup', document);
  } catch (error) {
    reportSwallow(error, 'session/loader.handleSessionLoadFailure.resetView');
  }
}

function handleMissingSession(id: string): void {
  showToast(_t('session.notFound'));
  evictMissingSession(id);
  if (!shouldResetMissingSessionView(id)) return;
  clearMissingSessionUrl();
  resetMissingSessionView();
}

function handleSessionLoadFailure(
  id: string,
  error: unknown,
  abortController: AbortController,
  historyRebuildStarted: boolean,
  previousMessages: unknown[] | null,
): void {
  if (abortController.signal.aborted || saveState.loadSessionId !== id) return;
  if (historyRebuildStarted && previousMessages) {
    try {
      stateStore.dispatch({ type: 'session/replace-messages', payload: previousMessages });
      publishReactChatRuntime({ type: 'state-synced', reason: 'session-load-failed' });
    } catch (e) { reportSwallow(e, 'session/loader.handleSessionLoadFailure.restore'); }
  }

  const status = (error && typeof (error as { status?: unknown }).status === 'number')
    ? (error as { status: number }).status
    : 0;
  if (status === 404) {
    handleMissingSession(id);
    return;
  }
  console.warn('[loadSession] transient error loading session', id, 'status=' + status, (error as { message?: string } | null)?.message);
  showToast(_t('session.loadFailed').replace('{msg}', (error as { message?: string } | null)?.message || 'temporary error'));
}

interface SessionLoadRecovery {
  previousMessages: unknown[] | null;
  historyRebuildStarted: boolean;
}

function beginSessionLoad(id: string): AbortController {
  saveState.loadingSession = true;
  saveState.saveDirty = false;
  saveState.pendingSnapshot = null;

  if (turnState.activeChatAbort) {
    try { turnState.activeChatAbort('session-switch'); }
    catch (error) { reportSwallow(error, 'session/loader.loadSession'); }
  }
  if (turnState.activeChatCtl) {
    try { turnState.activeChatCtl.abort(); }
    catch (error) { reportSwallow(error, 'session/loader.loadSession~2'); }
  }
  turnState.activeChatCtl = null;
  turnState.activeChatAbort = null;
  turnState.chatStreaming = false;
  turnState.chatStopMode = false;

  if (saveState.loadAbortCtl) {
    try { saveState.loadAbortCtl.abort(); }
    catch (error) { reportSwallow(error, 'session/loader.loadSession~3'); }
  }
  const controller = new AbortController();
  saveState.loadAbortCtl = controller;
  saveState.loadSessionId = id;
  return controller;
}

async function fetchSessionSnapshot(
  id: string,
  controller: AbortController,
  cachedDetail: CacheEntry | null,
): Promise<LoadedSession | null> {
  if (cachedDetail) return cachedDetail.response as LoadedSession;

  const inflight = detailCache.getInflight(id);
  let session = inflight
    ? await inflight as LoadedSession
    : await apiFetch<LoadedSession>('/api/sessions/' + encodeURIComponent(id), { signal: controller.signal });
  if (!session) {
    session = await apiFetch<LoadedSession>('/api/sessions/' + encodeURIComponent(id), { signal: controller.signal });
  }
  if (controller.signal.aborted || saveState.loadSessionId !== id) return null;
  detailCache.store(id, session);
  return session;
}

function buildSessionCoreFields(session: LoadedSession): Record<string, unknown> {
  return {
    topic: session.topic,
    domain: session.domain,
    kbNodes: session.kbNodes || [],
    currentNode: session.currentNode || 0,
    totalQ: session.totalQ || 0,
    phase: session.phase || 'chat',
    currentProjectId: session.projectId || null,
    mistakes: session.mistakes || [],
    sessionTitle: session.title || null,
  };
}

function buildSessionTeachingFields(session: LoadedSession): Record<string, unknown> {
  return {
    substantiveCount: 0,
    stuckCount: 0,
    diagIndex: 0,
    diagAnswers: [],
    diagQuestions: [],
    explaining: false,
    teachingStage: session.teachingStage || 'motivate',
    currentExampleIdx: session.currentExampleIdx || 0,
    practiceAttempts: session.practiceAttempts || 0,
    practicePhase: session.practicePhase || 'foundation',
    teachingPlan: session.teachingPlan || null,
    'session.branchedFrom': session.branchedFrom || null,
    'kb.boundariesHistory': Array.isArray(session.boundariesHistory) ? session.boundariesHistory : [],
    'kb.mistakeFilter': session.mistakeFilter || 'all',
  };
}

function restoreAssistantSelection(session: LoadedSession): void {
  try {
    if (session.assistantId) sessionStorage.setItem('socrates-active-assistant', session.assistantId);
    else sessionStorage.removeItem('socrates-active-assistant');
  } catch (error) {
    reportSwallow(error, 'session/loader.loadSession~4', 'expected');
  }
}

function refreshLoadedSessionProject(session: LoadedSession): void {
  if (session.projectId) {
    void refreshCachedProjects(() => apiFetch('/api/projects')).catch(() => null);
  }
}

function hydrateSessionFields(session: LoadedSession): void {
  /* Clear previous-session transients before restoring this session's title. */
  resetSessionTransients();
  stateStore.dispatch({ type: 'state/batch', patch: {
    ...buildSessionCoreFields(session),
    ...buildSessionTeachingFields(session),
  } });
  restoreAssistantSelection(session);
  refreshLoadedSessionProject(session);
  toggleShareBtn();
  if (session.mode === 'chat' || session.mode === 'tutor') setAppMode(session.mode);
  syncAppModeUI();
  syncSidebarForMode();
}

function restoreLoadedChat(
  session: LoadedSession,
  controller: AbortController,
  recovery: SessionLoadRecovery,
): void {
  activateMainView('chatView', document);
  recovery.previousMessages = (stateStore.read('messages') as unknown[]).slice();
  recovery.historyRebuildStarted = true;
  clearLegacyMsgListChildren();

  const restoredMessages = (session.messages || []).map(restoreSessionMessage);
  stateStore.dispatch({ type: 'session/replace-messages', payload: restoredMessages });
  seedSyncedMessages(session.id, restoredMessages);
  restoreLocalAssistantFallback(session);
  const restorePartialFallback = (): void => {
    try { restoreInterruptedResponse(session); }
    catch (error) { reportSwallow(error, 'session/loader.restorePartialFallback'); }
  };

  /* Set the id only after replacing messages so saves cannot pair a new id
     with the previous transcript during the session switch. */
  setCurrentSessionId(session.id, true);
  pushChatIdToURL(session.id);
  toggleShareBtn();
  try {
    void reattachPendingTurn(session.id, restorePartialFallback);
  } catch (error) {
    reportSwallow(error, 'session/loader.loadSession~6');
  }

  _renderRecents();
  syncRestoredTutorPlan();
  publishReactChatRuntime({ type: 'state-synced', reason: 'session-loaded' });

  const stillCurrent = () => !controller.signal.aborted && stateStore.read('currentSessionId') === session.id;
  afterSessionPaint(controller.signal, stillCurrent, () => {
    mirrorSessionHistory(session, stillCurrent, controller.signal);
  });
}

export async function loadSession(id: string): Promise<void> {
  /* A context-menu click during long-press is synthetic; keep the current view. */
  if (serverCache.ctxMenuSessionId === id) return;

  /* Phone recents live in the overlay drawer: picking one has to reveal the
     conversation it just loaded. No-op on desktop and when already closed. */
  try { closeSidebarOnMobile(); } catch (error) { reportSwallow(error, 'session/loader.closeSidebarOnMobile'); }

  const controller = beginSessionLoad(id);
  const cachedDetail = detailCache.lookup(id);
  const recovery: SessionLoadRecovery = { previousMessages: null, historyRebuildStarted: false };
  try {
    const session = await fetchSessionSnapshot(id, controller, cachedDetail);
    if (!session) return;
    ensureSessionShape(session);
    session.messages = Array.isArray(session.messages) ? session.messages : [];
    if (saveState.loadSessionId !== id) return;

    hydrateSessionFields(session);
    if (session.kind === 'exam' && session.examData) {
      await loadExamSession(session);
      return;
    }

    restoreLoadedChat(session, controller, recovery);
    revalidateCachedSession(id, session, cachedDetail, controller);
  } catch (error) {
    handleSessionLoadFailure(
      id,
      error,
      controller,
      recovery.historyRebuildStarted,
      recovery.previousMessages,
    );
  } finally {
    if (saveState.loadSessionId === id) saveState.loadingSession = false;
  }
}
/* ============================================================
   CLIENT-SIDE CONVERSATION MEMORY
   K 区段(LOCAL_MEMORY_MAX / _memKey / loadLocalMemory /
   appendLocalMemory / clearLocalMemory) 已抽到 src/storage/localMemory.ts。
   Session history restore reads and writes the mirror in historyRestore.ts。
   ============================================================ */
