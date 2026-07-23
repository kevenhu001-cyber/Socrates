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
  render_visualization: { letter: "V", cls: "tool-visual", short: "Visual", tone: "purple" },
  Read:    { letter: "R", cls: "read",     short: "Read",    tone: "blue"   },
  Write:   { letter: "W", cls: "write",    short: "Write",   tone: "green"  },
  Edit:    { letter: "E", cls: "edit",     short: "Edit",    tone: "amber"  },
  Glob:    { letter: "G", cls: "glob",     short: "Find",    tone: "teal"   },
  Grep:    { letter: "F", cls: "grep",     short: "Search",  tone: "teal"   },
  Bash:    { letter: "$", cls: "bash",     short: "Shell",   tone: "purple" },
  WebFetch:{ letter: ">", cls: "webfetch", short: "Fetch",   tone: "orange" },
  Code:    { letter: "py", cls: "code",    short: "Python",  tone: "python" },
  web_search:        { letter: "Q", cls: "websearch", short: "Search", tone: "teal"   },
  code_interpreter:  { letter: "{}", cls: "codeint", short: "Code", tone: "python" },
  arxiv_search:      { letter: "X", cls: "arxiv",    short: "arXiv",  tone: "red"    },
  zotero_search:     { letter: "Z", cls: "zotero",   short: "Zotero", tone: "blue"   },
  notion_search_pages: { letter: "N", cls: "notion", short: "Notion", tone: "gray"   },
  github_list_repos: { letter: "GH", cls: "github",   short: "GitHub", tone: "gray"   },
  gitee_list_repos:  { letter: "GL", cls: "gitee",    short: "Gitee",  tone: "orange" },
};

/* Monochrome stroke icons for the chat-facing tools. Single-letter
   glyphs read as noise when several tool cards stack; a consistent
   line-icon set (viewBox 24, currentColor, matching the sidebar nav's
   visual language) is closer to how ChatGPT/Claude label tool calls.
   Tools not listed here fall back to their TOOL_META `letter`. */
export var TOOL_ICONS = {
  render_visualization: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><rect x="7" y="10" width="3" height="7" rx="0.5"/><rect x="12" y="6" width="3" height="11" rx="0.5"/><rect x="17" y="13" width="3" height="4" rx="0.5"/></svg>',
  web_search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  code_interpreter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  Code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
  arxiv_search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>',
  zotero_search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v16H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v4H6.5A2.5 2.5 0 0 1 4 20.5z"/></svg>',
  notion_search_pages: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 12h8M8 16h8M8 8h2"/></svg>',
  github_list_repos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>',
  gitee_list_repos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>',
};

/* Extract the human-readable input preview shown in the collapsed
   header. Keeps the header a single line so multiple tool cards stack
   cleanly. */
export function toolFormatInput(name, inp) {
  if (!inp || typeof inp !== "object") return "";
  switch (name) {
    case "Read":    return inp.path + (inp.limit ? `  -  lines ${inp.offset || 0}-${(inp.offset || 0) + inp.limit}` : "");
    case "Write":   return `${inp.path}  -  ${((inp.content || "").length)} bytes`;
    case "Edit":    return inp.path + (inp.allOccurrences ? "  -  all occurrences" : "");
    case "Glob":    return inp.pattern || "";
    case "Grep":    return `${inp.path || "workspace"}  /  ${inp.pattern || ""}`;
    case "Bash":    return inp.command || "";
    case "WebFetch":return inp.url || "";
    case "Code":    {
      const first = ((inp.code || "").split("\n")[0] || "").slice(0, 80);
      return `${inp.language || "python"}  -  ${first}`;
    }
    case "web_search":  return inp.query || "";
    case "render_visualization": return (inp.template || "visual") + "  -  " + (inp.title || "");
    case "code_interpreter": {
      if (!inp.code) return "";
      const first = ((inp.code || "").split("\n")[0] || "").slice(0, 80);
      return `${inp.language || "python"}  -  ${first}`;
    }
    case "arxiv_search":       return inp.query || "";
    case "zotero_search":      return inp.query || "(all items)";
    case "notion_search_pages": return inp.query || "";
    case "github_list_repos":  return inp.query ? `filter: ${inp.query}` : "(all repos)";
    case "gitee_list_repos":   return inp.query ? `filter: ${inp.query}` : "(all repos)";
    default:                   return stringifyPreview(inp, 160);
  }
}

function stringifyPreview(value, maxLen) {
  var text = "";
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch (_) {
    text = String(value || "");
  }
  text = text.replace(/\s+/g, " ").trim();
  if (!maxLen || text.length <= maxLen) return text;
  return text.slice(0, Math.max(0, maxLen - 1)) + "...";
}

function toolInputPreviewFromExtracted(toolName, extracted) {
  if (!extracted || !extracted.code) return "";
  if (toolName === "web_search") return stringifyPreview(extracted.code, 160);
  if (toolName === "code_interpreter" || toolName === "Code") {
    const first = ((extracted.code || "").split("\n")[0] || "").slice(0, 80);
    return `${extracted.language || "python"}  -  ${first}`;
  }
  return stringifyPreview(extracted.code, 160);
}

function decodeJsonStringFragment(raw, truncated) {
  if (raw == null) return "";
  if (truncated && String(raw).endsWith("\\")) raw = String(raw).slice(0, -1);
  try {
    return JSON.parse('"' + raw + '"');
  } catch (_) {
    return String(raw)
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\r/g, "\r")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
}

function hostFromUrl(url) {
  try {
    if (!url || url === "#") return "";
    return new URL(url).host.replace(/^www\./, "");
  } catch (_) {
    return "";
  }
}

function compactHostLabel(host) {
  if (!host) return "Web";
  var parts = host.split(".").filter(Boolean);
  if (parts.length >= 2) return parts.slice(-2).join(".");
  return host;
}

function trTool(key, fallback, vars) {
  var text = fallback;
  try {
    if (typeof window !== "undefined" && typeof window.t === "function") {
      text = window.t(key) || fallback;
    }
  } catch (_) {
    text = fallback;
  }
  if (vars) {
    Object.keys(vars).forEach(function (name) {
      text = text.replace(new RegExp("\\{" + name + "\\}", "g"), String(vars[name]));
    });
  }
  return text;
}

function copyText(text) {
  var value = String(text || "");
  if (!value) return Promise.reject(new Error("empty"));
  if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    return navigator.clipboard.writeText(value);
  }
  return new Promise(function (resolve, reject) {
    try {
      var area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      var ok = document.execCommand("copy");
      area.remove();
      if (ok) resolve(); else reject(new Error("copy failed"));
    } catch (err) { reject(err); }
  });
}

function setCopyFeedback(button, ok) {
  if (!button) return;
  var original = button.dataset.defaultLabel || button.textContent;
  button.dataset.defaultLabel = original;
  button.textContent = ok
    ? trTool("tool.copied", "Copied")
    : trTool("tool.copyFailed", "Copy failed");
  clearTimeout(button._copyFeedbackTimer);
  button._copyFeedbackTimer = setTimeout(function () { button.textContent = original; }, 1200);
}

function syncToolCopyActions(card) {
  if (!card) return;
  var code = card.querySelector(".agent-tool-code code");
  var output = card.querySelector(".agent-tool-output-pre");
  var codeButton = card.querySelector('[data-tool-copy="code"]');
  var outputButton = card.querySelector('[data-tool-copy="output"]');
  var isSearch = card.dataset.tool === "web_search";
  if (codeButton) codeButton.hidden = isSearch || !(code && code.textContent.trim());
  if (outputButton) outputButton.hidden = isSearch || !(output && output.textContent.trim());
  var toolbar = card.querySelector(".agent-tool-toolbar");
  if (toolbar) toolbar.hidden = (!codeButton || codeButton.hidden) && (!outputButton || outputButton.hidden);
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
      const code = decodeJsonStringFragment(m[1], truncated);
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
      return { code: decodeJsonStringFragment(m[1], truncated), language: "query", parsed: false, truncated };
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
  card.dataset.toolState = opts.restored ? (opts.isError ? "error" : "complete") : "running";
  card.innerHTML = `
    <div class="agent-tool-head" role="button" tabindex="0" aria-expanded="false">
      <span class="agent-tool-icon" aria-hidden="true">${TOOL_ICONS[toolName] || meta.letter}</span>
      <span class="agent-tool-name"></span>
      <span class="agent-tool-input"></span>
      <span class="agent-tool-status" role="status" aria-live="polite"></span>
      <span class="agent-tool-chev" aria-hidden="true">▾</span>
    </div>
    <div class="agent-tool-body" hidden>
      <div class="agent-tool-toolbar" hidden>
        <span class="agent-tool-toolbar-label"></span>
        <button type="button" class="agent-tool-action" data-tool-copy="code" hidden></button>
        <button type="button" class="agent-tool-action" data-tool-copy="output" hidden></button>
      </div>
      <pre class="agent-tool-code"><code></code></pre>
      <div class="agent-tool-out"></div>
    </div>`;

  card.querySelector(".agent-tool-name").textContent = meta.short;
  card.querySelector(".agent-tool-input").textContent = toolFormatInput(toolName, toolInput);
  card.querySelector(".agent-tool-status").textContent = opts.restored
    ? trTool(opts.isError ? "tool.statusFailed" : "tool.statusDone", opts.isError ? "Failed" : "Done")
    : trTool("tool.statusRunning", "Running");
  card.querySelector(".agent-tool-toolbar-label").textContent = trTool("tool.details", "Details");
  var copyCodeButton = card.querySelector('[data-tool-copy="code"]');
  var copyOutputButton = card.querySelector('[data-tool-copy="output"]');
  copyCodeButton.textContent = trTool("tool.copyCode", "Copy code");
  copyOutputButton.textContent = trTool("tool.copyOutput", "Copy output");
  copyCodeButton.addEventListener("click", function (event) {
    event.stopPropagation();
    var code = card.querySelector(".agent-tool-code code");
    copyText(code && code.textContent).then(function () { setCopyFeedback(copyCodeButton, true); })
      .catch(function () { setCopyFeedback(copyCodeButton, false); });
  });
  copyOutputButton.addEventListener("click", function (event) {
    event.stopPropagation();
    var output = card.querySelector(".agent-tool-output-pre");
    copyText(output && output.textContent).then(function () { setCopyFeedback(copyOutputButton, true); })
      .catch(function () { setCopyFeedback(copyOutputButton, false); });
  });

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
    bodyEl.hidden = true;
  } else if (toolName === "web_search") {
    // No body to show until the query is known; keep collapsed.
    codeEl.hidden = true;
    bodyEl.hidden = true;
  } else {
    // Keep details collapsed while the live stream fills it. The card
    // header carries the useful status; opening code automatically made
    // tool-heavy answers harder to read.
    codeEl.hidden = false;
    bodyEl.hidden = true;
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
  syncToolCopyActions(card);
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
    const inputEl = card.querySelector(".agent-tool-input");
    const preview = toolInputPreviewFromExtracted(card.dataset.tool, extracted);
    if (inputEl && preview && inputEl.textContent !== preview) {
      inputEl.textContent = preview;
    }
    // Only write when the text actually changed — avoids a layout
    // pass per frame when the upstream emits an empty delta.
    if (codeInner.textContent !== extracted.code) {
      codeInner.textContent = extracted.code;
      if (lang && !codeInner.className.includes(lang)) {
        codeInner.className = `language-${lang}`;
      }
    }
    codeEl.hidden = false;
    // Content can stream into a collapsed card. Users opt into details
    // via the header, rather than every tool call expanding the message.
    // Mark the card as actively streaming so the blinking caret
    // shows until the final frame clears it.
    codeEl.classList.add("agent-tool-code-streaming");
    syncToolCopyActions(card);
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
  renderToolTextOutput(out, text || "", {
    isError: !!isError,
    kind: isError ? "error" : "output",
  });
}

export function renderToolTextOutput(out, text, opts) {
  if (!out) return null;
  opts = opts || {};
  const value = String(text || "");
  const longOutput = value.length > 5000 || value.split(/\r?\n/).length > 120;
  const wrap = document.createElement("div");
  wrap.className = "agent-tool-output-text";
  if (opts.kind) wrap.dataset.kind = String(opts.kind);

  const pre = document.createElement("pre");
  pre.className = "agent-tool-output-pre";
  pre.textContent = value || trTool("tool.noOutput", "(no output)");
  wrap.appendChild(pre);

  if (longOutput) {
    wrap.classList.add("is-collapsed");
    const controls = document.createElement("div");
    controls.className = "agent-tool-output-controls";
    const summary = document.createElement("span");
    summary.className = "agent-tool-output-summary";
    summary.textContent = trTool("tool.outputChars", "{n} chars", { n: value.length.toLocaleString() });
    const button = document.createElement("button");
    button.type = "button";
    button.className = "agent-tool-output-toggle";
    button.textContent = trTool("tool.showFullOutput", "Show full output");
    button.addEventListener("click", function () {
      const collapsed = wrap.classList.toggle("is-collapsed");
      button.textContent = collapsed
        ? trTool("tool.showFullOutput", "Show full output")
        : trTool("tool.collapseOutput", "Collapse output");
    });
    controls.appendChild(summary);
    controls.appendChild(button);
    wrap.appendChild(controls);
  }

  out.replaceChildren(wrap);
  if (opts.isError) out.classList.add("error"); else out.classList.remove("error");
  syncToolCopyActions(out.closest(".agent-tool-card"));
  return wrap;
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
  const seen = new Set();
  const normalized = [];
  for (let i = 0; i < results.length; i++) {
    const source = results[i] || {};
    const rawUrl = String(source.url || "").trim();
    const url = sanitizeUrl(rawUrl);
    const title = String(source.title || rawUrl || "Untitled result").trim();
    const key = (url || "#") + "\n" + title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      title,
      rawUrl,
      url,
      host: hostFromUrl(url),
      snippet: String(source.snippet || source.description || "").trim(),
      date: String(source.date || source.published || "").trim(),
      source: String(source.source || source.engine || "").trim(),
      matchedQuery: String(source.matchedQuery || "").trim(),
    });
  }
  if (!normalized.length) return false;
  if (query) {
    const head = document.createElement("div");
    head.className = "wsr-header";
    const summary = document.createElement("span");
    summary.className = "wsr-summary";
    summary.textContent = trTool(
      normalized.length === 1 ? "tool.sourceForQuery" : "tool.sourcesForQuery",
      normalized.length === 1 ? '{n} source for "{query}"' : '{n} sources for "{query}"',
      { n: normalized.length, query }
    );
    head.appendChild(summary);
    const copyAll = document.createElement("button");
    copyAll.type = "button";
    copyAll.className = "wsr-copy-all";
    copyAll.textContent = trTool("tool.copySources", "Copy sources");
    copyAll.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      const sourceText = normalized.map(function (source, index) {
        return "[" + (index + 1) + "] " + source.title + (source.url && source.url !== "#" ? " - " + source.url : "");
      }).join("\n");
      copyText(sourceText).then(function () { setCopyFeedback(copyAll, true); })
        .catch(function () { setCopyFeedback(copyAll, false); });
    });
    head.appendChild(copyAll);
    wrap.appendChild(head);
  }
  for (let i = 0; i < normalized.length; i++) {
    const source = normalized[i];
    const item = document.createElement("article");
    item.className = "wsr-item";
    if (!source.host) item.classList.add("wsr-item-muted");

    // Left rail with the result index — gives a strong scan line and
    // a natural place to hang the "cite as [1]" hint.
    const idx = document.createElement("span");
    idx.className = "wsr-index";
    idx.textContent = "[" + (i + 1) + "]";
    idx.title = source.host || trTool("tool.unavailableSource", "Unavailable source");
    item.appendChild(idx);

    const body = document.createElement("div");
    body.className = "wsr-body";

    const title = document.createElement("a");
    title.className = "wsr-title";
    title.href = source.url || "#";
    title.textContent = source.title;
    if (source.url && source.url !== "#") {
      title.target = "_blank";
      title.rel = "noopener noreferrer";
    } else {
      title.classList.add("is-disabled");
      title.setAttribute("aria-disabled", "true");
      title.setAttribute("tabindex", "-1");
    }
    body.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "wsr-meta";
    const hostEl = document.createElement("span");
    hostEl.className = "wsr-host";
    hostEl.textContent = source.host || trTool("tool.linkUnavailable", "Link unavailable");
    meta.appendChild(hostEl);
    if (source.source) {
      const engine = document.createElement("span");
      engine.className = "wsr-source";
      engine.textContent = source.source;
      meta.appendChild(engine);
    }
    if (source.date) {
      const date = document.createElement("span");
      date.className = "wsr-date";
      date.textContent = source.date;
      meta.appendChild(date);
    }
    body.appendChild(meta);

    if (source.snippet) {
      const snippet = document.createElement("p");
      snippet.className = "wsr-snippet";
      snippet.textContent = source.snippet;
      body.appendChild(snippet);
    }

    const actions = document.createElement("div");
    actions.className = "wsr-actions";
    const cite = document.createElement("button");
    cite.type = "button";
    cite.className = "wsr-copy";
    cite.textContent = trTool("tool.copyCitation", "Copy citation");
    cite.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      const citeText = "[" + (i + 1) + "] " + source.title + (source.url && source.url !== "#" ? " - " + source.url : "");
      copyText(citeText).then(function () { setCopyFeedback(cite, true); })
        .catch(function () { setCopyFeedback(cite, false); });
    });
    actions.appendChild(cite);
    body.appendChild(actions);

    item.appendChild(body);
    wrap.appendChild(item);
  }
  out.replaceChildren(wrap);
  out.classList.remove("error");
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
    `<span class="artifact-error-text">图片产物暂时无法加载</span>` +
    '<a class="artifact-error-open" target="_blank" rel="noopener" download>打开原文件</a>' +
    '<button type="button" class="artifact-error-retry">重试</button>' +
    `<details class="artifact-error-detail"><summary>查看详情</summary><code>${esc(reason || 'load failed')} · ${esc(fileId)}</code></details>`;
  box.querySelector('.artifact-error-open').href = url;
  box.querySelector(".artifact-error-retry").addEventListener("click", function () {
    const fresh = document.createElement("img");
    fresh.src = url + (url.indexOf("?") >= 0 ? "&" : "?") + "_=" + Date.now();
    fresh.alt = "execution artifact";
    fresh.className = "exec-artifact-image";
    fresh.addEventListener("load", function () { fresh.classList.add("loaded"); });
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
export function appendInlineArtifact(fileId, mimeType, outEl, displayName) {
  const t = window.t || function (k) { return k; };
  let out = outEl || document.querySelector(".msg.assistant .agent-tool-card:last-child .agent-tool-out");
  if (!out || !fileId) return;
  const url = "/api/files/" + encodeURIComponent(fileId) + "/raw";
  const selectorId = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(String(fileId)) : String(fileId).replace(/[^a-zA-Z0-9_-]/g, '');
  /* P_artifact-doc-wide-dedup — a single artifact fileId should
     render exactly once per message, regardless of how many
     mount points call us (tool card output + message body, on
     every recordToolResult reentry, on SSE retries). The previous
     per-out check let the same image appear twice (tool card +
     inline) and re-trigger requestImage() in parallel, producing
     the retry-storm flicker pattern. */
  if (document.querySelector(`[data-artifact-id="${selectorId}"]`)) return;
  if ((mimeType || "").indexOf("image/") === 0) {
    appendInlineImage(fileId, mimeType, url, out);
  } else {
    appendInlineFileLink(fileId, mimeType, url, out, t, displayName);
  }
}

function appendInlineImage(fileId, mimeType, url, out) {
  const wrap = document.createElement("figure");
  wrap.className = "exec-artifact";
  wrap.dataset.artifactId = String(fileId);
  const skeleton = document.createElement("div");
  skeleton.className = "exec-artifact-skeleton";
  skeleton.innerHTML = '<span class="exec-artifact-skeleton-pulse"></span>';
  wrap.appendChild(skeleton);

  /* P_artifact-scaffold — actions overlay (fullscreen + download) sits
     in the top-right of the figure so it visually parallels the viz
     buttons. Always visible at low opacity, brightens on hover. */
  const actions = document.createElement("div");
  actions.className = "exec-artifact-actions";
  actions.innerHTML =
    '<button type="button" class="exec-artifact-btn" data-action="exec-expand" title="Fullscreen" aria-label="Fullscreen">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>' +
    '</button>' +
    '<a class="exec-artifact-btn" data-action="exec-download" href="' + esc(url) + '" download target="_blank" rel="noopener" title="Download" aria-label="Download">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>' +
    '</a>';
  wrap.appendChild(actions);

  const img = new Image();
  img.alt = "execution artifact";
  img.className = "exec-artifact-image";
  img.loading = "eager";
  img.decoding = "async";
  // Cache-bust so the browser doesn't reuse a stale 404 after a
  // previous failed load (e.g. worker regenerated the artifact
  // and re-uploaded it under the same id).
  let loadTimer = null;
  let attempts = 0;
  function requestImage() {
    clearTimeout(loadTimer);
    img.src = url + (url.indexOf("?") >= 0 ? "&" : "?") + "cb=" + Date.now();
    loadTimer = setTimeout(function () {
      if (!wrap.parentNode || img.complete) return;
      if (attempts++ === 0) return requestImage();
      try { wrap.parentNode.replaceChild(makeArtifactError(fileId, mimeType, url, "load timeout after retry"), wrap); } catch (_) {}
    }, 10000);
  }

  img.addEventListener("load", function () {
    clearTimeout(loadTimer);
    if (!wrap.parentNode) return;
    if (skeleton.parentNode) skeleton.parentNode.removeChild(skeleton);
    img.style.display = "";
    img.classList.add("loaded");
    wrap.appendChild(img);
    /* P_artifact-meta — once the image is on the page we can read
       its natural size to render a tight metadata strip under the
       figure. We don't have the byte count client-side, so size
       is a string from naturalWidth × naturalHeight. The filename
       comes from the URL's last path segment (fileId is opaque,
       but the original name survives in the `files` table — fetch
       metadata lazily so we don't block the render). */
    var meta = document.createElement("figcaption");
    meta.className = "exec-artifact-meta";
    var name = document.createElement("span");
    name.className = "exec-artifact-meta-name";
    name.textContent = (displayName(fileId, mimeType) || 'artifact');
    var size = document.createElement("span");
    size.className = "exec-artifact-meta-size";
    size.textContent = (img.naturalWidth ? img.naturalWidth + '×' + img.naturalHeight + ' px' : 'image');
    meta.appendChild(name);
    meta.appendChild(size);
    wrap.appendChild(meta);
    if (typeof fetch === "function") {
      try {
        fetch("/api/v2/files/" + encodeURIComponent(fileId), { credentials: "same-origin" })
          .then(function (r) { return r && r.ok ? r.json() : null; })
          .then(function (metaRow) {
            if (metaRow && metaRow.name) name.textContent = metaRow.name;
            if (metaRow && typeof metaRow.size === "number") {
              var cur = size.textContent;
              size.textContent = cur + ' · ' + formatBytes(metaRow.size);
            }
          })
          .catch(function () {});
      } catch (_) {}
    }
  });
  img.addEventListener("error", function () {
    clearTimeout(loadTimer);
    if (attempts++ === 0) return requestImage();
    try {
      if (wrap.parentNode) wrap.parentNode.replaceChild(makeArtifactError(fileId, mimeType, url, "load failed after retry"), wrap);
    } catch (_) {}
  });
  img.style.display = "none";
  /* Click on the image (or the expand button) opens a fullscreen
     lightbox that reuses the viz-modal shell. Pass raw HTML so
     the image renders at natural size without sandboxing. */
  function openLightbox(ev) {
    if (ev) ev.preventDefault();
    if (typeof window.__vizOpenModalRaw !== "function") return;
    var fullSrc = url + (url.indexOf("?") >= 0 ? "&" : "?") + "cb=" + Date.now();
    var html = '<div class="img-lightbox"><img src="' + esc(fullSrc) + '" alt="' + esc(displayName(fileId, mimeType) || 'artifact') + '"/></div>';
    window.__vizOpenModalRaw(html, displayName(fileId, mimeType) || 'Artifact');
  }
  wrap.addEventListener("click", function (ev) {
    var t = ev && ev.target;
    if (!t) return;
    if (t.closest && t.closest('[data-action="exec-download"]')) return;
    if (t.closest && t.closest('[data-action="exec-expand"]')) {
      openLightbox(ev);
      return;
    }
    /* Image click → fullscreen. */
    if (t === img) openLightbox(ev);
  });
  out.appendChild(wrap);
  requestImage();
}

/* Best-effort display name for an artifact. fileId is opaque so we
   fall back to a short id-derived label; the real name arrives via
   the lazy /api/files/:id fetch above. */
function displayName(fileId, mimeType) {
  if (!fileId) return '';
  var short = String(fileId).split('-')[0] || String(fileId);
  if (mimeType && /^image\//.test(mimeType)) return short + (mimeType === 'image/png' ? '.png' : mimeType === 'image/jpeg' ? '.jpg' : '.img');
  return short;
}

/* Format a byte count as a short human string (1.4 KB / 12.3 MB). */
function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
  return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function appendInlineFileLink(fileId, mimeType, url, out, t, displayName) {
  const a = document.createElement("a");
  a.href = url;
  a.textContent = displayName || t("common.downloadFile").replace("{type}", mimeType || "file");
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
