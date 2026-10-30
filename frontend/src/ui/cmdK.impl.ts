import { stateStore } from '../state/store.ts';
import { showToast } from './toast.js';
import { loadSession } from '../session/loader.ts';
import { ensureFuse } from '../vendor/lazy.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";


/* Deferred Cmd-K search runtime. */
let _cmdKIndex: import('fuse.js').default<Record<string, any>> | null = null;
let _cmdKIndexDirty = false;
let _cmdKIndexDocs = [];
let _cmdKResults: any[] = [];
let _cmdKSelected = 0;
let _cmdKRecent: any[] = [];
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
    const bridge = browserWindow.__socratesCmdK;
    if (bridge && typeof bridge.publish === "function") {
      bridge.publish({
        isOpen: !document.getElementById("cmdKOverlay")!.classList.contains("hidden"),
        query: ((document.getElementById("cmdKInput") || {}) as HTMLInputElement).value || "",
        results: _cmdKResults,
        selectedIndex: _cmdKSelected,
        recent: _cmdKRecent,
      });
    }
  } catch (_) { /* best-effort bridge */ }
}

function rebuildCmdKIndex() {
  if (typeof browserWindow.Fuse === "undefined") {
    try {
      ensureFuse().then(function () {
        if (!browserWindow.CURRENT_USER || typeof browserWindow.Fuse === "undefined") return;
        rebuildCmdKIndex();
        const overlay = document.getElementById("cmdKOverlay");
        const input = document.getElementById("cmdKInput");
        if (overlay && !overlay.classList.contains("hidden") && input && (input as HTMLInputElement).value.trim()) {
          const hits = _cmdKIndex!.search((input as HTMLInputElement).value.trim(), { limit: 20 });
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
  const docs: any[] = [];
  const sessions = browserWindow.SERVER_SESSIONS || [];
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
  const messages = stateStore.read('messages') || [];
  messages.forEach(function (m: { rawText: any; role: string; clientId: any; id: any; }) {
    if (!m.rawText) return;
    const role = m.role === "user" ? "You" : "Assistant";
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
  _cmdKIndex = new browserWindow.Fuse(docs, {
    keys: ["title", "topic", "snippet"],
    threshold: 0.4,
    ignoreLocation: true,
    minMatchCharLength: 2,
    includeMatches: true,
  });
}

function openCmdK() {
  if (!browserWindow.CURRENT_USER) return;
  if (!_cmdKIndex || _cmdKIndexDirty) {
    rebuildCmdKIndex();
    _cmdKIndexDirty = false;
  }
  const overlay = document.getElementById("cmdKOverlay");
  if (overlay) overlay.classList.remove("hidden");
  const input = document.getElementById("cmdKInput");
  if (input) { (input as HTMLInputElement).value = ""; setTimeout(function () { input.focus(); }, 0); }
  _cmdKResults = [];
  _cmdKSelected = 0;
  _publishCmdKState();
}

function closeCmdK() {
  const overlay = document.getElementById("cmdKOverlay");
  if (overlay) overlay.classList.add("hidden");
  _publishCmdKState();
}

function onCmdKInput(q: any) {
  q = (q || "").trim();
  if (!q) {
    _cmdKResults = [];
    _cmdKSelected = 0;
    _publishCmdKState();
    return;
  }
  const hits = _cmdKIndex ? _cmdKIndex.search(q, { limit: 20 }) : [];
  try {
    browserWindow.apiFetch("/api/search", {
      method: "POST",
      body: { q: q, scope: "all", limit: 20 },
    }).then(function (r: { hits: any[]; }) {
      if (r && Array.isArray(r.hits) && r.hits.length) {
        const cur = (((document.getElementById("cmdKInput") || {}) as HTMLInputElement).value || "").trim();
        if (cur !== q) return;
        const seen: Record<string, boolean> = {};
        _cmdKResults.forEach(function (h) {
          const it = h.item || h;
          if (it && it.id) seen[it.id] = true;
        });
        const serverHits = r.hits.filter(function (h: { id: string|number; }) {
          return h && h.id && !seen[h.id];
        }).map(function (h: { id: any; sessionId: any; title: any; snippet: any; }) {
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
  const rows = document.querySelectorAll("#cmdKResults .cmd-k-row");
  rows.forEach(function (r, i) {
    r.classList.toggle("selected", i === _cmdKSelected);
    if (i === _cmdKSelected && r.scrollIntoView) r.scrollIntoView({ block: "nearest" });
  });
}

function openCmdKResult(idx: number) {
  const hit = _cmdKResults[idx];
  if (!hit) return;
  const item = hit.item || hit;
  const q = (document.getElementById("cmdKInput") as HTMLInputElement)!.value.trim();
  if (q) {
    _cmdKRecent = _cmdKRecent.filter(function (x) { return x !== q; });
    _cmdKRecent.unshift(q);
    _cmdKRecent = _cmdKRecent.slice(0, 10);
    try { localStorage.setItem("socrates-search-recent", JSON.stringify(_cmdKRecent)); } catch (error) { reportSwallow(error, 'ui/cmdK.impl.ts:183', 'expected'); }
  }
  if (item.kind === "session") loadSession(item.id);
  else if (item.kind === "message" && item.sessionId) loadSession(item.sessionId);
  else if (item.kind === "remote" && item.sessionId) loadSession(item.sessionId);
  closeCmdK();
  _publishCmdKState();
}

function onCmdKKey(ev: KeyboardEvent) {
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
      const q = (document.getElementById("cmdKInput") as HTMLInputElement)!.value.trim();
      if (q) {
        browserWindow.apiFetch("/api/search", {
          method: "POST",
          body: { q: q, scope: "all", limit: 20 },
        }).then(function (r: { hits: any[]; }) {
          if (r && Array.isArray(r.hits) && r.hits.length) {
            _cmdKResults = r.hits.map(function (h: { id: any; sessionId: any; title: any; snippet: any; }) {
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
