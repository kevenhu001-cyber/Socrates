/**
 * render/toolOutput.ts — rich-text formatter for tool execution results.
 *
 * Tool output (Python stdout/stderr, JSON dumps, web_fetch page text) is
 * UNTRUSTED content that the frontend previously dropped into a <pre> via
 * textContent — correct and safe, but it means code blocks, JSON, and
 * tracebacks render as a raw monospace blob with no structure.
 *
 * This module upgrades that sink to a sanitized rich-text renderer:
 *   - ```lang … ``` fences → syntax-highlighted <pre><code> blocks
 *   - JSON documents ({...} / [...]) → pretty-printed, 2-space indent
 *   - everything else → escaped <pre> text (unchanged behavior)
 *
 * Every byte inserted via innerHTML is escaped first (escHTML). The output
 * never reaches the DOM unescaped, so a web result or a Python print()
 * containing `<script>` cannot execute.
 */

import { escHTML, safeHljsLang } from './helpers.js';

export interface FormattedToolOutput {
  html: string;
  rich: boolean;
}

const FENCE_RE = /^```([a-zA-Z0-9_+-]*)[ \t]*\r?\n([\s\S]*?)\r?\n?```[ \t]*$/;

function formatCodeBlock(lang: string, code: string): string {
  const safeLang = safeHljsLang(lang);
  const langClass = safeLang ? ` class="language-${escHTML(safeLang)}"` : '';
  return `<pre class="agent-tool-output-pre"><code${langClass}>${escHTML(code)}</code></pre>`;
}

function prettyJson(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const pretty = JSON.stringify(parsed, null, 2);
    /* Keep the JSON readable but bounded: a multi-MB dump would blow up
       the DOM node. 60k mirrors the server-side tool-result cap. */
    return pretty.length > 60000 ? pretty.slice(0, 60000) + '\n…(truncated)' : pretty;
  } catch (_) {
    return null; // not valid JSON — leave as plain text
  }
}

/**
 * Format untrusted tool output for display.
 *
 * @param text raw tool output (may contain HTML-like markup — treat as hostile)
 * @returns { html, rich } — `html` is safe for innerHTML (escaped), `rich`
 *   is true when a fence/JSON upgrade was applied.
 */
export function formatToolOutput(text: unknown): FormattedToolOutput {
  const raw = String(text ?? '');
  if (raw.length === 0) return { html: '', rich: false };

  /* Whole-output code fence: Python tracebacks / scripts commonly come
     back wrapped in a ```python block from the executor. */
  const fence = FENCE_RE.exec(raw);
  if (fence) {
    return { html: formatCodeBlock(fence[1], fence[2]), rich: true };
  }

  /* JSON documents get pretty-printed. */
  const json = prettyJson(raw);
  if (json !== null) {
    return { html: `<pre class="agent-tool-output-pre"><code>${escHTML(json)}</code></pre>`, rich: true };
  }

  /* Plain text — preserve the old textContent-equivalent behavior, but
     escape so the caller can use innerHTML uniformly. */
  return { html: `<pre class="agent-tool-output-pre">${escHTML(raw)}</pre>`, rich: false };
}
