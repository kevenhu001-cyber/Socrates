/* ui/cmdK.ts — Wave 1b of main-js-split plan.
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

declare class Fuse {
  constructor(list: any[], opts: any);
  search(q: string, opts?: any): any[];
}

interface CmdKItem {
  kind: string;
  id?: string;
  title?: string;
  topic?: string;
  mode?: string;
  updatedAt?: number;
  snippet?: string;
  sessionId?: string;
  [key: string]: any;
}

interface CmdKHit {
  item?: CmdKItem;
  [key: string]: any;
}

interface CmdKSection {
  kind: string;
  label: string;
  items: any[];
}

interface CmdKBridge {
  publish: (state: { isOpen: boolean; query: string; results: any[]; selectedIndex: number; recent: string[] }) => void;
}

var _cmdKIndex: Fuse | null = null;
var _cmdKIndexDocs: CmdKItem[] = [];
var _cmdKResults: any[] = [];
var _cmdKSelected = 0;
var _cmdKRecent: string[] = [];
try {
  _cmdKRecent = JSON.parse(localStorage.getItem("socrates-search-recent") || "[]") || [];
} catch (_) { _cmdKRecent = []; }

/* React migration bridge — fires whenever the legacy state changes so the
   React compatibility root can mirror the palette via useSyncExternalStore.
   The registry is installed by frontend/src/react/cmdk/cmdKRuntimeStore.ts
   on `?react=1` boot; in legacy mode no listener is attached, so every
   helper is a cheap no-op. */
function _publishCmdKState(): void {
  try {
    var bridge: CmdKBridge | undefined = (window as any).__socratesCmdK;
    if (bridge && typeof bridge.publish === "function") {
      bridge.publish({
        isOpen: !document.getElementById("cmdKOverlay")!.classList.contains("hidden"),
        query: (document.getElementById("cmdKInput") as HTMLInputElement | null)?.value || "",
        results: _cmdKResults,
        selectedIndex: _cmdKSelected,
        recent: _cmdKRecent,
      });
    }
  } catch (_) { /* swallow — bridge is best-effort */ }
}

/* React mode owns the overlay's children. The legacy renderer becomes a
   no-op the moment React sets this attribute so its writes don't clobber
   the React tree. Legacy mode never sees the attribute, so the guard
   never trips. */
function _reactOwnsOverlay(): boolean {
  var el = document.getElementById("cmdKOverlay");
  return !!(el && el.dataset && el.dataset.reactMigrationRuntime === "cmd-k");
}

function rebuildCmdKIndex(): void {
  if (typeof Fuse === "undefined") return;
  var docs: CmdKItem[] = [];
  var sessions: any[] = (window as any).SERVER_SESSIONS || [];
  sessions.forEach(function (s: any) {
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
  var messages: any[] = (((window as any).state && (window as any).state.session) || {}).messages || [];
  messages.forEach(function (m: any) {
    if (!m.rawText) return;
    var role = m.role === "user" ? "You" : "Assistant";
    docs.push({
      kind: "message",
      id: m.clientId || m.id,
      sessionId: ((window as any).state.session || {}).currentSessionId,
      title: role + ": " + (m.rawText || "").slice(0, 80),
      topic: (((window as any).state.session || {}).topic) || "",
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

function openCmdK(): void {
  if (!(window as any).CURRENT_USER) return;
  if (!_cmdKIndex) rebuildCmdKIndex();
  var overlay = document.getElementById("cmdKOverlay");
  if (overlay) overlay.classList.remove("hidden");
  var input = document.getElementById("cmdKInput") as HTMLInputElement | null;
  if (input) { input.value = ""; setTimeout(function () { input!.focus(); }, 0); }
  renderCmdKResults(_cmdKRecent.length ? [
    { kind: "recent", label: "Recent", items: _cmdKRecent.slice(0, 5) },
  ] : []);
  _cmdKResults = [];
  _cmdKSelected = 0;
  _publishCmdKState();
}

function closeCmdK(): void {
  var overlay = document.getElementById("cmdKOverlay");
  if (overlay) overlay.classList.add("hidden");
  _publishCmdKState();
}

function onCmdKInput(q: string): void {
  q = (q || "").trim();
  if (!q) {
    renderCmdKResults(_cmdKRecent.length ? [
      { kind: "recent", label: "Recent", items: _cmdKRecent.slice(0, 5) },
    ] : []);
    return;
  }
  var hits: any[] = _cmdKIndex ? _cmdKIndex.search(q, { limit: 20 }) : [];
  try {
    (window as any).apiFetch("/api/search", {
      method: "POST",
      body: { q: q, scope: "all", limit: 20 },
      timeoutMs: 4000,
    }).then(function (r: any) {
      if (r && Array.isArray(r.hits) && r.hits.length) {
        var serverHits = r.hits.map(function (h: any) {
          return { kind: "remote", id: h.id, sessionId: h.sessionId, title: h.title, snippet: h.snippet || "" };
        });
        var existing = document.getElementById("cmdKResults");
        if (existing) {
          var remoteBlock = document.createElement("div");
          remoteBlock.className = "cmd-k-section";
          remoteBlock.innerHTML = '<div class="cmd-k-section-label">From your other devices</div>' +
            serverHits.map(function (h: any, idx: number) {
              return '<div class="cmd-k-row" data-idx="' + (hits.length + idx) + '" data-kind="' + h.kind + '" data-id="' + (window as any).esc(h.id) + '">' +
                '<div class="cmd-k-row-title">' + (window as any).esc(h.title) + '</div>' +
                '<div class="cmd-k-row-snippet">' + (window as any).esc(h.snippet) + '</div>' +
              '</div>';
            }).join("");
          existing.appendChild(remoteBlock);
        }
      }
    }).catch(function () { /* offline or 404 — ignore */ });
  } catch (_) { /* swallow */ }
  _cmdKResults = hits;
  _cmdKSelected = 0;
  renderCmdKResultsHits(q, hits);
  _publishCmdKState();
}

function renderCmdKResultsHits(q: string, hits: any[]): void {
  var html: string[] = [];
  if (hits.length) {
    html.push('<div class="cmd-k-section"><div class="cmd-k-section-label">' + hits.length + ' result' + (hits.length === 1 ? "" : "s") + ' for "' + (window as any).esc(q) + '"</div>');
    hits.forEach(function (h: any, idx: number) {
      var item = h.item || h;
      var meta = item.kind === "message" ? "Message" : (item.mode === "chat" ? "Chat" : "Tutor");
      html.push(
        '<div class="cmd-k-row ' + (idx === _cmdKSelected ? "selected" : "") + '" data-idx="' + idx + '" data-kind="' + item.kind + '" data-id="' + (window as any).esc(item.id || "") + '" onclick="openCmdKResult(' + idx + ')" onmouseenter="_cmdKSelected=' + idx + ';updateCmdKSelected()">' +
          '<div class="cmd-k-row-title">' + (window as any).esc(item.title || "") + '</div>' +
          '<div class="cmd-k-row-snippet">' + (window as any).esc(item.snippet || "") + '</div>' +
          '<div class="cmd-k-row-meta">' + meta + '</div>' +
        '</div>'
      );
    });
    html.push('</div>');
  } else {
    html.push('<div class="cmd-k-empty">No results. Press <kbd>↵</kbd> to search on the server.</div>');
  }
  renderCmdKResultsHTML(html.join(""));
}

function renderCmdKResults(sections: CmdKSection[]): void {
  if (!sections.length) {
    renderCmdKResultsHTML('<div class="cmd-k-empty">Type to search across all your sessions.</div>');
    return;
  }
  var html = sections.map(function (sec) {
    var rows = sec.items.map(function (it: any) {
      return '<div class="cmd-k-row" data-recent="' + (window as any).esc(it) + '" onclick="document.getElementById(\'cmdKInput\').value=\'' + (window as any).esc(it) + '\';onCmdKInput(\'' + (window as any).esc(it) + '\')">' +
        '<div class="cmd-k-row-title">' + (window as any).esc(it) + '</div>' +
        '<div class="cmd-k-row-meta">Recent</div>' +
      '</div>';
    }).join("");
    return '<div class="cmd-k-section"><div class="cmd-k-section-label">' + (window as any).esc(sec.label) + '</div>' + rows + '</div>';
  }).join("");
  renderCmdKResultsHTML(html);
}

function renderCmdKResultsHTML(html: string): void {
  if (_reactOwnsOverlay()) return;
  var el = document.getElementById("cmdKResults");
  if (el) el.innerHTML = html;
}

function updateCmdKSelected(): void {
  var rows = document.querySelectorAll("#cmdKResults .cmd-k-row");
  rows.forEach(function (r, i) {
    r.classList.toggle("selected", i === _cmdKSelected);
    if (i === _cmdKSelected && r.scrollIntoView) {
      r.scrollIntoView({ block: "nearest" });
    }
  });
}

function openCmdKResult(idx: number): void {
  var hit: CmdKHit | undefined = _cmdKResults[idx];
  if (!hit) return;
  var item = hit.item || hit;
  var q = (document.getElementById("cmdKInput") as HTMLInputElement).value.trim();
  if (q) {
    _cmdKRecent = _cmdKRecent.filter(function (x) { return x !== q; });
    _cmdKRecent.unshift(q);
    _cmdKRecent = _cmdKRecent.slice(0, 10);
    try { localStorage.setItem("socrates-search-recent", JSON.stringify(_cmdKRecent)); } catch (_) {}
  }
  if (item.kind === "session") {
    (window as any).loadSession(item.id);
  } else if (item.kind === "message" && item.sessionId && (window as any).loadSession) {
    (window as any).loadSession(item.sessionId);
  } else if (item.kind === "remote" && item.sessionId) {
    (window as any).loadSession(item.sessionId);
  }
  closeCmdK();
  _publishCmdKState();
}

function onCmdKKey(ev: KeyboardEvent): void {
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
      var q = (document.getElementById("cmdKInput") as HTMLInputElement).value.trim();
      if (q) {
        (window as any).apiFetch("/api/search", {
          method: "POST",
          body: { q: q, scope: "all", limit: 20 },
          timeoutMs: 5000,
        }).then(function (r: any) {
          if (r && Array.isArray(r.hits) && r.hits.length) {
            _cmdKResults = r.hits.map(function (h: any) {
              return { item: { kind: "remote", id: h.id, sessionId: h.sessionId, title: h.title, snippet: h.snippet || "" } };
            });
            _cmdKSelected = 0;
            renderCmdKResultsHits(q, _cmdKResults);
          } else {
            (window as any).showToast("No matches");
          }
        }).catch(function () {
          (window as any).showToast("Search failed");
        });
      }
    }
  }
  _publishCmdKState();
}

export {
  rebuildCmdKIndex, openCmdK, closeCmdK,
  onCmdKInput, onCmdKKey, renderCmdKResults,
  renderCmdKResultsHits, renderCmdKResultsHTML,
  openCmdKResult, updateCmdKSelected,
};
