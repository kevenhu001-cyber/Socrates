/* ui/toolCards.js — Tool-Calling UI helpers.
 *
 * Renders collapsible tool-call cards inside assistant bubbles, with
 * live-streaming support for tool arguments (Python source, search
 * query, etc.) so the user sees the code appear progressively instead
 * of being revealed all at once when the upstream finishes emitting
 * tool_calls.
 *
 * Exports: TOOL_META, toolFormatInput, appendToolModule,
 *          setLastToolOutput, makeArtifactError, appendInlineArtifact,
 *          renderWebSearchResults, updateToolCardCode, findToolCard
 *
 * Reads from window.*: esc, t, hljs, scrollMainToBottom
 */

import { esc } from '../render/helpers.js';
import { sanitizeUrl } from '../util/safe.js';

/* ============================================================
   TOOL-CALLING UI HELPERS
   The live chat's /api/chat/stream route emits `event: tool_use` /
   `tool_progress` / `tool_result` / `tool_call_delta` /
   `execution_start` frames when the model decides to call a tool.
   ============================================================ */

/* Map tool names to a small, consistent visual identity. Keep the
   entries minimal — heavy iconography makes the card list noisy when
   several tools run in sequence. The `short` label is what appears
   in the collapsed header; `tone` controls the accent colour. */
export var TOOL_META = {
  Read:    { letter: "R", cls: "read",     short: "Read",    tone: "blue"   },
  Write:   { letter: "W", cls: "write",    short: "Write",   tone: "green"  },
  Edit:    { letter: "E", cls: "edit",     short: "Edit",    tone: "amber"  },
  Glob:    { letter: "G", cls: "glob",     short: "Find",    tone: "teal"   },
  Grep:    { letter: "F", cls: "grep",     short: "Search",  tone: "teal"   },
  Bash:    { letter: "$", cls: "bash",     short: "Bash",    tone: "purple" },
  WebFetch:{ letter: "↗", cls: "webfetch", short: "Fetch",   tone: "orange" },
  Code:    { letter: "λ", cls: "code",     short: "Python",  tone: "python" },
  web_search:    { letter: "Q", cls: "websearch", short: "Search", tone: "teal"   },
  code_interpreter: { letter: "λ", cls: "codeint", short: "Code", tone: "python" },
};

/* Extract the human-readable input preview shown in the collapsed
   header. Keeps the header a single line so multiple tool cards stack
   cleanly. */
export function toolFormatInput(name, inp) {
  if (!inp || typeof inp !== "object") return "";
  switch (name) {
    case "Read":    return inp.path + (inp.limit ? `  ·  lines ${inp.offset || 0}–${(inp.offset || 0) + inp.limit}` : "");
    case "Write":   return `${inp.path}  ·  ${((inp.content || "").length)} bytes`;
    case "Edit":    return inp.path + (inp.allOccurrences ? "  ·  all occurrences" : "");
    case "Glob":    return inp.pattern || "";
    case "Grep":    return `${inp.path || "workspace"}  /  ${inp.pattern || ""}`;
    case "Bash":    return inp.command || "";
    case "WebFetch":return inp.url || "";
    case "Code":    {
      const first = ((inp.code || "").split("\n")[0] || "").slice(0, 80);
      return `${inp.language || "python"}  ·  ${first}`;
    }
    case "web_search":  return inp.query || "";
    case "code_interpreter": {
      if (!inp.code) return "";
      const first = ((inp.code || "").split("\n")[0] || "").slice(0, 80);
      return `${inp.language || "python"}  ·  ${first}`;
    }
    default:        return JSON.stringify(inp).slice(0, 160);
  }
}

/* Pull the readable code body out of a tool call's argument JSON.
   Used both for the initial render (when tool_use arrives) and for
   the live stream (when tool_call_delta is updating the card). We
   deliberately try-parse so an in-progress JSON (mid-stream) yields
   the most-recently-completed code without throwing. Truncation
   safety: when the upstream maxes out and the JSON gets cut off
   mid-string (the closing `"` is missing), we still extract the
   code as-is rather than dropping it on the floor. */
export function extractCodeFromArgs(name, argsJson) {
  if (!argsJson || typeof argsJson !== "string") return { code: "", language: "python", parsed: false, truncated: false };
  // Try to parse as JSON; fall back to the raw string when mid-stream.
  let parsed = null;
  try { parsed = JSON.parse(argsJson); } catch (_) { parsed = null; }
  const truncated = parsed === null && argsJson.length > 0;
  if (name === "code_interpreter" || name === "Code") {
    if (parsed && typeof parsed === "object" && typeof parsed.code === "string") {
      return { code: parsed.code, language: parsed.language || "python", parsed: true, truncated: false };
    }
    // Mid-stream / truncated partial JSON — try to pull out a
    // "code":"..." fragment by hand so the user sees the code
    // appear progressively even before the closing brace lands.
    // When truncated mid-escape (e.g. "...\\n" without the closing
    // quote), backtrack to the last safe boundary so we don't
    // surface a half-escaped sequence.
    const m = argsJson.match(/"code"\s*:\s*"((?:\\.|[^"\\])*)/);
    if (m) {
      let raw = m[1];
      // Truncation safety: if the last character is a backslash it
      // is half of an escape sequence; drop it.
      if (truncated && raw.endsWith("\\")) raw = raw.slice(0, -1);
      // Unescape a small set of common JSON escapes.
      const code = raw
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\r/g, "\r")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
      const langMatch = argsJson.match(/"language"\s*:\s*"([^"]+)"/);
      return { code, language: langMatch ? langMatch[1] : "python", parsed: false, truncated };
    }
    return { code: "", language: (parsed && parsed.language) || "python", parsed: false, truncated };
  }
  if (name === "web_search") {
    if (parsed && typeof parsed === "object" && typeof parsed.query === "string") {
      return { code: parsed.query, language: "query", parsed: true, truncated: false };
    }
    const m = argsJson.match(/"query"\s*:\s*"((?:\\.|[^"\\])*)/);
    if (m) {
      let raw = m[1];
      if (truncated && raw.endsWith("\\")) raw = raw.slice(0, -1);
      return { code: raw.replace(/\\"/g, '"').replace(/\\\\/g, "\\"), language: "query", parsed: false, truncated };
    }
    return { code: "", language: "query", parsed: false, truncated };
  }
  if (name === "Bash") {
    if (parsed && typeof parsed === "object" && typeof parsed.command === "string") {
      return { code: parsed.command, language: "bash", parsed: true, truncated: false };
    }
    return { code: argsJson, language: "bash", parsed: false, truncated };
  }
  if (name === "WebFetch") {
    if (parsed && typeof parsed === "object" && typeof parsed.url === "string") {
      return { code: parsed.url, language: "url", parsed: true, truncated: false };
    }
    return { code: argsJson, language: "url", parsed: false, truncated };
  }
  return { code: argsJson, language: "", parsed: parsed !== null, truncated };
}

/* Locate an existing tool card by the tool_call id stamped on it
   (data-tcid). Returns the card element or null. The streaming
   controller uses this to route live tool_call_delta updates to the
   matching card without re-querying the DOM. */
export function findToolCard(tcId, root) {
  if (!tcId) return null;
  const scope = root || document;
  // CSS.escape so tool_call_ids with non-id-safe characters don't
  // break the selector. Falls back to a manual escape when CSS.escape
  // is unavailable (e.g. jsdom in tests).
  let safeId = tcId;
  if (typeof CSS !== "undefined" && CSS && typeof CSS.escape === "function") {
    safeId = CSS.escape(tcId);
  } else {
    safeId = String(tcId).replace(/[^a-zA-Z0-9_-]/g, function (c) { return "\\" + c.charCodeAt(0).toString(16) + " "; });
  }
  return scope.querySelector(`[data-tcid="${safeId}"]`);
}

/* Append a "tool module" to the target assistant bubble.
   Layout (collapsed):  [icon]  Short name  ·  input preview       ▾
   Layout (expanded):    + code/command body
                         + live output (streamed) */
export function appendToolModule(toolName, toolInput, body, opts) {
  opts = opts || {};
  if (!body) {
    const list = document.getElementById("msgList");
    if (!list) return null;
    const last = list.lastElementChild;
    if (last && last.classList.contains("assistant")) {
      body = last.querySelector(".msg-body");
    }
  }
  if (!body) {
    const list2 = document.getElementById("msgList");
    const div = document.createElement("div");
    div.className = "msg assistant";
    body = document.createElement("div");
    body.className = "msg-body";
    div.appendChild(body);
    list2.appendChild(div);
  }
  const meta = TOOL_META[toolName] || { letter: "?", cls: "", short: toolName, tone: "neutral" };

  const card = document.createElement("div");
  card.className = `agent-tool-card tool-${meta.tone} ${meta.cls}`;
  card.dataset.tool = toolName;
  card.innerHTML = `
    <div class="agent-tool-head" role="button" tabindex="0" aria-expanded="false">
      <span class="agent-tool-icon" aria-hidden="true">${meta.letter}</span>
      <span class="agent-tool-name"></span>
      <span class="agent-tool-input"></span>
      <span class="agent-tool-status" aria-hidden="true"></span>
      <span class="agent-tool-chev" aria-hidden="true">▾</span>
    </div>
    <div class="agent-tool-body" hidden>
      <pre class="agent-tool-code"><code></code></pre>
      <div class="agent-tool-out"></div>
    </div>`;

  card.querySelector(".agent-tool-name").textContent = meta.short;
  card.querySelector(".agent-tool-input").textContent = toolFormatInput(toolName, toolInput);

  // Always mount the code/body block; we hide it via [hidden] until
  // there's something to show, so the streaming path doesn't have to
  // re-wire the DOM.
  const codeEl = card.querySelector(".agent-tool-code");
  const codeInner = codeEl.querySelector("code");
  const bodyEl = card.querySelector(".agent-tool-body");

  // Pre-fill with whatever the tool_use event sent us (may be empty
  // for first-delta renders). The streaming controller will call
  // updateToolCardCode() repeatedly as tool_call_delta events arrive.
  const initial = extractCodeFromArgs(toolName, (toolInput && toolInput.__raw) || JSON.stringify(toolInput || {}));
  if (initial.code) {
    codeInner.textContent = initial.code;
    codeInner.className = initial.language ? `language-${initial.language}` : "";
    codeEl.hidden = false;
    bodyEl.hidden = false;
  } else if (toolName === "web_search") {
    // No body to show until the query is known; keep collapsed.
    codeEl.hidden = true;
    bodyEl.hidden = true;
  } else {
    // Show the body so the live stream has somewhere to land.
    codeEl.hidden = false;
    bodyEl.hidden = false;
  }

  // Click/keyboard to expand/collapse.
  const head = card.querySelector(".agent-tool-head");
  function toggleCard() {
    const open = card.classList.toggle("open");
    head.setAttribute("aria-expanded", open ? "true" : "false");
    bodyEl.hidden = !open;
  }
  head.addEventListener("click", toggleCard);
  head.addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggleCard(); }
  });

  // Auto-open the body once there's content. Cards that begin as
  // "code is empty" stay closed until the live stream starts
  // filling in.
  body.appendChild(card);
  // Stash the rich return on the card so updateToolCardCode can
  // reach the code element without re-querying. We still return
  // the .agent-tool-out element for backward compat with callers
  // that pre-date the streaming rewrite.
  card._tcRefs = { out: card.querySelector(".agent-tool-out"), code: codeEl, codeInner, body: bodyEl };
  if (typeof window.scrollMainToBottom === "function") window.scrollMainToBottom();
  return card.querySelector(".agent-tool-out");
}

/* Update the code block of an existing tool card. Called by the
   streaming controller on every tool_call_delta frame so the code
   streams into the card in real time. We use a single textContent
   assignment so the browser doesn't re-tokenise on every char and
   hljs only re-highlights on the final frame. */
export function updateToolCardCode(tcId, argsJson, language) {
  const card = findToolCard(tcId);
  if (!card) return null;
  // Use the cached refs from appendToolModule when available — saves
  // two querySelector calls per frame at 60fps. Fall back to the
  // DOM walk for cards built by older code paths.
  const refs = card._tcRefs;
  const codeEl = (refs && refs.code) || card.querySelector(".agent-tool-code");
  const codeInner = (refs && refs.codeInner) || (codeEl && codeEl.querySelector("code"));
  const bodyEl = (refs && refs.body) || card.querySelector(".agent-tool-body");
  if (!codeEl || !codeInner) return null;

  const extracted = extractCodeFromArgs(card.dataset.tool, argsJson);
  const lang = language || extracted.language || "";
  if (extracted.code) {
    // Only write when the text actually changed — avoids a layout
    // pass per frame when the upstream emits an empty delta.
    if (codeInner.textContent !== extracted.code) {
      codeInner.textContent = extracted.code;
      if (lang && !codeInner.className.includes(lang)) {
        codeInner.className = `language-${lang}`;
      }
    }
    codeEl.hidden = false;
    if (bodyEl) bodyEl.hidden = false;
    card.classList.add("open");
    // Mark the card as actively streaming so the blinking caret
    // shows until the final frame clears it.
    codeEl.classList.add("agent-tool-code-streaming");
    head_set_aria(card, "true");
  }
  // Truncation marker: a small red dot after the last character
  // when the upstream was cut off mid-string. Helps the user
  // notice that a long run got trimmed by max_tokens.
  if (extracted.truncated && extracted.parsed === false) {
    codeEl.classList.add("agent-tool-code-truncated");
  } else if (extracted.parsed) {
    codeEl.classList.remove("agent-tool-code-truncated");
  }
  // Final frame: run highlight once. Streaming frames skip
  // highlight to keep typing smooth.
  if (extracted.parsed) {
    codeEl.classList.remove("agent-tool-code-streaming");
    try {
      if (typeof hljs !== "undefined") {
        hljs.highlightElement(codeInner);
        codeInner.dataset.hljsDone = "1";
      }
    } catch (_) {}
  }
  if (typeof window.scrollMainToBottom === "function") window.scrollMainToBottom();
  return extracted;
}

function head_set_aria(card, value) {
  const head = card.querySelector(".agent-tool-head");
  if (head) head.setAttribute("aria-expanded", value);
}

/* Update the most recently appended tool card's output. When outEl
   is provided, write directly to it (avoids the fragile last-card
   selector). */
export function setLastToolOutput(text, isError, outEl) {
  let out = outEl || null;
  if (!out) {
    const list = document.getElementById("msgList");
    if (!list) return;
    out = list.querySelector(".msg.assistant .agent-tool-card:last-child .agent-tool-out");
  }
  if (!out) return;
  out.textContent = text || "";
  if (isError) out.classList.add("error"); else out.classList.remove("error");
  if (text && text.length > 200) {
    const card = out.closest(".agent-tool-card");
    if (card) card.classList.add("open");
  }
}

/* Build search result nodes directly so untrusted provider payloads
   cannot escape into card markup. A result card opens with a real,
   usable list. We render each result with a small favicon-style
   monogram, a clickable title, the host domain, and a snippet — the
   same layout modern search UIs use so users immediately recognise
   it. */
export function renderWebSearchResults(out, results, query) {
  if (!out || !Array.isArray(results) || !results.length) return false;
  const wrap = document.createElement("div");
  wrap.className = "web-search-results";
  if (query) {
    const head = document.createElement("div");
    head.className = "wsr-header";
    head.textContent = `Found ${results.length} result${results.length === 1 ? "" : "s"} for "${query}"`;
    wrap.appendChild(head);
  }
  for (let i = 0; i < results.length; i++) {
    const source = results[i] || {};
    const url = sanitizeUrl(String(source.url || ""));
    const item = document.createElement("article");
    item.className = "wsr-item";

    // Left rail with the result index — gives a strong scan line and
    // a natural place to hang the "cite as [1]" hint.
    const idx = document.createElement("span");
    idx.className = "wsr-index";
    idx.textContent = String(i + 1);
    item.appendChild(idx);

    const body = document.createElement("div");
    body.className = "wsr-body";

    const host = (() => {
      try { return new URL(url).host.replace(/^www\./, ""); } catch (_) { return ""; }
    })();

    const title = document.createElement("a");
    title.className = "wsr-title";
    title.href = url || "#";
    title.target = "_blank";
    title.rel = "noopener noreferrer";
    title.textContent = source.title || source.url || "Untitled result";
    body.appendChild(title);

    if (source.url) {
      const meta = document.createElement("div");
      meta.className = "wsr-meta";
      if (host) {
        const hostEl = document.createElement("span");
        hostEl.className = "wsr-host";
        hostEl.textContent = host;
        meta.appendChild(hostEl);
      }
      if (source.date) {
        const date = document.createElement("span");
        date.className = "wsr-date";
        date.textContent = source.date;
        meta.appendChild(date);
      }
      body.appendChild(meta);
    }

    if (source.snippet) {
      const snippet = document.createElement("p");
      snippet.className = "wsr-snippet";
      snippet.textContent = source.snippet;
      body.appendChild(snippet);
    }

    item.appendChild(body);
    wrap.appendChild(item);
  }
  out.replaceChildren(wrap);
  return true;
}

/* Build the diagnostic placeholder shown when an inline artifact
   fails to load. */
export function makeArtifactError(fileId, mimeType, url, reason) {
  const box = document.createElement("div");
  box.className = "artifact-error";
  box.innerHTML =
    '<svg class="artifact-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="3" y="3" width="18" height="18" rx="2"/>' +
      '<circle cx="9" cy="9" r="2"/>' +
      '<path d="m21 15-5-5L5 21"/>' +
    '</svg>' +
    `<span class="artifact-error-text">Could not load ${esc(mimeType || "file")} · ${esc(fileId)}${reason ? " (" + esc(reason) + ")" : ""}</span>` +
    '<button type="button" class="artifact-error-retry">Retry</button>';
  box.querySelector(".artifact-error-retry").addEventListener("click", function () {
    const fresh = document.createElement("img");
    fresh.src = url + (url.indexOf("?") >= 0 ? "&" : "?") + "_=" + Date.now();
    fresh.alt = "execution artifact";
    fresh.className = "exec-artifact-image";
    fresh.addEventListener("error", function () { fresh.replaceWith(makeArtifactError(fileId, mimeType, url, "load failed")); });
    if (box.parentNode) box.parentNode.replaceChild(fresh, box);
  });
  return box;
}

/* Append an inline artifact (matplotlib PNG, CSV download link, etc.)
   produced by the code interpreter to the last tool card's output.
   The rendering path is:
     1. Show a sized skeleton (matched to the artifact's natural
        ratio when we can read it) so the card height doesn't jump
        when the image arrives.
     2. Lazy-preload via Image() so we know load/error state before
        touching the DOM, and so we can fall back gracefully when
        the network is down.
     3. On error, show a structured makeArtifactError with a Retry
        button instead of a broken-icon.
     4. Apply a fade-in transition so the image appearing doesn't
        visually "pop" — this matters for chat streams where the
        user is reading and a sudden large image is jarring. */
export function appendInlineArtifact(fileId, mimeType, outEl) {
  const t = window.t || function (k) { return k; };
  let out = outEl || document.querySelector(".msg.assistant .agent-tool-card:last-child .agent-tool-out");
  if (!out || !fileId) return;
  const url = "/api/files/" + encodeURIComponent(fileId) + "/raw";
  if ((mimeType || "").indexOf("image/") === 0) {
    appendInlineImage(fileId, mimeType, url, out);
  } else {
    appendInlineFileLink(fileId, mimeType, url, out, t);
  }
}

function appendInlineImage(fileId, mimeType, url, out) {
  const wrap = document.createElement("figure");
  wrap.className = "exec-artifact";
  const skeleton = document.createElement("div");
  skeleton.className = "exec-artifact-skeleton";
  skeleton.innerHTML = '<span class="exec-artifact-skeleton-pulse"></span>';
  wrap.appendChild(skeleton);

  const img = new Image();
  img.alt = "execution artifact";
  img.className = "exec-artifact-image";
  img.loading = "eager";
  img.decoding = "async";
  // Cache-bust so the browser doesn't reuse a stale 404 after a
  // previous failed load (e.g. worker regenerated the artifact
  // and re-uploaded it under the same id).
  img.src = url + (url.indexOf("?") >= 0 ? "&" : "?") + "_t=" + Date.now();

  // 30s hard cap. Some Pyodide matplotlib runs push 5-15 MB PNGs
  // over slow connections; we don't want the skeleton to spin
  // forever. The cap also covers a real bug where the file route
  // hangs because the upstream storage call deadlocked.
  let loadTimer = setTimeout(function () {
    if (wrap.parentNode && !img.complete) {
      try {
        wrap.parentNode.replaceChild(makeArtifactError(fileId, mimeType, url, "load timeout (30s)"), wrap);
      } catch (_) {}
    }
  }, 30000);

  img.addEventListener("load", function () {
    clearTimeout(loadTimer);
    if (!wrap.parentNode) return;
    if (skeleton.parentNode) skeleton.parentNode.removeChild(skeleton);
    img.style.display = "";
    img.classList.add("loaded");
    wrap.appendChild(img);
  });
  img.addEventListener("error", function () {
    clearTimeout(loadTimer);
    try {
      if (wrap.parentNode) wrap.parentNode.replaceChild(makeArtifactError(fileId, mimeType, url, "load failed"), wrap);
    } catch (_) {}
  });
  img.style.display = "none";
  out.appendChild(wrap);
  const card = out.closest(".agent-tool-card");
  if (card) card.classList.add("open");
}

function appendInlineFileLink(fileId, mimeType, url, out, t) {
  const a = document.createElement("a");
  a.href = url;
  a.textContent = t("common.downloadFile").replace("{type}", mimeType || "file");
  a.target = "_blank";
  a.rel = "noopener";
  a.className = "exec-artifact-link";
  a.download = "";
  if (typeof fetch === "function") {
    try {
      fetch(url, { method: "HEAD", credentials: "same-origin" }).then(function (r) {
        if (!r.ok && a.parentNode) {
          a.parentNode.replaceChild(makeArtifactError(fileId, mimeType, url, "HTTP " + r.status), a);
        }
      }).catch(function () {});
    } catch (_) {}
  }
  out.appendChild(a);
}
