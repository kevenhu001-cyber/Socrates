/* ui/share.js — Wave 3 of main-js-split plan.
 * Share modal: create, copy, revoke share links for sessions. Also includes
 * read-only session loading from share tokens.
 * Extracted from main.js (post-Wave-2): toggleShareBtn L10076, openShareModal
 * L10107, loadSharedSession L10201, renderSharedQuestionCard L10390, etc.
 *
 * Touches via window.*:
 *   state, CURRENT_USER, apiFetch, esc, formatMsg, t, showToast
 *
 * React migration bridge — publishes state so the React compatibility root
 * renders the modal content. Installed by
 * frontend/src/react/shareModal/shareModalStore.ts under `?react=1`;
 * legacy mode never sees a subscriber so the helpers are cheap no-ops.
 */

import { esc } from '../render/helpers.ts';
import { apiFetch } from '../util/api.ts';
import { stateStore } from '../state/store.js';
import { showToast } from './toast.js';
import { activateMainView } from './mainViewController.js';
import { takeOverSharedMessageList } from './msgListMount.ts';
import { renderSharedAssistantTurn, releaseSharedAssistantTurns } from './assistantTurnRenderer.ts';

import { appendToolModule, appendInlineArtifact, appendFileChangeSummaryCards } from './toolCards.js';

import { mountVisualization, disposeVisualizations } from '../render/vizStubs.js';
import { reportSwallow } from '../util/reportSwallow.ts';
import { renderSharedExamFooter as renderSharedExamFooterAction } from '../react/exam/sharedExamFooterHost.tsx';

var _shareSessionId = null;
var _shareVisibility = "public";
var _shareToken = null;
var _shareUrl = "";
var _shareStatus = "";
var _shareError = "";

/* React migration bridge — publishes current state so the React
   compatibility root can render the modal content via useSyncExternalStore. */
function _publishShareState() {
  try {
    var bridge = window.__socratesShareBridge;
    if (bridge && typeof bridge.publish === "function") {
      bridge.publish({
        isOpen: !!document.getElementById("shareOverlay") && !document.getElementById("shareOverlay").classList.contains("hidden"),
        visibility: _shareVisibility,
        shareToken: _shareToken,
        shareUrl: _shareUrl,
        status: _shareStatus,
        error: _shareError,
      });
    }
  } catch (_) { /* swallow — bridge is best-effort */ }
}

/* React owns the share modal unconditionally under the always-on
   runtime. `renderShareModal` is kept as a no-op for legacy callers;
   state mutations still feed the React bridge via `_publishShareState`. */

function toggleShareBtn() {
  var btn = document.getElementById("shareBtn");
  if (!btn) return;
  /* P_share-btn-hidden — the .share-btn starts with class
     "share-btn hidden" (index.html:388). The .hidden utility class
     is `.hidden { display: none !important }` (styles.css:1979),
     which beats any inline `style.display` we set. We must toggle
     the class itself, not the style attribute. */
  var show = !!(window.CURRENT_USER && (window.stateStore.read("currentSessionId") || window.stateStore.read("_examInView")));
  btn.classList.toggle("hidden", !show);
  /* P0.2 — the in-session Find button lives next to Share in the
     top bar and shares the exact same visibility rule (only useful
     when a conversation is on screen). Toggle it in lock-step here
     so we don't need a second lifecycle hook. When hidden, also make
     sure the find bar itself is dismissed. */
  var findBtn = document.getElementById("findBtn");
  if (findBtn) findBtn.classList.toggle("hidden", !show);
  if (!show && typeof window.closeFindInSession === "function") {
    try { window.closeFindInSession(); } catch (error) { reportSwallow(error, 'ui/share.impl.mjs:75'); }
  }
}

function openShareModal(sessionId) {
  _shareSessionId = typeof sessionId === "string" ? sessionId : window.stateStore.read("currentSessionId");
  var overlay = document.getElementById("shareOverlay");
  if (!overlay) return;
  _shareToken = null;
  _shareUrl = "";
  _shareStatus = "";
  _shareError = "";
  overlay.classList.remove("hidden");
  selectShareVis("public");
  _publishShareState();
}

function closeShareModal() {
  document.getElementById("shareOverlay").classList.add("hidden");
  _publishShareState();
}

function selectShareVis(vis) {
  if (vis !== "public" && vis !== "private") vis = "public";
  _shareVisibility = vis;
  _publishShareState();
}

function renderShareModal() {
  // no-op: React owns #shareOverlay and reads state from the bridge.
}

function _setShareError(msg) {
  _shareError = msg || "";
  _publishShareState();
}

function _setShareStatus(msg) {
  _shareStatus = msg || "";
  _publishShareState();
}

async function createShareLink() {
  var sessionId = _shareSessionId || window.stateStore.read("currentSessionId");
  if (!sessionId) { _setShareError("No active session"); return; }
  _setShareError("");
  _setShareStatus("Creating share link…");
  try {
    var r = await apiFetch("/api/sessions/" + encodeURIComponent(sessionId) + "/share", {
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
    _setShareError("Error: " + (e.message || "network error"));
  }
}

function copyShareLink() {
  if (!_shareUrl) return;
  navigator.clipboard.writeText(_shareUrl).then(function () {
    _setShareStatus("Link copied to clipboard.");
  }).catch(function () {
    var input = document.getElementById("shareLinkInput");
    if (input) { input.select(); document.execCommand("copy"); _setShareStatus("Link copied to clipboard."); }
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
  var sessionId = _shareSessionId || window.stateStore.read("currentSessionId");
  if (!_shareToken || !sessionId) return;
  try {
    await apiFetch("/api/sessions/" + encodeURIComponent(sessionId) + "/share", { method: "DELETE" });
    _shareToken = null;
    _shareUrl = "";
    _setShareStatus("Share link revoked.");
    renderShareModal();
  } catch (e) {
    _setShareError("Error revoking: " + (e.message || "network error"));
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
function sharedMessageSource(message) {
  if (typeof message.rawText === "string" && message.rawText.length > 0) return message.rawText;
  if (typeof message.content === "string" && message.content.length > 0) return message.content;
  return "";
}

function renderDeclarativeSharedTurn(body, message) {
  if (message.role !== "assistant" || typeof message.rawText !== "string" || !message.rawText
      || !Array.isArray(message.toolCalls) || message.toolCalls.length === 0) return false;
  body.className = "msg-body content is-declarative";
  try {
    return renderSharedAssistantTurn(body, {
      id: message.id || null,
      clientId: message.id || null,
      role: "assistant",
      type: "assistant",
      rawText: message.rawText,
      html: typeof message.content === "string" ? message.content : "",
      toolCalls: message.toolCalls,
      reasoningContent: message.reasoningContent || null,
    });
  } catch (_) {
    body.className = "msg-body content";
    return false;
  }
}

function renderSharedMessageFallback(body, message, source) {
  var html = "";
  try {
    /* Preserve already-rendered inline rows in older saved messages. */
    if (message.role === "assistant" && typeof message.content === "string"
        && message.content.indexOf("tool-inline") !== -1) html = message.content;
    if (!html) {
      html = message.role === "assistant" && typeof window.renderAssistantHTML === "function"
        ? window.renderAssistantHTML(source)
        : (typeof window.formatMsg === "function" ? window.formatMsg(source) : ("<p>" + esc(source) + "</p>"));
    }
  } catch (_) {
    html = "<p>" + esc(source) + "</p>";
  }
  body.innerHTML = html;
}

function appendSharedToolArtifacts(body, message) {
  var calls = message.toolCalls;
  if (!Array.isArray(calls)) return;
  for (var callIndex = 0; callIndex < calls.length; callIndex++) {
    var call = calls[callIndex];
    if (!call || !call.name) continue;
    var card = typeof appendToolModule === "function"
      ? appendToolModule(call.name, call.input || {}, body, { restored: true, isError: !!call.isError })
      : null;
    if (call.name === "render_visualization" && call.input && call.input.version === 1
        && typeof mountVisualization === "function") {
      mountVisualization(call.input, body, { toolCallId: call.id || ("share-viz-" + callIndex) })
        .catch(function () { /* card paints its own error state */ });
    }
    appendSharedArtifacts(body, card, call.artifacts);
  }
}

function appendSharedArtifacts(body, card, artifacts) {
  if (!card || !Array.isArray(artifacts) || !artifacts.length
      || typeof appendInlineArtifact !== "function") return;
  for (var index = 0; index < artifacts.length; index++) {
    var artifact = artifacts[index];
    if (!artifact || !artifact.id) continue;
    var mimeType = artifact.mimeType || "application/octet-stream";
    var previewable = mimeType.indexOf("image/") === 0 || mimeType.indexOf("text/html") === 0;
    appendInlineArtifact(artifact.id, mimeType, previewable ? body : card, artifact.name);
  }
}

function restoreSharedMessageExtras(body, message) {
  if (message.role !== "assistant") return;
  if (typeof window.restorePersistedMessageExtras === "function") {
    window.restorePersistedMessageExtras(body, message, "share-" + (message.id || "message"));
  } else if (Array.isArray(message.toolCalls) && message.toolCalls.length > 0) {
    appendSharedToolArtifacts(body, message);
  }
  if (typeof appendFileChangeSummaryCards === "function") {
    try { appendFileChangeSummaryCards(body); } catch (error) { reportSwallow(error, 'ui/share.impl.mjs:290'); }
  }
}

function renderSharedMessage(message) {
  var div = document.createElement("div");
  div.className = "msg " + (message.role || "user");
  var body = document.createElement("div");
  body.className = "msg-body content";
  var source = sharedMessageSource(message);
  /* The offsets index raw markdown; the renderer chooses the whole branch. */
  var declarative = renderDeclarativeSharedTurn(body, message);
  if (!declarative) {
    if (body.className !== "msg-body content") body.className = "msg-body content";
    renderSharedMessageFallback(body, message, source);
  }
  div.appendChild(body);
  if (!declarative) restoreSharedMessageExtras(body, message);
  return div;
}

function prepareSharedMessageList(msgList) {
  // Release React roots before any legacy child replacement.
  takeOverSharedMessageList(msgList);
  releaseSharedAssistantTurns();
  if (typeof disposeVisualizations === "function") {
    try { disposeVisualizations(msgList); } catch (error) { reportSwallow(error, 'ui/share.impl.mjs:195'); }
  }
  msgList.innerHTML = "";
}

function _renderSharedMessageList(messages) {
  var msgList = document.getElementById("msgList");
  if (!msgList) return;
  prepareSharedMessageList(msgList);
  (messages || []).forEach(function (message) {
    if (message) msgList.appendChild(renderSharedMessage(message));
  });
}

function _switchToSharedChatView() {
  activateMainView("chatView", document);
  /* Show the read-only banner — it exists in index.html but was never
     unhidden, so shared sessions had no visible "this is not yours"
     affordance. */
  var banner = document.getElementById("sharedBanner");
  if (banner) {
    // The transcript was lifted out of mainInner during the shell migration.
    // Its read-only notice must follow it instead of staying in the hidden landing container.
    document.getElementById("chatPage")?.prepend(banner);
    banner.classList.remove("hidden");
    var label = banner.querySelector("[data-i18n-key='share.readOnlyBanner']");
    if (label && typeof window.t === "function") {
      var text = window.t("share.readOnlyBanner");
      if (text && text !== "share.readOnlyBanner") label.textContent = text;
    }
  }
  var inputBar = document.getElementById("chatInputBar");
  if (inputBar) inputBar.classList.add("hidden");
  var topBar = document.querySelector(".chat-top-bar");
  if (topBar) topBar.style.display = "none";
  var shareBtn = document.getElementById("shareBtn");
  if (shareBtn) shareBtn.style.display = "none";
  var composer = document.getElementById("composerRoot");
  if (composer) composer.setAttribute("aria-disabled", "true");
  var gate = document.getElementById("authGate");
  if (gate) gate.classList.add("hidden");
  var recentsPane = document.getElementById("recentsPane");
  if (recentsPane) recentsPane.classList.add("hidden");
  if (typeof window.hideGate === "function") {
    try { window.hideGate(); } catch (error) { reportSwallow(error, 'ui/share.impl.mjs:326'); }
  }
}

function restoreSharedMessage(message) {
  return {
    clientId: message.id || ("shared-" + Math.random().toString(36).slice(2, 10)),
    role: message.role || "user",
    /* rawText is the markdown the inline tool rows are spliced into, so
       keep it distinct from the rendered `content` snapshot. */
    rawText: message.rawText || message.content || "",
    html: "",
    type: message.role || "user",
    reasoningContent: message.reasoningContent || null,
    toolCalls: Array.isArray(message.toolCalls) ? message.toolCalls : [],
    restoredFromHistory: true,
  };
}

function installSharedSessionState(session) {
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

function showSharedChatSession(session) {
  _switchToSharedChatView();
  _renderSharedMessageList(session.messages || []);
  document.documentElement.dataset.bootState = "app";
  if (typeof window.renderRecents === "function") window.renderRecents();
}

function recoverFailedSharedSessionLoad() {
  console.log("[share] load failed");
  document.documentElement.dataset.bootState = "app";
  if (typeof window.hideGate === "function") {
    try { window.hideGate(); } catch (error) { reportSwallow(error, 'ui/share.impl.mjs:371'); }
  }
  var gate = document.getElementById("authGate");
  if (gate) gate.classList.add("hidden");
  showToast("Shared session not found or has expired.");
}

async function loadSharedSession(token) {
  if (!token) return;
  try {
    var session = await apiFetch("/api/shares/" + encodeURIComponent(token), { _authEndpoint: true });
    if (!session || !session.id) throw new Error("Invalid response");
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

function prepareSharedExamState(session, exam, questions) {
  var answers = exam.answers || {};
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

function prepareSharedExamChrome(session, exam) {
  activateMainView("examView", document);
  /* exam.js is lazy — the shared view's Close button uses the delegated
     data-exam-command listener, so kick off the module load now. */
  if (typeof window.__loadExamModule === "function") {
    try { window.__loadExamModule(); } catch (error) { reportSwallow(error, 'ui/share.impl.mjs:397'); }
  }
  var sharedExamTitle = (exam.submitted ? "Exam Results: " : "") + (exam.topic || session.topic || "");
  var titleEl = document.getElementById("examViewTitle");
  if (titleEl) titleEl.textContent = sharedExamTitle;
  var titleBar = document.getElementById("examTitleBar");
  if (titleBar) { titleBar.textContent = sharedExamTitle; titleBar.classList.remove("hidden"); }
  document.body.classList.add("exam-active");
}

function renderSharedExamQuestions(questions) {
  var body = document.getElementById("examViewLegacyBody") || document.getElementById("examViewBody");
  if (!body) return;
  body.innerHTML = '<div id="examQuestionsContainer"></div>';
  var container = body.querySelector("#examQuestionsContainer");
  questions.forEach(function (question, index) {
    var card = document.createElement("div");
    card.className = "exam-q-card";
    card.id = "examQ" + index;
    card.setAttribute("data-idx", String(index));
    container.appendChild(card);
    renderSharedQuestionCard(index, question);
  });
}

function renderSharedExamFooter() {
  var footer = document.getElementById("examViewLegacyFooter") || document.getElementById("examViewFooter");
  if (!footer) return;
  var closeLabel = (window._currentLang === "zh") ? "关闭" : "Close";
  renderSharedExamFooterAction(footer, closeLabel);
}

function revealSharedExam() {
  var gate = document.getElementById("authGate");
  if (gate) gate.classList.add("hidden");
  if (typeof window.hideGate === "function") {
    try { window.hideGate(); } catch (error) { reportSwallow(error, 'ui/share.impl.mjs:426'); }
  }
  document.documentElement.dataset.bootState = "app";
}

async function loadSharedExamSession(session) {
  if (!session) return;
  try {
    const examModule = await window.__loadExamModule?.();
    examModule?.clearExamSetup?.();
    examModule?.clearExamQuestionCards?.();
  } catch (error) {
    reportSwallow(error, 'ui/share.impl.mjs:loadSharedExamSession.clearReactSetup');
  }
  var exam = session.examData || {};
  var questions = Array.isArray(exam.questions) ? exam.questions : [];
  prepareSharedExamState(session, exam, questions);
  prepareSharedExamChrome(session, exam);
  renderSharedExamQuestions(questions);
  renderSharedExamFooter();
  revealSharedExam();
}

function renderSharedQuestionCard(idx, q) {
  var ph = document.getElementById("examQ" + idx);
  if (!ph) return;
  var saved = (window.stateStore.read("examAnswers") && window.stateStore.read("examAnswers")[idx]);
  var zh = window._currentLang === "zh";
  var html = '<div class="exam-q-num">' + (zh ? "题目" : "Question") + ' ' + (idx + 1) + ' / ' + (window.stateStore.read("examCount") || 0) + ' <span class="exam-q-type">' + esc(q.type || "") + '</span></div>';
  html += '<div class="exam-q-text">' + (typeof window.formatMsg === "function" ? window.formatMsg(q.q || "") : esc(q.q || "")) + '</div>';
  if (q.type === "multiple-choice" && Array.isArray(q.opts)) {
    html += '<div class="exam-q-opts">';
    q.opts.forEach(function (o, oi) {
      var isSel = (saved === oi);
      html += '<div class="exam-q-opt' + (isSel ? " selected" : "") + '">' +
        '<span class="exam-q-opt-letter">' + String.fromCharCode(65 + oi) + '</span>' +
        '<span class="exam-q-opt-text">' + esc(o) + '</span>' +
        (isSel ? '<span class="exam-q-opt-check">✓</span>' : '') +
      '</div>';
    });
    html += '</div>';
  } else if (q.type === "fill-blank") {
    var v = (typeof saved === "string") ? saved : "";
    html += '<div class="exam-q-fill-display">' + esc(v) + '</div>';
  } else if (q.type === "short-answer") {
    var vv = (typeof saved === "string") ? saved : "";
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
