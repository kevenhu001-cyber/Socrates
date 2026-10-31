import { stateStore } from '../state/store.ts';
import { showToast } from './toast.js';
import { loadSession } from '../session/loader.ts';
import { ensureFuse } from '../vendor/lazy.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { apiFetch } from '../util/api.ts';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";
import { publishCmdKState } from './cmdKState.ts';
import type { CmdKDoc, CmdKRemoteDoc, CmdKHit } from './cmdKState.ts';


/* Deferred Cmd-K search runtime. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function parseRemoteHit(value: unknown): CmdKRemoteDoc | null {
  if (!isRecord(value) || (typeof value.id !== 'string' && typeof value.id !== 'number')) return null;
  if (typeof value.title !== 'string') return null;
  return {
    kind: 'remote',
    id: String(value.id),
    sessionId: typeof value.sessionId === 'string' ? value.sessionId : undefined,
    title: value.title,
    snippet: typeof value.snippet === 'string' ? value.snippet : '',
  };
}
let _cmdKIndex: import('fuse.js').default<CmdKDoc> | null = null;
interface CmdKResult extends CmdKHit {
  item: CmdKDoc;
  score?: number;
  _remote?: true;
}
type RemoteCmdKResult = CmdKResult & { _remote: true };
let _cmdKIndexDirty = false;
let _cmdKResults: CmdKResult[] = [];
let _cmdKSelected = 0;
let _cmdKRecent: string[] = [];
function replaceCmdKResults(results: CmdKResult[]) {
  _cmdKResults = results;
}
try {
  const recent: unknown = JSON.parse(localStorage.getItem("socrates-search-recent") || "[]");
  _cmdKRecent = Array.isArray(recent) ? recent.filter((query): query is string => typeof query === 'string') : [];
} catch (_) { _cmdKRecent = []; }

function markCmdKIndexDirty() { _cmdKIndexDirty = true; }

export function resetCmdKSearchState() {
  _cmdKIndex = null;
  _cmdKIndexDirty = false;
  _cmdKResults = [];
  _cmdKSelected = 0;
  _cmdKRecent = [];
  try { localStorage.removeItem("socrates-search-recent"); } catch (_) {
    reportSwallow(_, 'empty catch: ui/cmdK.impl.ts:29');
    /* private mode */
  }
}

function getCmdKOverlay(): HTMLElement | null {
  return document.getElementById("cmdKOverlay");
}

function getCmdKInput(): HTMLInputElement | null {
  return document.getElementById("cmdKInput") as HTMLInputElement | null;
}

function _publishCmdKState() {
  const overlay = getCmdKOverlay();
  const input = getCmdKInput();
  publishCmdKState({
    isOpen: !!overlay && !overlay.classList.contains("hidden"),
    query: input?.value || "",
    results: _cmdKResults,
    selectedIndex: _cmdKSelected,
    recent: _cmdKRecent,
  });
}

function rebuildCmdKIndex() {
  if (typeof browserWindow.Fuse === "undefined") {
    try {
      ensureFuse().then(function () {
        if (!browserWindow.CURRENT_USER || typeof browserWindow.Fuse === "undefined") return;
        rebuildCmdKIndex();
        const overlay = getCmdKOverlay();
        const input = getCmdKInput();
        if (overlay && !overlay.classList.contains("hidden") && input && input.value.trim()) {
          const hits = _cmdKIndex ? _cmdKIndex.search(input.value.trim(), { limit: 20 }) : [];
          const remoteResults = _cmdKResults.filter((hit): hit is RemoteCmdKResult => hit._remote === true);
          const mergedResults: CmdKResult[] = [...hits, ...remoteResults.filter(function (hit) {
            return !hits.some(function (local) { return local.item.id === hit.item.id; });
          })];
          replaceCmdKResults(mergedResults);
          _cmdKSelected = 0;
          _publishCmdKState();
        }
      }).catch(function () { /* keep server search as fallback */ });
    } catch (_) {
      reportSwallow(_, 'empty catch: ui/cmdK.impl.ts:64', 'expected');
      /* ignore */
    }
    return;
  }
  const docs: CmdKDoc[] = [];
  const sessions = browserWindow.SERVER_SESSIONS || [];
  sessions.forEach(function (s) {
    docs.push({
      kind: "session",
      id: String(s.id),
      title: s.title || s.topic || "(untitled)",
      topic: s.topic || "",
      mode: s.mode || "tutor",
      updatedAt: s.updated_at || s.updatedAt || 0,
      snippet: s.preview || (s.title || s.topic || "").slice(0, 140),
    });
  });
  const rawMessages: unknown = stateStore.read('messages') || [];
  const messages = Array.isArray(rawMessages) ? rawMessages : [];
  messages.forEach(function (message: unknown) {
    if (!isRecord(message) || typeof message.rawText !== 'string' || !message.rawText) return;
    const role = message.role === "user" ? "You" : "Assistant";
    docs.push({
      kind: "message",
      id: String(message.clientId || message.id || ''),
      sessionId: String(stateStore.read('currentSessionId') || ''),
      title: role + ": " + message.rawText.slice(0, 80),
      topic: stateStore.read('topic') || "",
      snippet: message.rawText.slice(0, 200),
    });
  });
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
  const overlay = getCmdKOverlay();
  if (overlay) overlay.classList.remove("hidden");
  const input = getCmdKInput();
  if (input) { input.value = ""; setTimeout(function () { input.focus(); }, 0); }
  _cmdKResults = [];
  _cmdKSelected = 0;
  _publishCmdKState();
}

function closeCmdK() {
  const overlay = getCmdKOverlay();
  if (overlay) overlay.classList.add("hidden");
  _publishCmdKState();
}

function onCmdKInput(q: string) {
  q = (q || "").trim();
  if (!q) {
    _cmdKResults = [];
    _cmdKSelected = 0;
    _publishCmdKState();
    return;
  }
  const hits = _cmdKIndex ? _cmdKIndex.search(q, { limit: 20 }) : [];
  try {
    apiFetch("/api/search", {
      method: "POST",
      body: { q: q, scope: "all", limit: 20 },
    }).then(function (payload: unknown) {
      const r = isRecord(payload) && Array.isArray(payload.hits)
        ? { hits: payload.hits.flatMap((hit) => { const parsed = parseRemoteHit(hit); return parsed ? [parsed] : []; }) }
        : null;
      if (r && r.hits.length) {
        const cur = (getCmdKInput()?.value || "").trim();
        if (cur !== q) return;
        const seen: Record<string, boolean> = {};
        _cmdKResults.forEach(function (h) {
          const it = h.item;
          if (it && it.id) seen[it.id] = true;
        });
        const serverHits: RemoteCmdKResult[] = r.hits
          .filter(function (hit) { return hit.id && !seen[hit.id]; })
          .map((item) => ({ item, _remote: true }));
        if (!serverHits.length) return;
        const mergedResults: CmdKResult[] = [..._cmdKResults, ...serverHits];
        replaceCmdKResults(mergedResults);
        _publishCmdKState();
      }
    }).catch(function () { /* offline or 404 — ignore */ });
  } catch (_) {
    reportSwallow(_, 'empty catch: ui/cmdK.impl.ts:156');
    /* swallow */
  }
  replaceCmdKResults([...hits]);
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
  const item = hit.item;
  const q = (getCmdKInput()?.value || "").trim();
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
      const q = (getCmdKInput()?.value || "").trim();
      if (q) {
        apiFetch("/api/search", {
          method: "POST",
          body: { q: q, scope: "all", limit: 20 },
        }).then(function (payload: unknown) {
          const hits = isRecord(payload) && Array.isArray(payload.hits)
            ? payload.hits.flatMap((hit) => { const parsed = parseRemoteHit(hit); return parsed ? [parsed] : []; })
            : [];
          if (hits.length) {
            _cmdKResults = hits.map((item) => ({ item, _remote: true as const }));
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
