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
  var show = !!(window.CURRENT_USER && (window.state.session.currentSessionId || window.state._examInView));
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

function toggleChatTopBarEls(show) {
  var els = document.querySelectorAll(".chat-top-bar .btn-group .icon-btn, .chat-top-bar .btn-group .start-btn");
  els.forEach(function (el) { el.style.display = show ? "" : "none"; });
  /* P_mobile-topbar — the mobile mode switcher (#mobileMode) and the
     incognito toggle (#mobileIncognitoBtn) live in the new top-bar, not
     in the legacy .chat-top-bar selectors above. They are only useful
     while the user is composing the first message (topic-setup screen);
     once a conversation starts they should be hidden so the chat-view
     header reads cleanly. We mirror the show flag onto their `display`
     style here so every existing toggleChatTopBarEls(true|false) call
     site (main.js + exam.js + sidebar/nav.js) automatically hides them
     when the conversation starts and re-shows them on resetApp().
     Note: #modeSegmentedTop is the DESKTOP Chat/Tutor pill (CSS hides it
     under 640px in favor of #mobileMode). It must NOT be in this list —
     toggling its inline `style.display` here would invisibly defeat the
     desktop mode switcher on chat start. */
  var mobileEls = document.querySelectorAll("#mobileMode, #mobileIncognitoBtn");
  mobileEls.forEach(function (el) { el.style.display = show ? "none" : ""; });
}

function _show(el) { if (el) el.classList.remove("hidden"); }
function _hide(el) { if (el) el.classList.add("hidden"); }

function openShareModal() {
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
  var sessionId = window.state.session.currentSessionId;
  if (!sessionId) { _setShareError("No active session"); return; }
  _setShareError("");
  _setShareStatus("Creating share link…");
  try {
    var r = await apiFetch("/api/sessions/" + encodeURIComponent(sessionId) + "/share", {
      method: "POST",
      body: { visibility: _shareVisibility },
      timeoutMs: 8000,
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

function showShareLink() {
  renderShareModal();
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

async function revokeShareLink() {
  var sessionId = window.state.session.currentSessionId;
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
   any editing affordances. Also restores tool-call cards (including
   artifact images) when the persisted message has toolCalls data. */
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
  /* P_viz-dispose-shared — dispose any live visualization
     cards/ECharts instances before wiping the DOM. Mirrors the
     call in main.js#enterChat (line 1496) so the shared-session
     path doesn't leak ECharts instances, ResizeObservers, or
     window `message` listeners across navigations. */
  if (typeof window.disposeVisualizations === "function") {
    try { window.disposeVisualizations(msgList); } catch (_) {}
  }
  msgList.innerHTML = "";
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
    var renderHtml = "";
    try {
      /* P_inline-restore — assistant turns that recorded inline tool
         split points rebuild the exact text→row→text layout, matching
         the live chat and history views. The offsets index into the
         RAW markdown, so only rebuild when rawText is available; the
         public-share projection omits rawText but its `content` is the
         finalized HTML snapshot which already carries the serialized
         rows — reuse it directly in that case. */
      if (m.role === "assistant" && typeof m.rawText === "string" && m.rawText
          && typeof window.rebuildAssistantHtmlWithInlineTools === "function") {
        renderHtml = window.rebuildAssistantHtmlWithInlineTools(m.rawText, m.toolCalls) || "";
      } else if (m.role === "assistant" && typeof m.content === "string"
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
    div.appendChild(body);
    /* P_tool-history-share — restore tool-call cards (including
       artifact images) when viewing a shared session that has
       saved tool entries. Reuses appendToolModule and
       appendInlineArtifact from the live chat path. */
    if (m.role === "assistant" && typeof window.restorePersistedMessageExtras === "function") {
      window.restorePersistedMessageExtras(body, m, "share-" + (m.id || "message"));
    } else if (m.role === "assistant" && Array.isArray(m.toolCalls) && m.toolCalls.length > 0) {
      for (var tci = 0; tci < m.toolCalls.length; tci++) {
        var tc = m.toolCalls[tci];
        if (!tc || !tc.name) continue;
        var cardOut = null;
        if (typeof window.appendToolModule === "function") {
          cardOut = window.appendToolModule(tc.name, tc.input || {}, body, {
            restored: true,
            isError: !!tc.isError,
          });
        }
        if (tc.name === "render_visualization" && tc.input && tc.input.version === 1 && typeof window.mountVisualization === "function") {
          window.mountVisualization(tc.input, body, { toolCallId: tc.id || ("share-viz-" + tci) });
        }
        if (cardOut && Array.isArray(tc.artifacts) && tc.artifacts.length > 0 && typeof window.appendInlineArtifact === "function") {
          for (var ai = 0; ai < tc.artifacts.length; ai++) {
            var art = tc.artifacts[ai];
            if (art && art.id) {
              var previewable = art.mimeType && (art.mimeType.indexOf("image/") === 0 || art.mimeType.indexOf("text/html") === 0);
              window.appendInlineArtifact(art.id, art.mimeType || "application/octet-stream", previewable ? body : cardOut, art.name);
            }
          }
        }
      }
    }
    if (m.role === "assistant" && typeof window.appendFileChangeSummaryCards === "function") {
      try { window.appendFileChangeSummaryCards(body); } catch (_) {}
    }
    msgList.appendChild(div);
  });
}

function _switchToSharedChatView() {
  ["topicSetup", "diagnosticView", "examView"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  });
  var chatView = document.getElementById("chatView");
  if (chatView) chatView.classList.remove("hidden");
  var inputBar = document.getElementById("chatInputBar");
  if (inputBar) inputBar.classList.add("hidden");
  var topBar = document.querySelector(".chat-top-bar");
  if (topBar) topBar.style.display = "none";
  var shareBtn = document.getElementById("shareBtn");
  if (shareBtn) shareBtn.style.display = "none";
  var composer = document.getElementById("chatComposerRoot");
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
    /* Write through the namespaced proxy instead of replacing
       state.session wholesale. The previous implementation did
       `window.state.session = r.session`, which clobbered every
       other sub-namespace (kb, search, call, ui, exam) and the
       Proxy's per-property semantics — subsequent reads via
       `state.session.kb` etc. silently returned undefined. */
    var s = window.state;
    if (s && s.session) {
      try { s.session.topic = r.topic || ""; } catch (_) {}
      try { s.session.currentSessionId = r.id; } catch (_) {}
      try { s.session.sessionTitle = r.title || null; } catch (_) {}
      try { s.session.domain = r.domain || null; } catch (_) {}
      try { s.session.kind = r.kind || "chat"; } catch (_) {}
    }
    if (s && s.topic !== undefined) {
      try { s.topic = r.topic || ""; } catch (_) {}
      try { s.currentSessionId = r.id; } catch (_) {}
    }
    if (s && Array.isArray(s.messages)) {
      s.messages = (r.messages || []).map(function (m) {
        return {
          clientId: m.id || ("shared-" + Math.random().toString(36).slice(2, 10)),
          role: m.role || "user",
          rawText: m.content || "",
          html: "",
          type: m.role || "user",
          reasoningContent: m.reasoningContent || null,
          toolCalls: Array.isArray(m.toolCalls) ? m.toolCalls : [],
          restoredFromHistory: true,
        };
      });
    }
    if (r.kind === "exam" && r.examData) {
      loadSharedExamSession(r, token);
      return;
    }
    _switchToSharedChatView();
    _renderSharedMessageList(r.messages || []);
    document.documentElement.dataset.bootState = "app";
    if (typeof window.renderRecents === "function") window.renderRecents();
  } catch (e) {
    console.log("[share] load failed");
    document.documentElement.dataset.bootState = "app";
    if (typeof window.hideGate === "function") {
      try { window.hideGate(); } catch (_) {}
    }
    var gate = document.getElementById("authGate");
    if (gate) gate.classList.add("hidden");
    if (typeof window.showToast === "function") {
      window.showToast("Shared session not found or has expired.");
    }
  }
}

async function loadSharedExamSession(session, token) {
  if (!session) return;
  var exam = (session && session.examData) || {};
  var questions = Array.isArray(exam.questions) ? exam.questions : [];
  var answers = (exam && exam.answers) || {};
  var s = window.state;
  if (s) {
    if (s.exam) {
      try { s.exam.readOnly = true; s.exam.questions = questions; s.exam.answers = answers; s.exam.submitted = !!exam.submitted; s.exam.topic = exam.topic || session.topic || ""; s.exam.count = questions.length; } catch (_) {}
    }
    try { s.examReadOnly = true; } catch (_) {}
    try { s._examInView = true; } catch (_) {}
  }
  ["topicSetup", "diagnosticView", "chatView"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  });
  var examView = document.getElementById("examView");
  if (examView) examView.classList.remove("hidden");
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
    footer.innerHTML = '<button class="exam-btn secondary" onclick="closeExamView()">' + closeLabel + '</button>';
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
  var saved = (window.state && window.state.examAnswers && window.state.examAnswers[idx]);
  var zh = window._currentLang === "zh";
  var html = '<div class="exam-q-num">' + (zh ? "题目" : "Question") + ' ' + (idx + 1) + ' / ' + ((window.state && window.state.examCount) || 0) + ' <span class="exam-q-type">' + esc(q.type || "") + '</span></div>';
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
  toggleShareBtn, toggleChatTopBarEls,
  openShareModal, closeShareModal, selectShareVis, renderShareModal,
  createShareLink, copyShareLink, revokeShareLink,
  loadSharedSession, loadSharedExamSession, renderSharedQuestionCard,
  _shareVisibility, _shareToken, _shareUrl,
};
