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
 * Reads from window.*: t, hljs, scrollMainToBottom
 */

import { formatToolOutput } from '../render/toolOutput.js';
import { copyText, setCopyFeedback, trTool } from './toolCardHelpers.js';
import { startToolCardTimer } from './toolCardTimer.js';
import { STROKE_ICONS, toolIcon } from './icons/toolIcons.js';

export { stopToolCardTimerForCard } from './toolCardTimer.js';
export { renderWebSearchResults } from './toolSearchResults.js';
export { appendInlineArtifact, makeArtifactError } from './toolArtifacts.js';

/* ============================================================
   TOOL-CALLING UI HELPERS
   The live chat's /api/chat/stream route emits `event: tool_use` /
   `tool_progress` / `tool_result` / `tool_call_delta` /
   `execution_start` frames when the model decides to call a tool.
   ============================================================ */

/* Map tool names to a small, consistent visual identity. Keep the
   entries minimal — heavy iconography makes the card list noisy when
   several tools run in sequence. The `short` label is what appears
   in the collapsed header; `tone` controls the accent colour.
   Only tools the backend toolRegistry actually emits are listed;
   unknown names fall back to { short: toolName } and the generic
   stroke icon. Single-letter glyphs are deliberately gone: the shared
   monochrome icon set (ui/icons/toolIcons.ts) carries identity in both
   the inline row and this card. */
export var TOOL_META = {
  workspace_agent:    { cls: "codex", short: "Agent", tone: "purple" },
  initialize_workspace: { cls: "codex", short: "Workspace", tone: "purple" },
  render_visualization: { cls: "tool-visual", short: "Visual", tone: "purple" },
  web_search:        { cls: "websearch", short: "Search", tone: "teal"   },
  web_fetch:         { cls: "webfetch",  short: "Fetch",  tone: "teal"   },
  create_plan:       { cls: "planner",   short: "Plan",   tone: "green"  },
  create_spec:       { cls: "spec",      short: "Spec",   tone: "green"  },
  code_interpreter:  { cls: "codeint", short: "Code", tone: "python" },
  arxiv_search:      { cls: "arxiv",    short: "arXiv",  tone: "red"    },
  zotero_search:     { cls: "zotero",   short: "Zotero", tone: "blue"   },
  notion_search_pages: { cls: "notion", short: "Notion", tone: "gray"   },
  github_list_repos: { cls: "github",   short: "GitHub", tone: "gray"   },
  gitee_list_repos:  { cls: "gitee",    short: "Gitee",  tone: "orange" },
};

/* Kept as a named export for callers that render a tool glyph outside a
   card. Delegates to the shared set so there is exactly one icon per tool
   in the whole app. */
export var TOOL_ICONS = STROKE_ICONS;

/* Extract the human-readable input preview shown in the collapsed
   header. Keeps the header a single line so multiple tool cards stack
   cleanly. */
export function toolFormatInput(name, inp) {
  if (!inp || typeof inp !== "object") return "";
  switch (name) {
    case "web_search":  return inp.query || "";
    case "web_fetch":   return inp.url || "";
    case "create_plan": return inp.title || "";
    case "create_spec": return inp.title || "";
    case "render_visualization": return (inp.template || "visual") + "  -  " + (inp.title || "");
    case "code_interpreter": {
      if (!inp.code) return "";
      const first = ((inp.code || "").split("\n")[0] || "").slice(0, 80);
      return `${inp.language || "python"}  -  ${first}`;
    }
    case "workspace_agent": return inp.task || "project workspace task";
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
  if (toolName === "code_interpreter") {
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
  if (name === "code_interpreter") {
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
  const meta = TOOL_META[toolName] || { cls: "", short: toolName, tone: "neutral" };

  const card = document.createElement("div");
  const detailId = "tool-detail-" + Math.random().toString(36).slice(2, 10);
  card.className = `agent-tool-card tool-${meta.tone} ${meta.cls}`;
  card.dataset.tool = toolName;
  const editedPath = toolInput && typeof toolInput === "object" ? (toolInput.file_path || toolInput.path) : null;
  if ((toolName === "Write" || toolName === "Edit") && typeof editedPath === "string" && editedPath.trim()) {
    card.dataset.filePath = editedPath.trim();
  }
  const isRunningCard = !opts.restored;
  card.dataset.toolState = opts.restored ? (opts.isError ? "error" : "complete") : "running";
  // Stamp the run start so the shared elapsed timer (Req 3.2) and the
  // final total-duration label (Req 3.3) can derive timeMs from a
  // single, serialization-safe source on the card itself.
  if (isRunningCard) card.dataset.startedAt = String(Date.now());
  card.innerHTML = `
    <div class="agent-tool-head" role="button" tabindex="0" aria-expanded="false" aria-controls="${detailId}">
      <span class="agent-tool-state-icon" aria-hidden="true"></span>
      <span class="agent-tool-icon" aria-hidden="true">${toolIcon(toolName)}</span>
      <span class="agent-tool-name"></span>
      <span class="agent-tool-input"></span>
      <span class="agent-tool-status" role="status" aria-live="polite"></span>
      <span class="agent-tool-chev" aria-hidden="true">${STROKE_ICONS.chevronDown}</span>
    </div>
    <div class="agent-tool-body" id="${detailId}" hidden>
      <section class="agent-tool-section agent-tool-input-section">
        <div class="agent-tool-section-head">
          <span>Input</span>
          <button type="button" class="agent-tool-action" data-tool-copy="code" hidden></button>
        </div>
        <pre class="agent-tool-code"><code></code></pre>
      </section>
      <section class="agent-tool-section agent-tool-output-section">
        <div class="agent-tool-section-head">
          <span>Output</span>
          <button type="button" class="agent-tool-action" data-tool-copy="output" hidden></button>
        </div>
        <div class="agent-tool-out"></div>
      </section>
    </div>`;

  card.querySelector(".agent-tool-name").textContent = meta.short;
  card.querySelector(".agent-tool-input").textContent = toolFormatInput(toolName, toolInput);
  card.querySelector(".agent-tool-status").textContent = opts.restored
    ? trTool(opts.isError ? "tool.statusFailed" : "tool.statusDone", opts.isError ? "Failed" : "Done")
    : trTool("tool.statusRunning", "Running");
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
    if(open)card.dispatchEvent(new CustomEvent("tool-details-opened"));
  }
  head.addEventListener("click", toggleCard);
  head.addEventListener("keydown", function (event) {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggleCard(); }
  });
  // Mark the card as live-wired so the delegated fallback toggle below
  // (for cards revived from serialized session HTML, which lose their
  // listeners) does not double-toggle this one.
  card.dataset.wired = "1";

  // Collapse default (Req 3.1): a card that is still running expands so
  // the reader can watch progress; a terminal (restored) card starts
  // collapsed so completed tool-heavy answers stay scannable. The .open
  // class drives the CSS disclosure; aria-expanded mirrors it.
  if (isRunningCard) {
    card.classList.add("open");
    head.setAttribute("aria-expanded", "true");
    bodyEl.hidden = false;
  }

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
  // Running cards join the shared elapsed timer (Req 3.2). It writes the
  // live time into .agent-tool-status and, on the terminal transition,
  // latches the final total-duration label (Req 3.3). Restored/terminal
  // cards never register, so the timer only runs while work is in flight.
  if (isRunningCard) startToolCardTimer(card);
  if (typeof window.scrollMainToBottom === "function") window.scrollMainToBottom();
  return card.querySelector(".agent-tool-out");
}

/* Delegated fallback expand/collapse. Tool cards that are re-created from
   persisted message HTML (history replay, share view, React handoff of a
   serialized bubble) arrive WITHOUT the per-card listeners attached by
   appendToolModule — innerHTML round-trips drop them — which made those
   cards impossible to expand. One document-level listener restores the
   affordance for any un-wired card; live cards (data-wired="1") keep
   their own handler and are skipped here to avoid double-toggling. */
if (typeof document !== "undefined" && !document.__socratesToolCardDelegate) {
  document.__socratesToolCardDelegate = true;
  document.addEventListener("click", function (ev) {
    var target = ev.target;
    var head = target && target.closest && target.closest(".agent-tool-head");
    if (!head) return;
    var card = head.closest(".agent-tool-card");
    if (!card || card.dataset.wired === "1") return;
    if (target.closest && target.closest(".agent-tool-action")) return;
    var bodyEl = card.querySelector(".agent-tool-body");
    if (!bodyEl) return;
    var open = card.classList.toggle("open");
    head.setAttribute("aria-expanded", open ? "true" : "false");
    bodyEl.hidden = !open;
    if (open) card.dispatchEvent(new CustomEvent("tool-details-opened"));
  });
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
  if (opts.kind === "output") {
    const formatted = formatToolOutput(value);
    if (formatted.rich) {
      pre.innerHTML = formatted.html;
      pre.classList.add("agent-tool-output-rich");
    } else {
      pre.textContent = value || trTool("tool.noOutput", "(no output)");
    }
  } else {
    pre.textContent = value || trTool("tool.noOutput", "(no output)");
  }
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

/* Compatibility hook for older history/share callers. File changes now use
   their existing summary row, so a second nested card is intentionally absent. */
export function appendFileChangeSummaryCards(root) {
  void root;
}
