/* ui/share.ts — Wave 3 of main-js-split plan.
 * Share modal: create, copy, revoke share links for sessions. Also includes
 * read-only session loading from share tokens.
 * Extracted from main.js (post-Wave-2): toggleShareBtn L10076, openShareModal
 * L10107, loadSharedSession L10201, renderSharedQuestionCard L10390, etc.
 *
 * Touches via window.*:
 *   state, CURRENT_USER, apiFetch, esc, formatMsg, t, showToast
 *
 * React subscribes to the typed state in `ui/shareState.ts`; this module
 * remains the owner of share actions and API requests.
 */

import { esc } from '../render/helpers.ts';
import { apiFetch } from '../util/api.ts';
import { stateStore } from '../state/store.ts';
import { showToast } from './toast.js';
import { activateMainView } from './mainViewController.ts';
import { takeOverSharedMessageList } from './msgListMount.ts';
import { renderSharedAssistantTurn, releaseSharedAssistantTurns } from './assistantTurnRenderer.ts';

import { disposeVisualizations } from '../render/vizStubs.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { publishShareState, type ShareVisibility } from './shareState.ts';
import { renderSharedExamFooter as renderSharedExamFooterAction } from '../react/exam/sharedExamFooterHost.tsx';
import { restorePersistedMessageExtras, type MessageEntry } from './messageActions.ts';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";
import { getCurrentLanguage } from '../i18n/languageState.ts';
import type { ToolCall } from '../react/types/domain.ts';

interface SharedMessage extends MessageEntry {
  role: string;
  content?: unknown;
  reasoningContent?: unknown;
}
interface SharedExamQuestion { type: string; q?: unknown; opts?: unknown[] }
interface SharedExamData { questions?: SharedExamQuestion[]; answers?: Record<string, unknown>; submitted?: boolean; topic?: string }
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
    questions: Array.isArray(rawExam.questions) ? rawExam.questions.flatMap((question): SharedExamQuestion[] => {
      if (!isRecord(question) || typeof question.type !== 'string') return [];
      return [{ type: question.type, q: question.q, opts: Array.isArray(question.opts) ? question.opts : undefined }];
    }) : [],
    answers: isRecord(rawExam.answers) ? rawExam.answers : undefined,
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
  if (!show && typeof browserWindow.closeFindInSession === "function") {
    try { browserWindow.closeFindInSession(); } catch (error) { reportSwallow(error, 'ui/share.impl.ts:75'); }
  }
}

function openShareModal(sessionId?: string) {
  _shareSessionId = typeof sessionId === "string" ? sessionId : browserWindow.stateStore.read("currentSessionId");
  const overlay = document.getElementById("shareOverlay");
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
  document.getElementById("shareOverlay")!.classList.add("hidden");
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

/* Read-only message list used by loadSharedSession. Renders the
   server-projected messages without an input area, share button, or
   any editing affordances.

   P_share-declarative-turn — an assistant turn that recorded inline tool
   split points is laid out by the same React renderer the chat uses
   (react/tool-run), read-only, instead of re-splicing HTML strings here. That
   leaves this function with the prose path for everything the renderer cannot
   take: user turns, turns with no tool calls, and turns stored before
   textOffset existed (whose baked rows still ride along in `content`). */
function sharedMessageSource(message: SharedMessage): string {
  if (typeof message.rawText === "string" && message.rawText.length > 0) return message.rawText;
  if (typeof message.content === "string" && message.content.length > 0) return message.content;
  return "";
}

function renderDeclarativeSharedTurn(body: HTMLElement, message: SharedMessage) {
  if (message.role !== "assistant" || typeof message.rawText !== "string" || !message.rawText
      || !Array.isArray(message.toolCalls) || message.toolCalls.length === 0) return false;
  body.className = "msg-body content is-declarative";
  try {
    return renderSharedAssistantTurn(body, {
      id: message.id || undefined,
      clientId: message.id || undefined,
      role: "assistant",
      type: "assistant",
      rawText: message.rawText,
      html: typeof message.content === "string" ? message.content : "",
      toolCalls: message.toolCalls as unknown as readonly ToolCall[],
      reasoningContent: typeof message.reasoningContent === 'string' ? message.reasoningContent : null,
    });
  } catch (_) {
    body.className = "msg-body content";
    return false;
  }
}

function renderSharedMessageFallback(body: HTMLDivElement, message: SharedMessage, source: string) {
  let html = "";
  try {
    /* Preserve already-rendered inline rows in older saved messages. */
    if (message.role === "assistant" && typeof message.content === "string"
        && message.content.indexOf("tool-inline") !== -1) html = message.content;
    if (!html) {
      html = message.role === "assistant" && typeof browserWindow.renderAssistantHTML === "function"
        ? browserWindow.renderAssistantHTML(source)
        : (typeof browserWindow.formatMsg === "function" ? browserWindow.formatMsg(source) : ("<p>" + esc(source) + "</p>"));
    }
  } catch (_) {
    html = "<p>" + esc(source) + "</p>";
  }
  body.innerHTML = html;
}

function restoreSharedMessageExtras(body: HTMLDivElement, message: SharedMessage) {
  if (message.role !== "assistant") return;
  restorePersistedMessageExtras(body, message, "share-" + (message.id || "message"));
}

function renderSharedMessage(message: SharedMessage) {
  const div = document.createElement("div");
  div.className = "msg " + (message.role || "user");
  const body = document.createElement("div");
  body.className = "msg-body content";
  const source = sharedMessageSource(message);
  /* The offsets index raw markdown; the renderer chooses the whole branch. */
  const declarative = renderDeclarativeSharedTurn(body, message);
  if (!declarative) {
    if (body.className !== "msg-body content") body.className = "msg-body content";
    renderSharedMessageFallback(body, message, source);
  }
  div.appendChild(body);
  if (!declarative) restoreSharedMessageExtras(body, message);
  return div;
}

function prepareSharedMessageList(msgList: HTMLElement) {
  // Release React roots before any legacy child replacement.
  takeOverSharedMessageList(msgList);
  releaseSharedAssistantTurns();
  if (typeof disposeVisualizations === "function") {
    try { disposeVisualizations(msgList); } catch (error) { reportSwallow(error, 'ui/share.impl.ts:195'); }
  }
  msgList.innerHTML = "";
}

function _renderSharedMessageList(messages: SharedMessage[]) {
  const msgList = document.getElementById("msgList");
  if (!msgList) return;
  prepareSharedMessageList(msgList);
  messages.forEach(function (message) {
    if (message) msgList.appendChild(renderSharedMessage(message));
  });
}

function _switchToSharedChatView() {
  activateMainView("chatView", document);
  /* Show the read-only banner — it exists in index.html but was never
     unhidden, so shared sessions had no visible "this is not yours"
     affordance. */
  const banner = document.getElementById("sharedBanner");
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
  const inputBar = document.getElementById("chatInputBar");
  if (inputBar) inputBar.classList.add("hidden");
  const topBar = document.querySelector(".chat-top-bar");
  if (topBar) (topBar as HTMLElement).style.display = "none";
  const shareBtn = document.getElementById("shareBtn");
  if (shareBtn) shareBtn.style.display = "none";
  const composer = document.getElementById("composerRoot");
  if (composer) composer.setAttribute("aria-disabled", "true");
  const gate = document.getElementById("authGate");
  if (gate) gate.classList.add("hidden");
  const recentsPane = document.getElementById("recentsPane");
  if (recentsPane) recentsPane.classList.add("hidden");
  if (typeof browserWindow.hideGate === "function") {
    try { browserWindow.hideGate(); } catch (error) { reportSwallow(error, 'ui/share.impl.ts:326'); }
  }
}

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

function showSharedChatSession(session: SharedSession) {
  _switchToSharedChatView();
  _renderSharedMessageList(session.messages || []);
  document.documentElement.dataset.bootState = "app";
  if (typeof browserWindow.renderRecents === "function") browserWindow.renderRecents();
}

function recoverFailedSharedSessionLoad() {
  console.log("[share] load failed");
  document.documentElement.dataset.bootState = "app";
  if (typeof browserWindow.hideGate === "function") {
    try { browserWindow.hideGate(); } catch (error) { reportSwallow(error, 'ui/share.impl.ts:371'); }
  }
  const gate = document.getElementById("authGate");
  if (gate) gate.classList.add("hidden");
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
    showSharedChatSession(session);
  } catch {
    recoverFailedSharedSessionLoad();
  }
}

function prepareSharedExamState(session: { topic?: string }, exam: SharedExamData, questions: SharedExamQuestion[]) {
  const answers = exam.answers || {};
  stateStore.dispatch({ type: 'state/batch', patch: {
    examReadOnly: true,
    examQuestions: questions,
    examAnswers: answers,
    examSubmitted: !!exam.submitted,
    examTopic: exam.topic || session.topic || '',
    examCount: questions.length,
    _examInView: true,
  } });
}

function prepareSharedExamChrome(session: { topic?: string }, exam: SharedExamData) {
  activateMainView("examView", document);
  /* exam.js is lazy — the shared view's Close button uses the delegated
     data-exam-command listener, so kick off the module load now. */
  if (typeof browserWindow.__loadExamModule === "function") {
    try { browserWindow.__loadExamModule(); } catch (error) { reportSwallow(error, 'ui/share.impl.ts:397'); }
  }
  const sharedExamTitle = (exam.submitted ? "Exam Results: " : "") + (exam.topic || session.topic || "");
  const titleEl = document.getElementById("examViewTitle");
  if (titleEl) titleEl.textContent = sharedExamTitle;
  const titleBar = document.getElementById("examTitleBar");
  if (titleBar) { titleBar.textContent = sharedExamTitle; titleBar.classList.remove("hidden"); }
  document.body.classList.add("exam-active");
}

function renderSharedExamQuestions(questions: SharedExamQuestion[]) {
  const body = document.getElementById("examViewLegacyBody") || document.getElementById("examViewBody");
  if (!body) return;
  body.innerHTML = '<div id="examQuestionsContainer"></div>';
  const container = body.querySelector("#examQuestionsContainer");
  questions.forEach(function (question: SharedExamQuestion, index: number) {
    const card = document.createElement("div");
    card.className = "exam-q-card";
    card.id = "examQ" + index;
    card.setAttribute("data-idx", String(index));
    container!.appendChild(card);
    renderSharedQuestionCard(index, question);
  });
}

function renderSharedExamFooter() {
  const footer = document.getElementById("examViewLegacyFooter") || document.getElementById("examViewFooter");
  if (!footer) return;
  const closeLabel = (getCurrentLanguage() === "zh") ? "关闭" : "Close";
  renderSharedExamFooterAction(footer, closeLabel);
}

function revealSharedExam() {
  const gate = document.getElementById("authGate");
  if (gate) gate.classList.add("hidden");
  if (typeof browserWindow.hideGate === "function") {
    try { browserWindow.hideGate(); } catch (error) { reportSwallow(error, 'ui/share.impl.ts:426'); }
  }
  document.documentElement.dataset.bootState = "app";
}

async function loadSharedExamSession(session: SharedSession) {
  if (!session) return;
  try {
    const examModule = await browserWindow.__loadExamModule?.();
    examModule?.clearExamSetup?.();
    examModule?.clearExamQuestionCards?.();
  } catch (error) {
    reportSwallow(error, 'ui/share.impl.ts:loadSharedExamSession.clearReactSetup');
  }
  const exam = session.examData || {};
  const questions: SharedExamQuestion[] = Array.isArray(exam.questions) ? exam.questions : [];
  prepareSharedExamState(session, exam, questions);
  prepareSharedExamChrome(session, exam);
  renderSharedExamQuestions(questions);
  renderSharedExamFooter();
  revealSharedExam();
}

function renderSharedQuestionCard(idx: number, q: SharedExamQuestion) {
  const ph = document.getElementById("examQ" + idx);
  if (!ph) return;
  const saved = (browserWindow.stateStore.read("examAnswers") && browserWindow.stateStore.read("examAnswers")[idx]);
  const zh = getCurrentLanguage() === "zh";
  let html = '<div class="exam-q-num">' + (zh ? "题目" : "Question") + ' ' + (idx + 1) + ' / ' + Number(browserWindow.stateStore.read("examCount") || 0) + ' <span class="exam-q-type">' + esc(q.type || "") + '</span></div>';
  html += '<div class="exam-q-text">' + (typeof browserWindow.formatMsg === "function" ? browserWindow.formatMsg(String(q.q || "")) : esc(q.q || "")) + '</div>';
  if (q.type === "multiple-choice" && Array.isArray(q.opts)) {
    html += '<div class="exam-q-opts">';
    q.opts.forEach(function (o: unknown, oi: number) {
      const isSel = (saved === oi);
      html += '<div class="exam-q-opt' + (isSel ? " selected" : "") + '">' +
        '<span class="exam-q-opt-letter">' + String.fromCharCode(65 + oi) + '</span>' +
        '<span class="exam-q-opt-text">' + esc(o) + '</span>' +
        (isSel ? '<span class="exam-q-opt-check">✓</span>' : '') +
      '</div>';
    });
    html += '</div>';
  } else if (q.type === "fill-blank") {
    const v = (typeof saved === "string") ? saved : "";
    html += '<div class="exam-q-fill-display">' + esc(v) + '</div>';
  } else if (q.type === "short-answer") {
    const vv = (typeof saved === "string") ? saved : "";
    html += '<div class="exam-q-fill-display exam-q-fill-display-multiline">' + esc(vv) + '</div>';
  }
  ph.innerHTML = html;
}

export {
  toggleShareBtn,
  openShareModal, closeShareModal, selectShareVis, renderShareModal,
  createShareLink, copyShareLink, revokeShareLink, resetShareToken,
  loadSharedSession, loadSharedExamSession, renderSharedQuestionCard,
  _shareVisibility, _shareToken, _shareUrl,
};
