import { stateStore } from '../state/store.js';
import { showToast } from './toast.js';

/* ui/cmdK.js — Wave 1b of main-js-split plan.
 * Cmd-K global search palette: indexer (fuse.js), open/close, render,
 * keyboard navigation, hit selection. Extracted from main.js L844-L1067.
 *
 * Touches the following globals (read from window.*):
 *   - Fuse (CDN)
 *   - SERVER_SESSIONS, CURRENT_USER, state.session.*
 *   - esc (render/helpers.js)
 *   - apiFetch (util/api.js)
 *   - loadSession, showToast
 *
 * Bridge: windowExports.js exposes closeCmdK + onCmdKInput + onCmdKKey so
 * index.html's inline handlers (L571/L575) keep working.
 */

var _cmdKIndex = null;
var _cmdKIndexDocs = [];
var _cmdKResults = [];
var _cmdKSelected = 0;
var _cmdKRecent = [];
try {
  _cmdKRecent = JSON.parse(localStorage.getItem("socrates-search-recent") || "[]") || [];
} catch (_) { _cmdKRecent = []; }

/* React migration bridge — fires whenever the legacy state changes so the
   React compatibility root can mirror the palette via useSyncExternalStore.
   The registry is installed by frontend/src/react/cmdk/cmdKRuntimeStore.ts
   on `?react=1` boot; in legacy mode no listener is attached, so every
   helper is a cheap no-op. */
function _publishCmdKState() {
  try {
    var bridge = window.__socratesCmdK;
    if (bridge && typeof bridge.publish === "function") {
      bridge.publish({
        isOpen: !document.getElementById("cmdKOverlay").classList.contains("hidden"),
        query: (document.getElementById("cmdKInput") || {}).value || "",
        results: _cmdKResults,
        selectedIndex: _cmdKSelected,
        recent: _cmdKRecent,
      });
    }
  } catch (_) { /* swallow — bridge is best-effort */ }
}

/* React owns the CmdK overlay's children unconditionally under the
   always-on runtime. `renderCmdKResultsHTML` is kept as a no-op so
   legacy callers that build HTML strings can still call it; the
   legacy HTML is discarded. */

/* renderCmdKResultsHTML is intentionally a no-op: React owns the
   results panel and reads its state from the CmdK bridge. */

function rebuildCmdKIndex() {
  if (typeof Fuse === "undefined") {
    try {
      if (typeof window.__socratesEnsureFuse === "function") {
        window.__socratesEnsureFuse().then(function () {
          if (typeof Fuse !== "undefined") rebuildCmdKIndex();
        }).catch(function () { /* keep server search as fallback */ });
      }
    } catch (_) { /* ignore */ }
    return;
  }
  var docs = [];
  var sessions = window.SERVER_SESSIONS || [];
  sessions.forEach(function (s) {
    docs.push({
      kind: "session",
      id: s.id,
      title: s.title || s.topic || "(untitled)",
      topic: s.topic || "",
      mode: s.mode || "tutor",
      updatedAt: s.updated_at || s.updatedAt || 0,
      snippet: s.preview || (s.title || s.topic || "").slice(0, 140),
    });
  });
  var messages = stateStore.read('messages') || [];
  messages.forEach(function (m) {
    if (!m.rawText) return;
    var role = m.role === "user" ? "You" : "Assistant";
    docs.push({
      kind: "message",
      id: m.clientId || m.id,
      sessionId: stateStore.read('currentSessionId'),
      title: role + ": " + (m.rawText || "").slice(0, 80),
      topic: stateStore.read('topic') || "",
      snippet: (m.rawText || "").slice(0, 200),
    });
  });
  _cmdKIndexDocs = docs;
  _cmdKIndex = new Fuse(docs, {
    keys: ["title", "topic", "snippet"],
    threshold: 0.4,
    ignoreLocation: true,
    minMatchCharLength: 2,
    includeMatches: true,
  });
}

function openCmdK() {
  if (!window.CURRENT_USER) return;
  if (!_cmdKIndex) rebuildCmdKIndex();
  var overlay = document.getElementById("cmdKOverlay");
  if (overlay) overlay.classList.remove("hidden");
  var input = document.getElementById("cmdKInput");
  if (input) { input.value = ""; setTimeout(function () { input.focus(); }, 0); }
  renderCmdKResults(_cmdKRecent.length ? [
    { kind: "recent", label: "Recent", items: _cmdKRecent.slice(0, 5) },
  ] : []);
  _cmdKResults = [];
  _cmdKSelected = 0;
  _publishCmdKState();
}

function closeCmdK() {
  var overlay = document.getElementById("cmdKOverlay");
  if (overlay) overlay.classList.add("hidden");
  _publishCmdKState();
}

function onCmdKInput(q) {
  q = (q || "").trim();
  if (!q) {
    renderCmdKResults(_cmdKRecent.length ? [
      { kind: "recent", label: "Recent", items: _cmdKRecent.slice(0, 5) },
    ] : []);
    return;
  }
  var hits = _cmdKIndex ? _cmdKIndex.search(q, { limit: 20 }) : [];
  try {
    window.apiFetch("/api/search", {
      method: "POST",
      body: { q: q, scope: "all", limit: 20 },
      timeoutMs: 4000,
    }).then(function (r) {
      if (r && Array.isArray(r.hits) && r.hits.length) {
        /* Stale-response guard — the user may have kept typing while
           the server round-trip was in flight. */
        var cur = ((document.getElementById("cmdKInput") || {}).value || "").trim();
        if (cur !== q) return;
        var seen = {};
        _cmdKResults.forEach(function (h) {
          var it = h.item || h;
          if (it && it.id) seen[it.id] = true;
        });
        var serverHits = r.hits.filter(function (h) {
          return h && h.id && !seen[h.id];
        }).map(function (h) {
          return { kind: "remote", id: h.id, sessionId: h.sessionId, title: h.title, snippet: h.snippet || "" };
        });
        if (!serverHits.length) return;
        /* React owns #cmdKResults — publish through the bridge instead
           of appending DOM behind React's back. */
        _cmdKResults = _cmdKResults.concat(serverHits);
        _publishCmdKState();
      }
    }).catch(function () { /* offline or 404 — ignore */ });
  } catch (_) { /* swallow */ }
  _cmdKResults = hits;
  _cmdKSelected = 0;
  renderCmdKResultsHits(q, hits);
  _publishCmdKState();
}

function renderCmdKResultsHits(_q, _hits) {}

function renderCmdKResults(_sections) {}

function updateCmdKSelected() {
  var rows = document.querySelectorAll("#cmdKResults .cmd-k-row");
  rows.forEach(function (r, i) {
    r.classList.toggle("selected", i === _cmdKSelected);
    if (i === _cmdKSelected && r.scrollIntoView) {
      r.scrollIntoView({ block: "nearest" });
    }
  });
}

function openCmdKResult(idx) {
  var hit = _cmdKResults[idx];
  if (!hit) return;
  var item = hit.item || hit;
  var q = document.getElementById("cmdKInput").value.trim();
  if (q) {
    _cmdKRecent = _cmdKRecent.filter(function (x) { return x !== q; });
    _cmdKRecent.unshift(q);
    _cmdKRecent = _cmdKRecent.slice(0, 10);
    try { localStorage.setItem("socrates-search-recent", JSON.stringify(_cmdKRecent)); } catch (_) {}
  }
  if (item.kind === "session") {
    window.loadSession(item.id);
  } else if (item.kind === "message" && item.sessionId && window.loadSession) {
    window.loadSession(item.sessionId);
  } else if (item.kind === "remote" && item.sessionId) {
    window.loadSession(item.sessionId);
  }
  closeCmdK();
  _publishCmdKState();
}

function onCmdKKey(ev) {
  if (ev.key === "Escape") {
    ev.preventDefault();
    closeCmdK();
  } else if (ev.key === "ArrowDown") {
    ev.preventDefault();
    if (_cmdKResults.length) {
      _cmdKSelected = (_cmdKSelected + 1) % _cmdKResults.length;
      updateCmdKSelected();
    }
  } else if (ev.key === "ArrowUp") {
    ev.preventDefault();
    if (_cmdKResults.length) {
      _cmdKSelected = (_cmdKSelected - 1 + _cmdKResults.length) % _cmdKResults.length;
      updateCmdKSelected();
    }
  } else if (ev.key === "Enter") {
    ev.preventDefault();
    if (_cmdKResults.length) {
      openCmdKResult(_cmdKSelected);
    } else {
      var q = document.getElementById("cmdKInput").value.trim();
      if (q) {
        window.apiFetch("/api/search", {
          method: "POST",
          body: { q: q, scope: "all", limit: 20 },
          timeoutMs: 5000,
        }).then(function (r) {
          if (r && Array.isArray(r.hits) && r.hits.length) {
            _cmdKResults = r.hits.map(function (h) {
              return { item: { kind: "remote", id: h.id, sessionId: h.sessionId, title: h.title, snippet: h.snippet || "" } };
            });
            _cmdKSelected = 0;
            renderCmdKResultsHits(q, _cmdKResults);
            _publishCmdKState();
          } else {
            showToast("No matches");
          }
        }).catch(function () {
          showToast("Search failed");
        });
      }
    }
  }
  _publishCmdKState();
}

export {
  rebuildCmdKIndex, openCmdK, closeCmdK,
  onCmdKInput, onCmdKKey, renderCmdKResults,
  renderCmdKResultsHits,
  openCmdKResult, updateCmdKSelected,
};
