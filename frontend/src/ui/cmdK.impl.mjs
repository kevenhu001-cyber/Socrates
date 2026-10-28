import { stateStore } from '../state/store.js';
import { showToast } from './toast.js';
import { loadSession } from '../session/loader.ts';
import { ensureFuse } from '../vendor/lazy.js';
import { reportSwallow } from '../util/reportSwallow.ts';

/* Deferred Cmd-K search runtime. */
var _cmdKIndex = null;
var _cmdKIndexDirty = false;
var _cmdKIndexDocs = [];
var _cmdKResults = [];
var _cmdKSelected = 0;
var _cmdKRecent = [];
try {
  _cmdKRecent = JSON.parse(localStorage.getItem("socrates-search-recent") || "[]") || [];
} catch (_) { _cmdKRecent = []; }

function markCmdKIndexDirty() { _cmdKIndexDirty = true; }

export function resetCmdKSearchState() {
  _cmdKIndex = null;
  _cmdKIndexDirty = false;
  _cmdKIndexDocs = [];
  _cmdKResults = [];
  _cmdKSelected = 0;
  _cmdKRecent = [];
  try { localStorage.removeItem("socrates-search-recent"); } catch (_) { /* private mode */ }
}

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
  } catch (_) { /* best-effort bridge */ }
}

function rebuildCmdKIndex() {
  if (typeof Fuse === "undefined") {
    try {
      ensureFuse().then(function () {
        if (!window.CURRENT_USER || typeof Fuse === "undefined") return;
        rebuildCmdKIndex();
        var overlay = document.getElementById("cmdKOverlay");
        var input = document.getElementById("cmdKInput");
        if (overlay && !overlay.classList.contains("hidden") && input && input.value.trim()) {
          var hits = _cmdKIndex.search(input.value.trim(), { limit: 20 });
          _cmdKResults = hits.concat(_cmdKResults.filter(function (hit) {
            return hit.kind === 'remote' && !hits.some(function (local) { return local.item.id === hit.id; });
          }));
          _cmdKSelected = 0;
          _publishCmdKState();
        }
      }).catch(function () { /* keep server search as fallback */ });
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
  if (!_cmdKIndex || _cmdKIndexDirty) {
    rebuildCmdKIndex();
    _cmdKIndexDirty = false;
  }
  var overlay = document.getElementById("cmdKOverlay");
  if (overlay) overlay.classList.remove("hidden");
  var input = document.getElementById("cmdKInput");
  if (input) { input.value = ""; setTimeout(function () { input.focus(); }, 0); }
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
    _cmdKResults = [];
    _cmdKSelected = 0;
    _publishCmdKState();
    return;
  }
  var hits = _cmdKIndex ? _cmdKIndex.search(q, { limit: 20 }) : [];
  try {
    window.apiFetch("/api/search", {
      method: "POST",
      body: { q: q, scope: "all", limit: 20 },
    }).then(function (r) {
      if (r && Array.isArray(r.hits) && r.hits.length) {
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
        _cmdKResults = _cmdKResults.concat(serverHits);
        _publishCmdKState();
      }
    }).catch(function () { /* offline or 404 — ignore */ });
  } catch (_) { /* swallow */ }
  _cmdKResults = hits;
  _cmdKSelected = 0;
  _publishCmdKState();
}

function updateCmdKSelected() {
  var rows = document.querySelectorAll("#cmdKResults .cmd-k-row");
  rows.forEach(function (r, i) {
    r.classList.toggle("selected", i === _cmdKSelected);
    if (i === _cmdKSelected && r.scrollIntoView) r.scrollIntoView({ block: "nearest" });
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
    try { localStorage.setItem("socrates-search-recent", JSON.stringify(_cmdKRecent)); } catch (error) { reportSwallow(error, 'ui/cmdK.impl.mjs:183', 'expected'); }
  }
  if (item.kind === "session") loadSession(item.id);
  else if (item.kind === "message" && item.sessionId) loadSession(item.sessionId);
  else if (item.kind === "remote" && item.sessionId) loadSession(item.sessionId);
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
        }).then(function (r) {
          if (r && Array.isArray(r.hits) && r.hits.length) {
            _cmdKResults = r.hits.map(function (h) {
              return { item: { kind: "remote", id: h.id, sessionId: h.sessionId, title: h.title, snippet: h.snippet || "" } };
            });
            _cmdKSelected = 0;
            _publishCmdKState();
          } else showToast("No matches");
        }).catch(function () { showToast("Search failed"); });
      }
    }
  }
  _publishCmdKState();
}

export {
  rebuildCmdKIndex, openCmdK, closeCmdK,
  onCmdKInput, onCmdKKey,
  openCmdKResult, updateCmdKSelected,
  markCmdKIndexDirty,
};
