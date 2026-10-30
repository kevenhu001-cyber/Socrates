type ToolActions = typeof import('../react/toolCards/toolCardActionsHost.tsx');
interface ToolInput { code?: string; language?: string; query?: string; task?: string; template?: string; title?: string; url?: string; [key: string]: unknown }
interface ToolCardOptions { restored?: boolean; isError?: boolean; kind?: string }
interface ToolCardElement extends HTMLDivElement {
 _tcRefs?: { out: HTMLElement | null; code: HTMLElement | null; codeInner: HTMLElement | null; body: HTMLElement };
}
/* ui/toolCards.ts — Tool-Calling UI helpers.
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

import { formatToolOutput } from '../render/toolOutput.ts';
import { highlightCodeElement } from '../render/highlight.ts';
import { copyText, trTool } from './toolCardHelpers.ts';
import { startToolCardTimer } from './toolCardTimer.ts';
import { STROKE_ICONS, toolIcon } from './icons/toolIcons.ts';
import { renderToolCardDisclosure } from '../react/toolCards/toolCardDisclosureHost.tsx';
import { reportSwallow } from '../util/reportSwallow.ts';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";


function renderToolCardAction(method: keyof ToolActions, ...args: unknown[]) {
  void import('../react/toolCards/toolCardActionsHost.tsx').then((host) => {
    Reflect.apply(host[method], host, args);
  }).catch((error) => reportSwallow(error, `ui/toolCards.ts:${method}`));
}

const renderToolCardCopyAction = (...args: Parameters<ToolActions['renderToolCardCopyAction']>) => renderToolCardAction('renderToolCardCopyAction', ...args);
const renderToolOutputToggle = (...args: Parameters<ToolActions['renderToolOutputToggle']>) => renderToolCardAction('renderToolOutputToggle', ...args);

export { stopToolCardTimerForCard } from './toolCardTimer.ts';
export { renderWebSearchResults } from './toolSearchResults.ts';
export { appendInlineArtifact, makeArtifactError } from './toolArtifacts.ts';

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
export const TOOL_META: Record<string, { cls: string; short: string; tone: string }> = {
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
export const TOOL_ICONS = STROKE_ICONS;

/* Extract the human-readable input preview shown in the collapsed
   header. Keeps the header a single line so multiple tool cards stack
   cleanly. */
function formatCodeInterpreterInput(input: ToolInput) {
  if (!input.code) return "";
  const first = ((input.code || "").split("\n")[0] || "").slice(0, 80);
  return `${input.language || "python"}  -  ${first}`;
}

function formatVisualizationInput(input: ToolInput) {
  return (input.template || "visual") + "  -  " + (input.title || "");
}

function formatRepositoryFilter(input: ToolInput) {
  return input.query ? `filter: ${input.query}` : "(all repos)";
}

const TOOL_INPUT_FORMATTERS = new Map<string, (input: ToolInput) => string>([
  ["web_search", (input: ToolInput) => input.query || ""],
  ["web_fetch", (input: ToolInput) => input.url || ""],
  ["create_plan", (input: ToolInput) => input.title || ""],
  ["create_spec", (input: ToolInput) => input.title || ""],
  ["render_visualization", formatVisualizationInput],
  ["code_interpreter", formatCodeInterpreterInput],
  ["workspace_agent", (input: ToolInput) => input.task || "project workspace task"],
  ["arxiv_search", (input: ToolInput) => input.query || ""],
  ["zotero_search", (input: ToolInput) => input.query || "(all items)"],
  ["notion_search_pages", (input: ToolInput) => input.query || ""],
  ["github_list_repos", formatRepositoryFilter],
  ["gitee_list_repos", formatRepositoryFilter],
]);

export function toolFormatInput(name: string, inp: ToolInput) {
  if (!inp || typeof inp !== "object") return "";
  return TOOL_INPUT_FORMATTERS.get(name)?.(inp) ?? stringifyPreview(inp, 160);
}

function stringifyPreview(value: any, maxLen: number) {
  let text;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value);
  } catch (_) {
    text = String(value || "");
  }
  text = text.replace(/\s+/g, " ").trim();
  if (!maxLen || text.length <= maxLen) return text;
  return text.slice(0, Math.max(0, maxLen - 1)) + "...";
}

function toolInputPreviewFromExtracted(toolName: string, extracted: { code: string; language?: string }) {
  if (!extracted || !extracted.code) return "";
  if (toolName === "web_search") return stringifyPreview(extracted.code, 160);
  if (toolName === "code_interpreter") {
    const first = ((extracted.code || "").split("\n")[0] || "").slice(0, 80);
    return `${extracted.language || "python"}  -  ${first}`;
  }
  return stringifyPreview(extracted.code, 160);
}

function decodeJsonStringFragment(raw: string|null, truncated: any) {
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

function syncToolCopyActions(card: HTMLElement) {
  if (!card) return;
  const code = card.querySelector(".agent-tool-code code");
  const output = card.querySelector(".agent-tool-output-pre");
  const codeHost = card.querySelector<HTMLElement>('[data-tool-copy-host="code"]');
  const outputHost = card.querySelector<HTMLElement>('[data-tool-copy-host="output"]');
  const isSearch = card.dataset.tool === "web_search";
  const codeVisible = !isSearch && !!(code && code.textContent!.trim());
  const outputVisible = !isSearch && !!(output && output.textContent!.trim());
  if (codeHost) renderToolCardCopyAction(codeHost, {
    kind: 'code',
    label: trTool('tool.copyCode', 'Copy code'),
    copiedLabel: trTool('tool.copied', 'Copied'),
    failedLabel: trTool('tool.copyFailed', 'Copy failed'),
    hidden: !codeVisible,
    onCopy: function () { return copyText(code && code.textContent); },
  });
  if (outputHost) renderToolCardCopyAction(outputHost, {
    kind: 'output',
    label: trTool('tool.copyOutput', 'Copy output'),
    copiedLabel: trTool('tool.copied', 'Copied'),
    failedLabel: trTool('tool.copyFailed', 'Copy failed'),
    hidden: !outputVisible,
    onCopy: function () { return copyText(output && output.textContent); },
  });
  const toolbar = card.querySelector(".agent-tool-toolbar");
  if (toolbar) (toolbar as HTMLElement).hidden = !codeVisible && !outputVisible;
}

/* Pull the readable code body out of a tool call's argument JSON.
   Used both for the initial render (when tool_use arrives) and for
   the live stream (when tool_call_delta is updating the card). We
   deliberately try-parse so an in-progress JSON (mid-stream) yields
   the most-recently-completed code without throwing. Truncation
   safety: when the upstream maxes out and the JSON gets cut off
   mid-string (the closing `"` is missing), we still extract the
   code as-is rather than dropping it on the floor. */
function parseToolArguments(argsJson: string) {
  try { return JSON.parse(argsJson); } catch (_) { return null; }
}

function extractCodeInterpreterArgs(parsed: { code: any; language: any; }, argsJson: string, truncated: boolean) {
  if (parsed && typeof parsed === "object" && typeof parsed.code === "string") {
    return { code: parsed.code, language: parsed.language || "python", parsed: true, truncated: false };
  }
  // Mid-stream / truncated partial JSON — keep the latest complete code fragment.
  const match = argsJson.match(/"code"\s*:\s*"((?:\\.|[^"\\])*)/);
  if (!match) return { code: "", language: (parsed && parsed.language) || "python", parsed: false, truncated };
  const language = argsJson.match(/"language"\s*:\s*"([^"]+)"/);
  return {
    code: decodeJsonStringFragment(match[1], truncated),
    language: language ? language[1] : "python",
    parsed: false,
    truncated,
  };
}

function extractWebSearchArgs(parsed: { query: any; }, argsJson: string, truncated: boolean) {
  if (parsed && typeof parsed === "object" && typeof parsed.query === "string") {
    return { code: parsed.query, language: "query", parsed: true, truncated: false };
  }
  const match = argsJson.match(/"query"\s*:\s*"((?:\\.|[^"\\])*)/);
  if (!match) return { code: "", language: "query", parsed: false, truncated };
  return {
    code: decodeJsonStringFragment(match[1], truncated),
    language: "query",
    parsed: false,
    truncated,
  };
}

export function extractCodeFromArgs(name: string, argsJson: string|any[]) {
  if (!argsJson || typeof argsJson !== "string") {
    return { code: "", language: "python", parsed: false, truncated: false };
  }
  const parsed = parseToolArguments(argsJson);
  const truncated = parsed === null && argsJson.length > 0;
  if (name === "code_interpreter") return extractCodeInterpreterArgs(parsed, argsJson, truncated);
  if (name === "web_search") return extractWebSearchArgs(parsed, argsJson, truncated);
  return { code: argsJson, language: "", parsed: parsed !== null, truncated };
}

/* Locate an existing tool card by the tool_call id stamped on it
   (data-tcid). Returns the card element or null. The streaming
   controller uses this to route live tool_call_delta updates to the
   matching card without re-querying the DOM. */
export function findToolCard(tcId: string, root?: ParentNode | null): ToolCardElement | null {
  if (!tcId) return null;
  const scope = root || document;
  // CSS.escape so tool_call_ids with non-id-safe characters don't
  // break the selector. Falls back to a manual escape when CSS.escape
  // is unavailable (e.g. jsdom in tests).
  let safeId;
  if (typeof CSS !== "undefined" && CSS && typeof CSS.escape === "function") {
    safeId = CSS.escape(tcId);
  } else {
    safeId = String(tcId).replace(/[^a-zA-Z0-9_-]/g, function (c) { return "\\" + c.charCodeAt(0).toString(16) + " "; });
  }
  return scope.querySelector(`[data-tcid="${safeId}"]`);
}

function resolveToolCardBody(body?: HTMLElement | null) {
  if (body) return body;
  const list = document.getElementById("msgList");
  if (!list) return null;
  const last = list.lastElementChild;
  if (last && last.classList.contains("assistant")) body = last.querySelector<HTMLDivElement>(".msg-body");
  if (!body) {
    const message = document.createElement("div");
    message.className = "msg assistant";
    body = document.createElement("div");
    body.className = "msg-body";
    message.appendChild(body);
    list.appendChild(message);
  }
  return body;
}

function createToolCard(toolName: string, toolInput: ToolInput, opts: ToolCardOptions, meta: { tone: string; cls: string; short: string }) {
  const card: ToolCardElement = document.createElement("div");
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
    <div class="agent-tool-head-host">
      <span class="agent-tool-state-icon" aria-hidden="true"></span>
      <span class="agent-tool-icon" aria-hidden="true">${toolIcon(toolName!)}</span>
      <span class="agent-tool-name"></span>
      <span class="agent-tool-input"></span>
      <span class="agent-tool-status" role="status" aria-live="polite"></span>
      <span class="agent-tool-chev" aria-hidden="true">${STROKE_ICONS.chevronDown}</span>
    </div>
    <div class="agent-tool-body" id="${detailId}" hidden>
      <section class="agent-tool-section agent-tool-input-section">
        <div class="agent-tool-section-head">
          <span>Input</span>
          <span data-tool-copy-host="code"></span>
        </div>
        <pre class="agent-tool-code"><code></code></pre>
      </section>
      <section class="agent-tool-section agent-tool-output-section">
        <div class="agent-tool-section-head">
          <span>Output</span>
          <span data-tool-copy-host="output"></span>
        </div>
        <div class="agent-tool-out"></div>
      </section>
    </div>`;
  const headHost = card.querySelector('.agent-tool-head-host');
  renderToolCardDisclosure((headHost as HTMLElement), headHost!.innerHTML, detailId);
  return { card, isRunningCard };
}

function setToolCardLabels(card: HTMLDivElement, toolName: string, toolInput: ToolInput, opts: ToolCardOptions, meta: { short: string }) {
  card.querySelector(".agent-tool-name")!.textContent = meta.short;
  card.querySelector(".agent-tool-input")!.textContent = toolFormatInput(toolName, toolInput);
  card.querySelector(".agent-tool-status")!.textContent = opts.restored
    ? trTool(opts.isError ? "tool.statusFailed" : "tool.statusDone", opts.isError ? "Failed" : "Done")
    : trTool("tool.statusRunning", "Running");
}

function initializeToolCardCode(card: HTMLDivElement, toolName: string, toolInput: ToolInput, codeEl: Element|null, codeInner: HTMLElement|null, bodyEl: Element|null) {
  const raw = toolInput?.__raw;
  const args = typeof raw === 'string' ? raw : JSON.stringify(toolInput || {}) || '{}';
  const initial = extractCodeFromArgs(toolName, args);
  if (initial.code) {
    codeInner!.textContent = initial.code;
    codeInner!.className = initial.language ? `language-${initial.language}` : "";
    (codeEl as HTMLElement)!.hidden = false;
    (bodyEl as HTMLElement)!.hidden = true;
  } else if (toolName === "web_search") {
    // No body to show until the query is known; keep collapsed.
    (codeEl as HTMLElement)!.hidden = true;
    (bodyEl as HTMLElement)!.hidden = true;
  } else {
    // Keep details collapsed while the live stream fills it. The card
    // header carries the useful status; opening code automatically made
    // tool-heavy answers harder to read.
    (codeEl as HTMLElement)!.hidden = false;
    (bodyEl as HTMLElement)!.hidden = true;
  }
}

function wireToolCardDisclosure(card: HTMLDivElement, head: Element|null, bodyEl: Element|null) {
  function toggleCard() {
    const open = card.classList.toggle("open");
    head!.setAttribute("aria-expanded", open ? "true" : "false");
    (bodyEl as HTMLElement)!.hidden = !open;
    if(open)card.dispatchEvent(new CustomEvent("tool-details-opened"));
  }
  head!.addEventListener("click", toggleCard);
  head!.addEventListener("keydown", function (event: Event) {
    const keyEvent = event as KeyboardEvent;
    if (keyEvent.key === "Enter" || keyEvent.key === " ") { keyEvent.preventDefault(); toggleCard(); }
  });
}

function expandRunningToolCard(card: HTMLDivElement, head: Element|null, bodyEl: Element|null) {
  card.classList.add("open");
  head!.setAttribute("aria-expanded", "true");
  (bodyEl as HTMLElement)!.hidden = false;
}

/* Append a "tool module" to the target assistant bubble.
   Layout (collapsed):  [icon]  Short name  ·  input preview       ▾
   Layout (expanded):    + code/command body
                         + live output (streamed) */
export function appendToolModule(toolName: string, toolInput: ToolInput, body?: HTMLElement | null, opts: ToolCardOptions = {}): HTMLElement | null {
  opts = opts || {};
  body = resolveToolCardBody(body);
  if (!body) return null;
  const meta = TOOL_META[toolName] || { cls: "", short: toolName, tone: "neutral" };
  const { card, isRunningCard } = createToolCard(toolName, toolInput, opts, meta);
  setToolCardLabels(card, toolName, toolInput, opts, meta);

  // Always mount the code/body block; [hidden] keeps it ready for stream updates.
  const codeEl = card.querySelector(".agent-tool-code");
  const codeInner = codeEl!.querySelector("code");
  const bodyEl = card.querySelector(".agent-tool-body");
  initializeToolCardCode(card, toolName, toolInput, codeEl, codeInner, bodyEl);
  const head = card.querySelector(".agent-tool-head");
  wireToolCardDisclosure(card, head, bodyEl);

  // Mark the card as live-wired so the delegated fallback toggle below
  // (for cards revived from serialized session HTML, which lose their
  // listeners) does not double-toggle this one.
  card.dataset.wired = "1";

  // Running cards expand so readers can watch progress; restored cards stay collapsed.
  if (isRunningCard) expandRunningToolCard(card, head, bodyEl);

  body.appendChild(card);
  // Stash the rich return on the card so updateToolCardCode can
  // reach the code element without re-querying. We still return
  // the .agent-tool-out element for backward compat with callers
  // that pre-date the streaming rewrite.
  card._tcRefs = { out: card.querySelector<HTMLElement>(".agent-tool-out"), code: codeEl as HTMLElement | null, codeInner: codeInner as HTMLElement | null, body: bodyEl as HTMLElement };
  syncToolCopyActions(card);
  // Running cards join the shared elapsed timer (Req 3.2). It writes the
  // live time into .agent-tool-status and, on the terminal transition,
  // latches the final total-duration label (Req 3.3). Restored/terminal
  // cards never register, so the timer only runs while work is in flight.
  if (isRunningCard) startToolCardTimer(card);
  if (typeof browserWindow.scrollMainToBottom === "function") browserWindow.scrollMainToBottom();
  return card.querySelector<HTMLElement>(".agent-tool-out");
}

/* Delegated fallback expand/collapse. Tool cards that are re-created from
   persisted message HTML (history replay, share view, React handoff of a
   serialized bubble) arrive WITHOUT the per-card listeners attached by
   appendToolModule — innerHTML round-trips drop them — which made those
   cards impossible to expand. One document-level listener restores the
   affordance for any un-wired card; live cards (data-wired="1") keep
   their own handler and are skipped here to avoid double-toggling. */
if (typeof document !== "undefined" && !(document as Document & { __socratesToolCardDelegate?: boolean }).__socratesToolCardDelegate) {
  (document as Document & { __socratesToolCardDelegate?: boolean }).__socratesToolCardDelegate = true;
  document.addEventListener("click", function (ev) {
    const target = ev.target;
    const head = target && (target as Element).closest && (target as Element).closest(".agent-tool-head");
    if (!head) return;
    const card = head.closest(".agent-tool-card");
    if (!card || (card as HTMLElement).dataset.wired === "1") return;
    if ((target as Element).closest && (target as Element).closest(".agent-tool-action")) return;
    const bodyEl = card.querySelector(".agent-tool-body");
    if (!bodyEl) return;
    const open = card.classList.toggle("open");
    head.setAttribute("aria-expanded", open ? "true" : "false");
    (bodyEl as HTMLElement).hidden = !open;
    if (open) card.dispatchEvent(new CustomEvent("tool-details-opened"));
  });
}

/* Update the code block of an existing tool card. Called by the
   streaming controller on every tool_call_delta frame so the code
   streams into the card in real time. We use a single textContent
   assignment so the browser doesn't re-tokenise on every char and
   hljs only re-highlights on the final frame. */
function updateToolCardCodeContent(card: HTMLElement, codeEl: HTMLElement, codeInner: HTMLElement, extracted: { code: string; language?: string; parsed?: boolean; truncated?: boolean }, language: string) {
  if (!extracted.code) return;
  const inputEl = card.querySelector<HTMLElement>(".agent-tool-input");
  const preview = toolInputPreviewFromExtracted(card.dataset.tool || '', extracted);
  if (inputEl && preview && inputEl.textContent !== preview) inputEl.textContent = preview;
  if (codeInner.textContent !== extracted.code) {
    codeInner.textContent = extracted.code;
    if (language && !codeInner.className.includes(language)) codeInner.className = `language-${language}`;
  }
  codeEl.hidden = false;
  codeEl.classList.add("agent-tool-code-streaming");
  syncToolCopyActions(card);
}

function updateToolCardTruncation(codeEl: { classList: { add: (arg0: string) => void; remove: (arg0: string) => void; }; }, extracted: { code?: any; language?: any; parsed: any; truncated: any; }) {
  if (extracted.truncated && extracted.parsed === false) {
    codeEl.classList.add("agent-tool-code-truncated");
  } else if (extracted.parsed) {
    codeEl.classList.remove("agent-tool-code-truncated");
  }
}

function highlightFinalToolCardCode(codeEl: { classList: { remove: (arg0: string) => void; }; }, codeInner: HTMLElement, extracted: { code?: any; language?: any; parsed: any; truncated?: any; }) {
  if (!extracted.parsed) return;
  codeEl.classList.remove("agent-tool-code-streaming");
  highlightCodeElement(codeInner);
}

export function updateToolCardCode(tcId: any, argsJson: any, language: any) {
  const card = findToolCard(tcId);
  if (!card) return null;
  // Use the cached refs from appendToolModule when available — saves
  // two querySelector calls per frame at 60fps. Fall back to the
  // DOM walk for cards built by older code paths.
  const refs = (card as ToolCardElement)._tcRefs;
  const codeEl = (refs && refs.code) || card.querySelector<HTMLElement>(".agent-tool-code");
  const codeInner = (refs && refs.codeInner) || (codeEl && codeEl.querySelector<HTMLElement>("code"));
  if (!codeEl || !codeInner) return null;

  const extracted = extractCodeFromArgs((card as HTMLElement).dataset.tool!, argsJson);
  const lang = language || extracted.language || "";
  updateToolCardCodeContent(card, codeEl, codeInner, extracted, lang);
  updateToolCardTruncation(codeEl, extracted);
  highlightFinalToolCardCode(codeEl, codeInner, extracted);
  if (typeof browserWindow.scrollMainToBottom === "function") browserWindow.scrollMainToBottom();
  return extracted;
}

/* Update the most recently appended tool card's output. When outEl
   is provided, write directly to it (avoids the fragile last-card
   selector). */
export function setLastToolOutput(text: unknown, isError?: boolean, outEl?: HTMLElement | null) {
  let out: HTMLElement | null = outEl || null;
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

export function renderToolTextOutput(out: { replaceChildren: (arg0: HTMLDivElement) => void; classList: { add: (arg0: string) => void; remove: (arg0: string) => void; }; closest: (arg0: string) => any; }, text: any, opts: { isError?: any; kind?: any; }) {
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
    const toggleHost = document.createElement("span");
    toggleHost.className = "agent-tool-output-toggle-host";
    const showLabel = trTool("tool.showFullOutput", "Show full output");
    const collapseLabel = trTool("tool.collapseOutput", "Collapse output");
    function renderToggle(collapsed: boolean) {
      renderToolOutputToggle(toggleHost, {
        collapsed,
        showLabel,
        collapseLabel,
        onToggle: function (nextCollapsed: boolean|undefined) {
          const next = nextCollapsed ?? false;
          wrap.classList.toggle("is-collapsed", next);
          renderToggle(next);
        },
      });
    }
    renderToggle(true);
    controls.appendChild(summary);
    controls.appendChild(toggleHost);
    wrap.appendChild(controls);
  }

  out.replaceChildren(wrap);
  if (opts.isError) out.classList.add("error"); else out.classList.remove("error");
  syncToolCopyActions(out.closest(".agent-tool-card"));
  return wrap;
}

/* Compatibility hook for older history/share callers. File changes now use
   their existing summary row, so a second nested card is intentionally absent. */
export function appendFileChangeSummaryCards(root: any) {
  void root;
}
