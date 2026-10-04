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

import { esc } from '../render/helpers.js';
import { apiFetch } from '../util/api.js';
import { stateStore } from '../state/store.js';
import { showToast } from './toast.js';
import { activateMainView } from './mainViewController.js';

import { appendToolModule, appendInlineArtifact, appendFileChangeSummaryCards } from './toolCards.js';

import { mountVisualization, disposeVisualizations } from '../render/vizStubs.js';

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
    try { window.closeFindInSession(); } catch (_) {}
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
function _renderSharedMessageList(messages) {
  var msgList = document.getElementById("msgList");
  if (!msgList) return;
  /* The share view owns #msgList exclusively. Flag the takeover so the
     React bootstrap skips mounting the message list, and unmount the
     React root if it already mounted — wiping React-owned children with
     innerHTML="" would crash React's next commit (removeChild). */
  window.__socratesShareMsgListTakeover = true;
  if (typeof window.__socratesReleaseMsgListReact === "function") {
    try { window.__socratesReleaseMsgListReact(); } catch (_) {}
  }
  /* Same hazard per message: each declarative turn is its own React root
     inside the body we are about to wipe. */
  if (typeof window.__socratesReleaseAssistantTurns === "function") {
    try { window.__socratesReleaseAssistantTurns(); } catch (_) {}
  }
  /* P_viz-dispose-shared — dispose any live visualization
     cards/ECharts instances before wiping the DOM. Mirrors the
     call in main.js#enterChat (line 1496) so the shared-session
     path doesn't leak ECharts instances, ResizeObservers, or
     window `message` listeners across navigations. */
  if (typeof disposeVisualizations === "function") {
    try { disposeVisualizations(msgList); } catch (_) {}
  }
  msgList.innerHTML = "";
  var mountTurn = typeof window.__socratesMountAssistantTurn === "function"
    ? window.__socratesMountAssistantTurn : null;
  (messages || []).forEach(function (m) {
    if (!m) return;
    var div = document.createElement("div");
    div.className = "msg " + (m.role || "user");
    var body = document.createElement("div");
    body.className = "msg-body content";
    var source = "";
    if (typeof m.rawText === "string" && m.rawText.length > 0) {
      source = m.rawText;
    } else if (typeof m.content === "string" && m.content.length > 0) {
      source = m.content;
    }
    /* The renderer refuses turns whose calls have no usable split point, so
       one call decides the whole branch: it returns false without mounting.
       The offsets index the RAW markdown, so `rawText` — not `content`, which
       is the rendered snapshot — is what the turn gets sliced against. */
    var declarative = false;
    if (m.role === "assistant" && mountTurn && typeof m.rawText === "string" && m.rawText
        && Array.isArray(m.toolCalls) && m.toolCalls.length > 0) {
      body.className = "msg-body content is-declarative";
      try {
        declarative = !!mountTurn(body, {
          id: m.id || null,
          clientId: m.id || null,
          role: "assistant",
          type: "assistant",
          rawText: m.rawText,
          html: typeof m.content === "string" ? m.content : "",
          toolCalls: m.toolCalls,
          reasoningContent: m.reasoningContent || null,
        }, { readOnly: true });
      } catch (_) {
        declarative = false;
      }
      if (!declarative) body.className = "msg-body content";
    }
    if (!declarative) {
      var renderHtml = "";
      try {
        /* P_inline-restore — turns the renderer could not take fall back to
           the stored markup. `content` is the finalized HTML snapshot, which
           for a message saved before this renderer existed already carries the
           serialized rows; re-rendering the markdown would drop them. */
        if (m.role === "assistant" && typeof m.content === "string"
            && m.content.indexOf("tool-inline") !== -1) {
          renderHtml = m.content;
        }
        if (!renderHtml) {
          renderHtml = m.role === "assistant" && typeof window.renderAssistantHTML === "function"
            ? window.renderAssistantHTML(source)
            : (typeof window.formatMsg === "function" ? window.formatMsg(source) : ("<p>" + esc(source) + "</p>"));
        }
      } catch (_) {
        renderHtml = "<p>" + esc(source) + "</p>";
      }
      body.innerHTML = renderHtml;
    }
    div.appendChild(body);
    /* P_tool-history-share — a declarative turn already renders its own
       attachments (charts, saved files) from toolCalls[], so the recovery
       pass is only for turns that fell back to stored markup. */
    if (!declarative && m.role === "assistant" && typeof window.restorePersistedMessageExtras === "function") {
      window.restorePersistedMessageExtras(body, m, "share-" + (m.id || "message"));
    } else if (!declarative && m.role === "assistant" && Array.isArray(m.toolCalls) && m.toolCalls.length > 0) {
      for (var tci = 0; tci < m.toolCalls.length; tci++) {
        var tc = m.toolCalls[tci];
        if (!tc || !tc.name) continue;
        var cardOut = null;
        if (typeof appendToolModule === "function") {
          cardOut = appendToolModule(tc.name, tc.input || {}, body, {
            restored: true,
            isError: !!tc.isError,
          });
        }
        if (tc.name === "render_visualization" && tc.input && tc.input.version === 1 && typeof mountVisualization === "function") {
          mountVisualization(tc.input, body, { toolCallId: tc.id || ("share-viz-" + tci) }).catch(function () { /* card paints its own error state */ });
        }
        if (cardOut && Array.isArray(tc.artifacts) && tc.artifacts.length > 0 && typeof appendInlineArtifact === "function") {
          for (var ai = 0; ai < tc.artifacts.length; ai++) {
            var art = tc.artifacts[ai];
            if (art && art.id) {
              var previewable = art.mimeType && (art.mimeType.indexOf("image/") === 0 || art.mimeType.indexOf("text/html") === 0);
              appendInlineArtifact(art.id, art.mimeType || "application/octet-stream", previewable ? body : cardOut, art.name);
            }
          }
        }
      }
    }
    /* The summary card is built by inserting a node after the last legacy
       .agent-tool-card, so it only applies to the fallback markup — a
       declarative turn renders its own file chip and React owns that body. */
    if (!declarative && m.role === "assistant" && typeof appendFileChangeSummaryCards === "function") {
      try { appendFileChangeSummaryCards(body); } catch (_) {}
    }
    msgList.appendChild(div);
  });
}

function _switchToSharedChatView() {
  activateMainView("chatView", document);
  /* Show the read-only banner — it exists in index.html but was never
     unhidden, so shared sessions had no visible "this is not yours"
     affordance. */
  var banner = document.getElementById("sharedBanner");
  if (banner) {
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
    try { window.hideGate(); } catch (_) {}
  }
}

async function loadSharedSession(token) {
  if (!token) return;
  try {
    var r = await apiFetch("/api/shares/" + encodeURIComponent(token), { _authEndpoint: true });
    if (!r || !r.id) throw new Error("Invalid response");
    stateStore.dispatch({ type: 'state/batch', patch: {
      topic: r.topic || '',
      currentSessionId: r.id,
      sessionTitle: r.title || null,
      domain: r.domain || null,
    } });
    stateStore.dispatch({ type: 'session/replace-messages', payload:
      (r.messages || []).map(function (m) {
        return {
          clientId: m.id || ("shared-" + Math.random().toString(36).slice(2, 10)),
          role: m.role || "user",
          /* rawText is the markdown the inline tool rows are spliced into, so
             keep it distinct from the rendered `content` snapshot. */
          rawText: m.rawText || m.content || "",
          html: "",
          type: m.role || "user",
          reasoningContent: m.reasoningContent || null,
          toolCalls: Array.isArray(m.toolCalls) ? m.toolCalls : [],
          restoredFromHistory: true,
        };
      })
    });
    if (r.kind === "exam" && r.examData) {
      /* Awaited so a render failure lands in the catch below (toast + gate
         teardown) instead of escaping as an unhandled rejection. */
      await loadSharedExamSession(r);
      return;
    }
    _switchToSharedChatView();
    _renderSharedMessageList(r.messages || []);
    document.documentElement.dataset.bootState = "app";
    if (typeof window.renderRecents === "function") window.renderRecents();
  } catch {
    console.log("[share] load failed");
    document.documentElement.dataset.bootState = "app";
    if (typeof window.hideGate === "function") {
      try { window.hideGate(); } catch (_) {}
    }
    var gate = document.getElementById("authGate");
    if (gate) gate.classList.add("hidden");
    showToast("Shared session not found or has expired.");
  }
}

async function loadSharedExamSession(session) {
  if (!session) return;
  var exam = (session && session.examData) || {};
  var questions = Array.isArray(exam.questions) ? exam.questions : [];
  var answers = (exam && exam.answers) || {};
  stateStore.dispatch({ type: 'state/batch', patch: {
    examReadOnly: true,
    examQuestions: questions,
    examAnswers: answers,
    examSubmitted: !!exam.submitted,
    examTopic: exam.topic || session.topic || '',
    examCount: questions.length,
    _examInView: true,
  } });
  activateMainView("examView", document);
  /* exam.js is lazy — the shared view's Close button uses the delegated
     data-exam-command listener, so kick off the module load now. */
  if (typeof window.__loadExamModule === "function") {
    try { window.__loadExamModule(); } catch (_) {}
  }
  var sharedExamTitle = (exam.submitted ? "Exam Results: " : "") + (exam.topic || session.topic || "");
  var titleEl = document.getElementById("examViewTitle");
  if (titleEl) titleEl.textContent = sharedExamTitle;
  var titleBar = document.getElementById("examTitleBar");
  if (titleBar) { titleBar.textContent = sharedExamTitle; titleBar.classList.remove("hidden"); }
  document.body.classList.add("exam-active");
  var body = document.getElementById("examViewBody");
  if (body) {
    body.innerHTML = '<div id="examQuestionsContainer"></div>';
    var container = body.querySelector("#examQuestionsContainer");
    questions.forEach(function (q, idx) {
      var card = document.createElement("div");
      card.className = "exam-q-card";
      card.id = "examQ" + idx;
      card.setAttribute("data-idx", String(idx));
      container.appendChild(card);
      renderSharedQuestionCard(idx, q);
    });
  }
  var footer = document.getElementById("examViewFooter");
  if (footer) {
    var closeLabel = (window._currentLang === "zh") ? "关闭" : "Close";
    footer.innerHTML = '<button class="exam-btn secondary" data-exam-command="close">' + closeLabel + '</button>';
  }
  var gate = document.getElementById("authGate");
  if (gate) gate.classList.add("hidden");
  if (typeof window.hideGate === "function") {
    try { window.hideGate(); } catch (_) {}
  }
  document.documentElement.dataset.bootState = "app";
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
    html += '<input class="exam-q-fill-input" value="' + esc(v) + '" readonly>';
  } else if (q.type === "short-answer") {
    var vv = (typeof saved === "string") ? saved : "";
    html += '<textarea class="exam-q-fill-input" readonly rows="3" style="min-height:60px;resize:vertical">' + esc(vv) + '</textarea>';
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
