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
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";
import { closeFindInSession } from '../react/find-in-session/findInSession.actions.ts';
import { hideGate } from '../auth/index.ts';
import { dispatchExam, dispatchUi } from '../store/index.ts';
import type { ExamQuestion } from '../exam/types.ts';

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
let sharedShellRestore: (() => void) | null = null;

/* React reads share data from the same typed module store. Overlay
   visibility remains owned by the legacy shell class. */
function _publishShareState() {
  publishShareState({
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
  const btn = document.getElementById("shareBtn");
  if (!btn) return;
  /* P_share-btn-hidden — the .share-btn starts with class
     "share-btn hidden" (index.html:388). The .hidden utility class
     is `.hidden { display: none !important }` (styles.css:1979),
     which beats any inline `style.display` we set. We must toggle
     the class itself, not the style attribute. */
  const show = !!(browserWindow.CURRENT_USER && (browserWindow.stateStore.read("currentSessionId") || browserWindow.stateStore.read("_examInView")));
  btn.classList.toggle("hidden", !show);
  /* P0.2 — the in-session Find button lives next to Share in the
     top bar and shares the exact same visibility rule (only useful
     when a conversation is on screen). Toggle it in lock-step here
     so we don't need a second lifecycle hook. When hidden, also make
     sure the find bar itself is dismissed. */
  const findBtn = document.getElementById("findBtn");
  if (findBtn) findBtn.classList.toggle("hidden", !show);
  if (!show) {
    try { closeFindInSession(); } catch (error) { reportSwallow(error, 'ui/share.impl.ts:75'); }
  }
}

function getShareOverlay(): HTMLElement | null {
  return document.getElementById("shareOverlay");
}

function hideAuthGate() {
  try { hideGate(); } catch (error) { reportSwallow(error, 'ui/share.impl.ts:hideGate'); }
}

function openShareModal(sessionId?: string) {
  _shareSessionId = typeof sessionId === "string" ? sessionId : browserWindow.stateStore.read("currentSessionId");
  const overlay = getShareOverlay();
  if (!overlay) return;
  _shareToken = null;
  _shareUrl = "";
  _shareStatus = "";
  _shareError = "";
  overlay.classList.remove("hidden");
  _shareVisibility = "public";
  _publishShareState();
}

function closeShareModal() {
  getShareOverlay()?.classList.add("hidden");
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
  const sessionId = _shareSessionId || browserWindow.stateStore.read("currentSessionId");
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

function copyShareLink() {
  if (!_shareUrl) return;
  navigator.clipboard.writeText(_shareUrl).then(function () {
    _setShareStatus("Link copied to clipboard.");
  }).catch(function () {
    const input = document.getElementById("shareLinkInput");
    if (input) { (input as HTMLInputElement).select(); document.execCommand("copy"); _setShareStatus("Link copied to clipboard."); }
  });
}

/* Session-teardown hook: main.js's reset paths (bounceOutOfArchivedSession,
   resetState, sign-out) call this so a stale share token can't be reused
   after the active session changes. The legacy paths only nulled the
   window copy, which share.js never read — the module var kept the stale
   token alive. */
function resetShareToken() {
  _shareToken = null;
}

async function revokeShareLink() {
  const sessionId = _shareSessionId || browserWindow.stateStore.read("currentSessionId");
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
function _switchToSharedChatView() {
  restoreSharedViewShell();
  const banner = document.getElementById("sharedBanner");
  const bannerParent = banner?.parentElement || null;
  const bannerNextSibling = banner?.nextSibling || null;
  const inputBar = document.getElementById("chatInputBar");
  const inputBarWasHidden = inputBar?.classList.contains('hidden') || false;
  const topBar = document.querySelector(".chat-top-bar");
  const topBarDisplay = (topBar as HTMLElement | null)?.style.display || '';
  const shareBtn = document.getElementById("shareBtn");
  const shareButtonDisplay = shareBtn?.style.display || '';
  const composer = document.getElementById("composerRoot");
  const composerAriaDisabled = composer?.getAttribute('aria-disabled') ?? null;
  const recentsPane = document.getElementById("recentsPane");
  const recentsWereHidden = recentsPane?.classList.contains('hidden') || false;
  activateMainView("chatView", document);
  /* Show the read-only banner — it exists in index.html but was never
     unhidden, so shared sessions had no visible "this is not yours"
     affordance. */
  if (banner) {
    // The transcript was lifted out of mainInner during the shell migration.
    // Its read-only notice must follow it instead of staying in the hidden landing container.
    document.getElementById("chatPage")?.prepend(banner);
    banner.classList.remove("hidden");
    const label = banner.querySelector("[data-i18n-key='share.readOnlyBanner']");
    if (label && typeof browserWindow.t === "function") {
      const text = browserWindow.t("share.readOnlyBanner");
      if (text && text !== "share.readOnlyBanner") label.textContent = text;
    }
  }
  if (inputBar) inputBar.classList.add("hidden");
  if (topBar) (topBar as HTMLElement).style.display = "none";
  if (shareBtn) shareBtn.style.display = "none";
  if (composer) composer.setAttribute("aria-disabled", "true");
  if (recentsPane) recentsPane.classList.add("hidden");
  sharedShellRestore = () => {
    if (banner) {
      banner.classList.add('hidden');
      if (bannerParent) bannerParent.insertBefore(banner, bannerNextSibling?.parentNode === bannerParent ? bannerNextSibling : null);
    }
    inputBar?.classList.toggle('hidden', inputBarWasHidden);
    if (topBar) (topBar as HTMLElement).style.display = topBarDisplay;
    if (shareBtn) shareBtn.style.display = shareButtonDisplay;
    if (composer) {
      if (composerAriaDisabled === null) composer.removeAttribute('aria-disabled');
      else composer.setAttribute('aria-disabled', composerAriaDisabled);
    }
    recentsPane?.classList.toggle('hidden', recentsWereHidden);
    sharedShellRestore = null;
  };
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
  if (typeof browserWindow.renderRecents === "function") browserWindow.renderRecents();
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
  createShareLink, copyShareLink, revokeShareLink, resetShareToken,
  loadSharedSession, loadSharedExamSession,
  _shareVisibility, _shareToken, _shareUrl,
};
