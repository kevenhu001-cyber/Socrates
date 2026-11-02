/* ui/share.ts — Wave 3 of main-js-split plan.
 * Share modal: create, copy, revoke share links for sessions. Also includes
 * read-only session loading from share tokens.
 * Extracted from main.js (post-Wave-2): toggleShareBtn L10076, openShareModal
 * L10107, loadSharedSession L10201, etc.
 *
 * Touches via window.*:
 *   state, CURRENT_USER, apiFetch, esc, formatMsg, t, showToast
 *
 * React subscribes to the typed state in `ui/shareState.ts`; this module
 * remains the owner of share actions and API requests.
 */

import { apiFetch } from '../util/api.ts';
import { stateStore } from '../state/store.ts';
import { showToast } from './toast.js';
import { activateMainView } from './mainViewController.ts';
import { publishReactChatRuntime } from './reactBridge.ts';
import { mountSharedMessageList } from '../react/message-list/MessageList.tsx';
import { registerSharedViewCleanup } from './msgListMount.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { publishShareState, type ShareVisibility } from './shareState.ts';
import type { MessageEntry } from './messageActions.ts';
import { getCurrentUser } from '../app/lifecycle.ts';
import { closeFindInSession } from '../react/find-in-session/findInSession.actions.ts';
import { readTopbarState, setTopbarState } from '../react/topbar/topbarStore.ts';
import { hideGate } from '../auth/index.ts';
import { dispatchExam, dispatchUi } from '../store/index.ts';
import type { ExamQuestion } from '../exam/types.ts';
import { renderRecents } from './recentsView.ts';
import { t } from '../i18n.ts';

interface SharedMessage extends MessageEntry {
  role: string;
  content?: unknown;
  reasoningContent?: unknown;
}
interface SharedExamData { questions?: ExamQuestion[]; answers?: Record<string, string | number | undefined>; submitted?: boolean; topic?: string }
interface SharedSession {
  id: string;
  topic?: string;
  title?: string;
  domain?: string;
  kind?: string;
  messages: SharedMessage[];
  examData?: SharedExamData;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseSharedSession(value: unknown): SharedSession | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  const messages = Array.isArray(value.messages) ? value.messages.flatMap((message): SharedMessage[] => {
    if (!isRecord(message) || typeof message.role !== 'string') return [];
    return [{
      id: typeof message.id === 'string' ? message.id : undefined,
      role: message.role,
      rawText: typeof message.rawText === 'string' ? message.rawText : undefined,
      content: message.content,
      html: typeof message.html === 'string' ? message.html : undefined,
      reasoningContent: message.reasoningContent,
      toolCalls: Array.isArray(message.toolCalls) ? message.toolCalls as SharedMessage['toolCalls'] : [],
    }];
  }) : [];
  const rawExam = isRecord(value.examData) ? value.examData : null;
  const examData = rawExam ? {
    questions: Array.isArray(rawExam.questions) ? rawExam.questions.flatMap((question): ExamQuestion[] => {
      if (!isRecord(question) || typeof question.q !== 'string' || typeof question.type !== 'string') return [];
      const type = question.type === 'multiple-choice' || question.type === 'fill-blank' || question.type === 'short-answer' || question.type === 'error'
        ? question.type : 'error';
      const parsed: ExamQuestion = { q: question.q, type };
      if (typeof question.explanation === 'string') parsed.explanation = question.explanation;
      if (typeof question.answer === 'string' || typeof question.answer === 'number') parsed.answer = question.answer;
      if (Array.isArray(question.answers)) parsed.answers = question.answers.filter((answer): answer is string => typeof answer === 'string');
      if (Array.isArray(question.opts)) parsed.opts = question.opts.flatMap((option) => {
        if (!isRecord(option)) return [];
        const text = typeof option.text === 'string' || option.text === null ? option.text : null;
        return [{ letter: typeof option.letter === 'string' ? option.letter : undefined, text }];
      });
      return [parsed];
    }) : [],
    answers: isRecord(rawExam.answers) ? Object.fromEntries(Object.entries(rawExam.answers).filter((entry): entry is [string, string | number] => typeof entry[1] === 'string' || typeof entry[1] === 'number')) : undefined,
    submitted: typeof rawExam.submitted === 'boolean' ? rawExam.submitted : undefined,
    topic: typeof rawExam.topic === 'string' ? rawExam.topic : undefined,
  } : undefined;
  return {
    id: value.id,
    topic: typeof value.topic === 'string' ? value.topic : undefined,
    title: typeof value.title === 'string' ? value.title : undefined,
    domain: typeof value.domain === 'string' ? value.domain : undefined,
    kind: typeof value.kind === 'string' ? value.kind : undefined,
    messages,
    examData,
  };
}


let _shareSessionId: string | null = null;
let _shareVisibility: ShareVisibility = "public";
let _shareToken: string | null = null;
let _shareUrl = "";
let _shareStatus = "";
let _shareError = "";
let _shareOpen = false;
let sharedShellRestore: (() => void) | null = null;

/* React reads share data from the same typed module store and owns the
   overlay's visibility from the published `open` flag. */
function _publishShareState() {
  publishShareState({
    open: _shareOpen,
    visibility: _shareVisibility,
    shareToken: _shareToken,
    shareUrl: _shareUrl,
    status: _shareStatus,
    error: _shareError,
  });
}

/* React owns the share modal unconditionally under the always-on
   runtime. `renderShareModal` is kept as a no-op for legacy callers;
   state mutations still update the React subscriber via `_publishShareState`. */

function toggleShareBtn() {
  /* RN-7 — share and find share one visibility rule (only useful while a
     conversation or exam is on screen). The top bar renders from the
     header store; nothing here touches the buttons. */
  const show = !!(getCurrentUser() && (stateStore.read("currentSessionId") || stateStore.read("_examInView")));
  setTopbarState({ conversationActions: show });
  if (!show) {
    try { closeFindInSession(); } catch (error) { reportSwallow(error, 'ui/share.impl.ts:75'); }
  }
}

function hideAuthGate() {
  try { hideGate(); } catch (error) { reportSwallow(error, 'ui/share.impl.ts:hideGate'); }
}

function openShareModal(sessionId?: string) {
  _shareSessionId = typeof sessionId === "string" ? sessionId : stateStore.read("currentSessionId");
  _shareToken = null;
  _shareUrl = "";
  _shareStatus = "";
  _shareError = "";
  _shareOpen = true;
  _shareVisibility = "public";
  _publishShareState();
}

function closeShareModal() {
  _shareOpen = false;
  _publishShareState();
}

function selectShareVis(vis: string) {
  _shareVisibility = vis === "private" ? "private" : "public";
  _publishShareState();
}

function renderShareModal() {
  // no-op: React owns #shareOverlay and reads state from the bridge.
}

function _setShareError(msg: string) {
  _shareError = msg || "";
  _publishShareState();
}

function _setShareStatus(msg: string) {
  _shareStatus = msg || "";
  _publishShareState();
}

async function createShareLink() {
  const sessionId = _shareSessionId || stateStore.read("currentSessionId");
  if (!sessionId) { _setShareError("No active session"); return; }
  _setShareError("");
  _setShareStatus("Creating share link…");
  try {
    const r = await apiFetch<{ token?: string }>("/api/sessions/" + encodeURIComponent(sessionId) + "/share", {
      method: "POST",
      body: { visibility: _shareVisibility },
    });
    if (r && r.token) {
      _shareToken = r.token;
      _shareUrl = location.origin + "?share=" + encodeURIComponent(r.token);
      _setShareStatus("Share link ready — copy and send to your recipient.");
      renderShareModal();
    } else {
      _setShareError("Failed to create share link");
    }
  } catch (e) {
    _setShareError("Error: " + ((e as Error).message || "network error"));
  }
}

/* Copying is owned by the React panel: it renders the link input and can
   fall back to a selection copy when the async clipboard API is missing.
   This module only owns the link itself. */

/* Session-teardown hook: main.js's reset paths (bounceOutOfArchivedSession,
   resetState, sign-out) call this so a stale share token can't be reused
   after the active session changes. The legacy paths only nulled the
   window copy, which share.js never read — the module var kept the stale
   token alive. */
function resetShareToken() {
  _shareToken = null;
}

async function revokeShareLink() {
  const sessionId = _shareSessionId || stateStore.read("currentSessionId");
  if (!_shareToken || !sessionId) return;
  try {
    await apiFetch("/api/sessions/" + encodeURIComponent(sessionId) + "/share", { method: "DELETE" });
    _shareToken = null;
    _shareUrl = "";
    _setShareStatus("Share link revoked.");
    renderShareModal();
  } catch (e) {
    _setShareError("Error revoking: " + ((e as Error).message || "network error"));
  }
}

function _renderSharedMessageList() {
  publishReactChatRuntime({ type: 'state-synced', reason: 'shared-session-loaded' });
  mountSharedMessageList();
}
function displayReadOnlyBanner(banner: HTMLElement | null): void {
  if (!banner) return;
  document.getElementById("chatPage")?.prepend(banner);
  banner.classList.remove("hidden");
  const label = banner.querySelector("[data-i18n-key='share.readOnlyBanner']");
  if (label) {
    const text = t("share.readOnlyBanner");
    if (text && text !== "share.readOnlyBanner") label.textContent = text;
  }
}

function createSharedViewRestorer(
  banner: HTMLElement | null,
  bannerParent: HTMLElement | null,
  bannerNextSibling: Node | null,
  saved: {
    inputBar: HTMLElement | null;
    inputBarWasHidden: boolean;
    topBar: HTMLElement | null;
    topBarDisplay: string;
    sharedViewWas: boolean;
    composer: HTMLElement | null;
    composerAriaDisabled: string | null;
    recentsPane: HTMLElement | null;
    recentsWereHidden: boolean;
  },
): () => void {
  return () => {
    if (banner) {
      banner.classList.add('hidden');
      if (bannerParent) bannerParent.insertBefore(banner, bannerNextSibling?.parentNode === bannerParent ? bannerNextSibling : null);
    }
    saved.inputBar?.classList.toggle('hidden', saved.inputBarWasHidden);
    if (saved.topBar) saved.topBar.style.display = saved.topBarDisplay;
    setTopbarState({ sharedView: saved.sharedViewWas });
    if (saved.composer) {
      if (saved.composerAriaDisabled === null) saved.composer.removeAttribute('aria-disabled');
      else saved.composer.setAttribute('aria-disabled', saved.composerAriaDisabled);
    }
    saved.recentsPane?.classList.toggle('hidden', saved.recentsWereHidden);
    sharedShellRestore = null;
  };
}

function captureSharedViewShell(
  inputBar: HTMLElement | null,
  topBar: HTMLElement | null,
  composer: HTMLElement | null,
  recentsPane: HTMLElement | null,
) {
  return {
    inputBar,
    inputBarWasHidden: Boolean(inputBar?.classList.contains('hidden')),
    topBar,
    topBarDisplay: topBar?.style.display ?? '',
    sharedViewWas: readTopbarState().sharedView,
    composer,
    composerAriaDisabled: composer?.getAttribute('aria-disabled') ?? null,
    recentsPane,
    recentsWereHidden: Boolean(recentsPane?.classList.contains('hidden')),
  };
}

function applySharedViewOverrides(
  inputBar: HTMLElement | null,
  topBar: HTMLElement | null,
  composer: HTMLElement | null,
  recentsPane: HTMLElement | null,
) {
  inputBar?.classList.add("hidden");
  if (topBar) topBar.style.display = "none";
  setTopbarState({ sharedView: true });
  composer?.setAttribute("aria-disabled", "true");
  recentsPane?.classList.add("hidden");
}

function _switchToSharedChatView() {
  restoreSharedViewShell();
  const banner = document.getElementById("sharedBanner");
  const bannerParent = banner?.parentElement || null;
  const bannerNextSibling = banner?.nextSibling || null;
  const inputBar = document.getElementById("chatInputBar");
  const topBar = document.querySelector(".chat-top-bar") as HTMLElement | null;
  const composer = document.getElementById("composerRoot");
  const recentsPane = document.getElementById("recentsPane");

  const saved = captureSharedViewShell(inputBar, topBar, composer, recentsPane);
  activateMainView("chatView", document);
  displayReadOnlyBanner(banner);
  applySharedViewOverrides(inputBar, topBar, composer, recentsPane);

  sharedShellRestore = createSharedViewRestorer(banner, bannerParent, bannerNextSibling, saved);
  hideAuthGate();
}

function restoreSharedViewShell(): void {
  sharedShellRestore?.();
}

registerSharedViewCleanup(restoreSharedViewShell);

function restoreSharedMessage(message: SharedMessage) {
  const rawText = typeof message.rawText === 'string' ? message.rawText : typeof message.content === 'string' ? message.content : '';
  return {
    clientId: message.id || ("shared-" + Math.random().toString(36).slice(2, 10)),
    role: message.role || "user",
    /* rawText is the markdown the inline tool rows are spliced into, so
       keep it distinct from the rendered `content` snapshot. */
    rawText: rawText,
    html: "",
    type: message.role || "user",
    reasoningContent: message.reasoningContent || null,
    toolCalls: Array.isArray(message.toolCalls) ? message.toolCalls : [],
    restoredFromHistory: true,
  };
}

function installSharedSessionState(session: SharedSession) {
  stateStore.dispatch({ type: 'state/batch', patch: {
    topic: session.topic || '',
    currentSessionId: session.id,
    sessionTitle: session.title || null,
    domain: session.domain || null,
  } });
  stateStore.dispatch({ type: 'session/replace-messages', payload:
    (session.messages || []).map(restoreSharedMessage)
  });
}

function showSharedChatSession() {
  _switchToSharedChatView();
  _renderSharedMessageList();
  document.documentElement.dataset.bootState = "app";
  renderRecents();
}

function recoverFailedSharedSessionLoad() {
  console.log("[share] load failed");
  document.documentElement.dataset.bootState = "app";
  try { hideGate(); } catch (error) { reportSwallow(error, 'ui/share.impl.ts:371'); }
  showToast("Shared session not found or has expired.");
}

async function loadSharedSession(token: string|number|boolean) {
  if (!token) return;
  try {
    const response = await apiFetch<unknown>("/api/shares/" + encodeURIComponent(token), { _authEndpoint: true });
    const session = parseSharedSession(response);
    if (!session) throw new Error("Invalid response");
    installSharedSessionState(session);
    if (session.kind === "exam" && session.examData) {
      /* Awaited so a render failure lands in the catch below (toast + gate
         teardown) instead of escaping as an unhandled rejection. */
      await loadSharedExamSession(session);
      return;
    }
    showSharedChatSession();
  } catch {
    recoverFailedSharedSessionLoad();
  }
}

function prepareSharedExamState(session: { topic?: string }, exam: SharedExamData, questions: ExamQuestion[]) {
  dispatchExam({ type: 'exam/patch', patch: {
    examReadOnly: true,
    examQuestions: questions,
    examAnswers: exam.answers || {},
    examSubmitted: !!exam.submitted,
    examTopic: exam.topic || session.topic || '',
    examCount: questions.length,
    examViewMode: 'questions',
    examCancel: false,
    examStatusMessage: '',
    examStatusDetail: '',
  } })
  dispatchUi({ type: 'ui/set', key: '_examInView', value: true })
}

function revealSharedExam() {
  hideAuthGate()
  document.documentElement.dataset.bootState = 'app'
}

async function loadSharedExamSession(session: SharedSession) {
  if (!session) return;
  const { mountExamView } = await import('../react/exam/mount.tsx');
  mountExamView();
  const exam = session.examData || {};
  const questions = Array.isArray(exam.questions) ? exam.questions : [];
  activateMainView('examView', document);
  prepareSharedExamState(session, exam, questions);
  revealSharedExam();
}
export {
  toggleShareBtn,
  openShareModal, closeShareModal, selectShareVis, renderShareModal,
  createShareLink, revokeShareLink, resetShareToken,
  loadSharedSession, loadSharedExamSession,
  _shareVisibility, _shareToken, _shareUrl,
};
