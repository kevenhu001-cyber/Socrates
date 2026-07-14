/* ui/share.js — Wave 3 of main-js-split plan.
 * Share modal: create, copy, revoke share links for sessions. Also includes
 * read-only session loading from share tokens.
 * Extracted from main.js (post-Wave-2): toggleShareBtn L10076, openShareModal
 * L10107, loadSharedSession L10201, renderSharedQuestionCard L10390, etc.
 *
 * Touches via window.*:
 *   state, CURRENT_USER, apiFetch, esc, formatMsg, t, showToast
 */

var _shareVisibility = "public";
var _shareToken = null;
var _shareUrl = "";

function toggleShareBtn() {
  var btn = document.getElementById("shareBtn");
  if (!btn) return;
  if (window.CURRENT_USER && (window.state.session.currentSessionId || window.state._examInView)) {
    btn.style.display = "inline-flex";
  } else {
    btn.style.display = "none";
  }
}

function toggleChatTopBarEls(show) {
  var els = document.querySelectorAll(".chat-top-bar .btn-group .icon-btn, .chat-top-bar .btn-group .start-btn");
  els.forEach(function (el) { el.style.display = show ? "" : "none"; });
}

function openShareModal() {
  var overlay = document.getElementById("shareOverlay");
  if (!overlay) return;
  _shareToken = null;
  _shareUrl = "";
  overlay.classList.remove("hidden");
  selectShareVis("public");
  renderShareModal();
}

function closeShareModal() {
  document.getElementById("shareOverlay").classList.add("hidden");
}

function selectShareVis(vis) {
  _shareVisibility = vis;
  var pub = document.getElementById("shareOptPublic");
  var pri = document.getElementById("shareOptPrivate");
  if (pub) pub.className = vis === "public" ? "share-vis-opt selected" : "share-vis-opt";
  if (pri) pri.className = vis === "private" ? "share-vis-opt selected" : "share-vis-opt";
  var btn = document.getElementById("shareCreateBtn");
  if (btn) btn.textContent = "Create " + vis + " link";
}

async function createShareLink() {
  var sessionId = window.state.session.currentSessionId;
  if (!sessionId) { window.showToast("No active session"); return; }
  try {
    var r = await window.apiFetch("/api/shares", {
      method: "POST",
      body: { sessionId: sessionId, visibility: _shareVisibility },
      timeoutMs: 8000,
    });
    if (r && r.token) {
      _shareToken = r.token;
      _shareUrl = location.origin + "?share=" + encodeURIComponent(r.token);
      showShareLink();
    } else {
      window.showToast("Failed to create share link");
    }
  } catch (e) {
    window.showToast("Error: " + (e.message || "network error"));
  }
}

function showShareLink() {
  var input = document.getElementById("shareLinkInput");
  if (input) { input.value = _shareUrl; input.style.display = ""; }
  var createBtn = document.getElementById("shareCreateBtn");
  if (createBtn) createBtn.style.display = "none";
}

function copyShareLink() {
  if (!_shareUrl) return;
  navigator.clipboard.writeText(_shareUrl).then(function () {
    window.showToast("Link copied");
  }).catch(function () {
    var input = document.getElementById("shareLinkInput");
    if (input) { input.select(); document.execCommand("copy"); window.showToast("Link copied"); }
  });
}

async function revokeShareLink() {
  if (!_shareToken) return;
  try {
    await window.apiFetch("/api/shares/" + encodeURIComponent(_shareToken), { method: "DELETE" });
    _shareToken = null;
    _shareUrl = "";
    var input = document.getElementById("shareLinkInput");
    if (input) { input.value = ""; input.style.display = "none"; }
    document.getElementById("shareCreateBtn").style.display = "";
    window.showToast("Link revoked");
  } catch (e) {
    window.showToast("Error revoking: " + (e.message || "network error"));
  }
}

function renderShareModal() {
}

async function loadSharedSession(token) {
  if (!token) return;
  try {
    var r = await window.apiFetch("/api/shares/" + encodeURIComponent(token));
    if (r && r.session) {
      window.state.session = r.session;
      window.state.messages = r.session.messages || [];
      window.state.topic = r.session.topic || "";
      window.state.currentSessionId = r.session.id;
      document.documentElement.dataset.bootState = "app";
      document.getElementById("authGate").classList.add("hidden");
      window.renderRecents();
      window.renderRecents();
      if (typeof window.startRender === "function") window.startRender();
    } else {
      throw new Error("Invalid response");
    }
  } catch (e) {
    console.warn("[share] load failed:", e);
    document.documentElement.dataset.bootState = "app";
    document.getElementById("authGate").classList.add("hidden");
    window.showToast("Shared session not found or has expired.");
  }
}

async function loadSharedExamSession(session, token) {
  if (!session) return;
  window.state.session = session;
  window.state._examInView = true;
  window.state.examReadOnly = true;
  window.state.examQuestions = session.examData ? session.examData.questions || [] : [];
  window.state.examTopic = session.examData ? session.examData.topic : "";
  window.state.examCount = window.state.examQuestions.length;
  window.state.examAnswers = session.examData ? session.examData.answers || {} : {};
  window.state.examSubmitted = !!session.examData;
  document.documentElement.dataset.bootState = "app";
  document.getElementById("authGate").classList.add("hidden");
}

function renderSharedQuestionCard(idx, q) {
  var ph = document.getElementById("examQ" + idx);
  if (!ph) return;
  var html = '<div class="exam-q-num">Question ' + (idx + 1) + ' of ' + window.state.examCount + ' <span class="exam-q-type">' + q.type + '</span></div>';
  html += '<div class="exam-q-text">' + window.formatMsg(q.q) + '</div>';
  var saved = window.state.examAnswers && window.state.examAnswers[idx];
  if (q.type === "multiple-choice" && q.opts) {
    html += '<div class="exam-q-opts">';
    q.opts.forEach(function (o, oi) {
      var isSel = (saved === oi);
      html += '<div class="exam-q-opt' + (isSel ? " selected" : "") + '">' +
        '<span class="exam-q-opt-letter">' + String.fromCharCode(65 + oi) + '</span>' +
        '<span class="exam-q-opt-text">' + window.esc(o) + '</span>' +
        (isSel ? '<span class="exam-q-opt-check">✓</span>' : '') +
      '</div>';
    });
    html += '</div>';
  } else if (q.type === "fill-blank") {
    var v = (typeof saved === "string") ? saved : "";
    html += '<input class="exam-q-fill-input" value="' + window.esc(v) + '" readonly>';
  } else if (q.type === "short-answer") {
    var vv = (typeof saved === "string") ? saved : "";
    html += '<textarea class="exam-q-fill-input" readonly rows="3" style="min-height:60px;resize:vertical">' + window.esc(vv) + '</textarea>';
  }
  ph.innerHTML = html;
}

export {
  toggleShareBtn, toggleChatTopBarEls,
  openShareModal, closeShareModal, selectShareVis,
  createShareLink, copyShareLink, revokeShareLink,
  loadSharedSession, loadSharedExamSession, renderSharedQuestionCard,
  _shareVisibility, _shareToken, _shareUrl,
};