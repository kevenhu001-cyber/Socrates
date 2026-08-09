/**
 * Mobile Markdown parser.
 *
 * The web client hands its markdown to `marked` + KaTeX and drops the HTML into
 * the DOM. React Native has no DOM, and running every message through a WebView
 * would cost one native view (and one JS context) per bubble. So this module
 * parses markdown into a small block/inline tree that the renderer maps onto
 * `<Text>`/`<View>`, and marks only the blocks that genuinely need a browser
 * (LaTeX, mermaid, embedded HTML/SVG) so those alone get a WebView.
 *
 * Streaming safety: the last block of a partial message is routinely
 * half-arrived. Unterminated fences, `$$` blocks and viz blocks are returned
 * with `closed: false` so the renderer can show them as plain text instead of
 * feeding a syntax error to KaTeX or thrashing a WebView on every delta.
 *
 * This file is deliberately dependency-free and DOM-free so it can be unit
 * tested directly.
 */

export type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'math'; text: string }
  | { type: 'link'; href: string; children: InlineNode[] }
  | { type: 'strong'; children: InlineNode[] }
  | { type: 'em'; children: InlineNode[] }
  | { type: 'del'; children: InlineNode[] };

export interface ListItem {
  inline: InlineNode[];
  depth: number;
  /** Number shown for ordered items; undefined for bullets. */
  index?: number;
  /** `[ ]` / `[x]` task list state, or undefined when the item is not a task. */
  checked?: boolean;
}

export type VizKind = 'mermaid' | 'plot' | 'html';

export type Block =
  | { type: 'heading'; level: number; inline: InlineNode[] }
  | { type: 'paragraph'; inline: InlineNode[] }
  | { type: 'code'; lang: string; text: string; closed: boolean }
  | { type: 'math'; text: string; closed: boolean }
  | { type: 'viz'; kind: VizKind; text: string; closed: boolean }
  | { type: 'list'; ordered: boolean; items: ListItem[] }
  | { type: 'quote'; blocks: Block[] }
  | { type: 'hr' }
  | { type: 'table'; header: InlineNode[][]; rows: InlineNode[][][] };

const FENCE_RE = /^ {0,3}(```+|~~~+)[ \t]*([^\s`]*)[ \t]*$/;
const HEADING_RE = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;
const HR_RE = /^ {0,3}([-*_])[ \t]*(?:\1[ \t]*){2,}$/;
const QUOTE_RE = /^ {0,3}> ?(.*)$/;
const LIST_RE = /^(\s*)([-*+]|\d{1,9}[.)])[ \t]+(.*)$/;
const TABLE_DIVIDER_RE = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

/** Fence languages the web client routes to a real browser rather than to hljs. */
function vizKindFor(lang: string, body: string): VizKind | null {
  const l = lang.toLowerCase();
  if (l === 'mermaid') return 'mermaid';
  if (l === 'plot' || l === 'chart' || l === 'echarts') return 'plot';
  if (l === 'html' || l === 'viz' || l === 'svg') return 'html';
  // The web renderer also sniffs unlabelled fences that are obviously markup.
  if (!l && /<svg[\s>]/i.test(body)) return 'html';
  return null;
}

export function parseMarkdown(source: string | null | undefined): Block[] {
  const text = String(source ?? '').replace(/\r\n?/g, '\n');
  if (!text.trim()) return [];
  return parseBlocks(text.split('\n'));
}

function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i += 1; continue; }

    const fence = line.match(FENCE_RE);
    if (fence) {
      const marker = fence[1][0].repeat(3);
      const lang = fence[2] || '';
      const body: string[] = [];
      let closed = false;
      i += 1;
      while (i < lines.length) {
        if (lines[i].trimStart().startsWith(marker) && !lines[i].trim().slice(3).match(/[^`~\s]/)) {
          closed = true;
          i += 1;
          break;
        }
        body.push(lines[i]);
        i += 1;
      }
      const content = body.join('\n');
      const kind = vizKindFor(lang, content);
      if (kind) blocks.push({ type: 'viz', kind, text: content, closed });
      else blocks.push({ type: 'code', lang: lang.toLowerCase(), text: content, closed });
      continue;
    }

    // Display math, either `$$…$$` on one line or opened here and closed later.
    const displayMath = readDisplayMath(lines, i);
    if (displayMath) {
      blocks.push(displayMath.block);
      i = displayMath.next;
      continue;
    }

    const heading = line.match(HEADING_RE);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, inline: parseInline(heading[2]) });
      i += 1;
      continue;
    }

    if (HR_RE.test(line)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length) {
        const match = lines[i].match(QUOTE_RE);
        if (match) { inner.push(match[1]); i += 1; continue; }
        // A blank line ends the quote; lazy continuation lines stay inside it.
        if (!lines[i].trim()) break;
        if (isBlockStart(lines[i])) break;
        inner.push(lines[i]);
        i += 1;
      }
      blocks.push({ type: 'quote', blocks: parseBlocks(inner) });
      continue;
    }

    if (LIST_RE.test(line)) {
      const listed = readList(lines, i);
      blocks.push(listed.block);
      i = listed.next;
      continue;
    }

    if (line.includes('|') && i + 1 < lines.length && TABLE_DIVIDER_RE.test(lines[i + 1])) {
      const table = readTable(lines, i);
      blocks.push(table.block);
      i = table.next;
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    if (paragraph.length) blocks.push({ type: 'paragraph', inline: parseInline(paragraph.join('\n')) });
    else i += 1;
  }

  return blocks;
}

function isBlockStart(line: string): boolean {
  return FENCE_RE.test(line)
    || HEADING_RE.test(line)
    || HR_RE.test(line)
    || QUOTE_RE.test(line)
    || LIST_RE.test(line)
    || /^ {0,3}\$\$/.test(line);
}

function readDisplayMath(lines: string[], start: number): { block: Block; next: number } | null {
  const first = lines[start];
  const opener = first.match(/^ {0,3}\$\$(.*)$/);
  if (!opener) return null;
  const sameLine = opener[1].match(/^([\s\S]*?)\$\$\s*$/);
  if (sameLine) {
    return { block: { type: 'math', text: sameLine[1].trim(), closed: true }, next: start + 1 };
  }
  const body: string[] = opener[1] ? [opener[1]] : [];
  let i = start + 1;
  let closed = false;
  while (i < lines.length) {
    const end = lines[i].match(/^([\s\S]*?)\$\$\s*$/);
    if (end) {
      if (end[1].trim()) body.push(end[1]);
      closed = true;
      i += 1;
      break;
    }
    body.push(lines[i]);
    i += 1;
  }
  return { block: { type: 'math', text: body.join('\n').trim(), closed }, next: i };
}

function readList(lines: string[], start: number): { block: Block; next: number } {
  const items: ListItem[] = [];
  let ordered = false;
  let i = start;
  let counter = 0;

  while (i < lines.length) {
    const match = lines[i].match(LIST_RE);
    if (!match) {
      if (!lines[i].trim()) {
        // A single blank line inside a list is tolerated; two end it.
        if (i + 1 < lines.length && LIST_RE.test(lines[i + 1])) { i += 1; continue; }
        break;
      }
      // Indented continuation text belongs to the previous item.
      if (items.length && /^\s{2,}\S/.test(lines[i])) {
        const last = items[items.length - 1];
        last.inline = last.inline.concat([{ type: 'text', text: ' ' }], parseInline(lines[i].trim()));
        i += 1;
        continue;
      }
      break;
    }

    const indent = match[1].replace(/\t/g, '  ').length;
    const marker = match[2];
    const isOrdered = /\d/.test(marker);
    if (!items.length) ordered = isOrdered;

    let body = match[3];
    let checked: boolean | undefined;
    const task = body.match(/^\[([ xX])\]\s+(.*)$/);
    if (task) {
      checked = task[1].toLowerCase() === 'x';
      body = task[2];
    }

    const depth = Math.min(3, Math.floor(indent / 2));
    if (isOrdered && depth === 0) counter += 1;
    items.push({
      inline: parseInline(body),
      depth,
      index: isOrdered ? (depth === 0 ? counter : parseInt(marker, 10) || 1) : undefined,
      checked,
    });
    i += 1;
  }

  return { block: { type: 'list', ordered, items }, next: i };
}

function splitRow(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let escaped = false;
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  for (const char of trimmed) {
    if (escaped) { current += char; escaped = false; continue; }
    if (char === '\\') { escaped = true; continue; }
    if (char === '|') { cells.push(current.trim()); current = ''; continue; }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function readTable(lines: string[], start: number): { block: Block; next: number } {
  const header = splitRow(lines[start]).map(parseInline);
  const rows: InlineNode[][][] = [];
  let i = start + 2;
  while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
    rows.push(splitRow(lines[i]).map(parseInline));
    i += 1;
  }
  return { block: { type: 'table', header, rows }, next: i };
}

/* ── Inline parsing ─────────────────────────────────────────────────── */

/** True when `$…$` at `index` looks like math rather than a currency amount. */
function inlineMathAt(text: string, index: number): { body: string; length: number } | null {
  if (text[index] !== '$' || text[index + 1] === '$') return null;
  if (/\s/.test(text[index + 1] || ' ')) return null;
  for (let j = index + 1; j < text.length; j += 1) {
    if (text[j] === '\\') { j += 1; continue; }
    if (text[j] === '\n') return null;
    if (text[j] !== '$') continue;
    if (/\s/.test(text[j - 1])) return null;
    const body = text.slice(index + 1, j);
    // `$5 and $10` would otherwise become math containing " and ".
    if (!body.trim() || !/[\\^_{}=+\-/*()[\]a-zA-Z0-9]/.test(body)) return null;
    return { body, length: j - index + 1 };
  }
  return null;
}

export function parseInline(source: string): InlineNode[] {
  const text = String(source ?? '');
  const nodes: InlineNode[] = [];
  let buffer = '';

  const flush = () => {
    if (buffer) { nodes.push({ type: 'text', text: buffer }); buffer = ''; }
  };

  let i = 0;
  while (i < text.length) {
    const char = text[i];

    // `\(…\)` / `\[…\]` math must be checked before the generic backslash
    // escape below, which would otherwise swallow the opening delimiter.
    if (char === '\\' && (text[i + 1] === '(' || text[i + 1] === '[')) {
      const closer = text[i + 1] === '(' ? '\\)' : '\\]';
      const close = text.indexOf(closer, i + 2);
      if (close !== -1) {
        flush();
        nodes.push({ type: 'math', text: text.slice(i + 2, close).trim() });
        i = close + 2;
        continue;
      }
    }

    if (char === '\\' && i + 1 < text.length && /[\\`*_~[\]()$#+\-.!>|]/.test(text[i + 1])) {
      buffer += text[i + 1];
      i += 2;
      continue;
    }

    if (char === '`') {
      const ticks = /^`+/.exec(text.slice(i))![0];
      const close = text.indexOf(ticks, i + ticks.length);
      if (close !== -1) {
        flush();
        nodes.push({ type: 'code', text: text.slice(i + ticks.length, close).trim() });
        i = close + ticks.length;
        continue;
      }
    }

    if (char === '$') {
      const math = inlineMathAt(text, i);
      if (math) {
        flush();
        nodes.push({ type: 'math', text: math.body.trim() });
        i += math.length;
        continue;
      }
    }

    if (char === '!' && text[i + 1] === '[') {
      const link = readLink(text, i + 1);
      if (link) {
        flush();
        // No inline images on mobile: show the alt text as a tappable link.
        nodes.push({ type: 'link', href: link.href, children: link.label ? parseInline(link.label) : [{ type: 'text', text: link.href }] });
        i = i + 1 + link.length;
        continue;
      }
    }

    if (char === '[') {
      const link = readLink(text, i);
      if (link) {
        flush();
        nodes.push({ type: 'link', href: link.href, children: parseInline(link.label) });
        i += link.length;
        continue;
      }
    }

    if (char === '~' && text[i + 1] === '~') {
      const close = text.indexOf('~~', i + 2);
      if (close !== -1) {
        flush();
        nodes.push({ type: 'del', children: parseInline(text.slice(i + 2, close)) });
        i = close + 2;
        continue;
      }
    }

    if (char === '*' || char === '_') {
      const emphasis = readEmphasis(text, i, char);
      if (emphasis) {
        flush();
        nodes.push(emphasis.node);
        i += emphasis.length;
        continue;
      }
    }

    if ((char === 'h' || char === 'w') && /^(?:https?:\/\/|www\.)/.test(text.slice(i))) {
      const url = /^(?:https?:\/\/|www\.)[^\s<>()"']+/.exec(text.slice(i))![0].replace(/[.,;:!?]+$/, '');
      flush();
      nodes.push({ type: 'link', href: url.startsWith('www.') ? `https://${url}` : url, children: [{ type: 'text', text: url }] });
      i += url.length;
      continue;
    }

    buffer += char;
    i += 1;
  }

  flush();
  return nodes;
}

function readLink(text: string, start: number): { label: string; href: string; length: number } | null {
  let depth = 0;
  let close = -1;
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === '\\') { i += 1; continue; }
    if (text[i] === '[') depth += 1;
    else if (text[i] === ']') {
      depth -= 1;
      if (depth === 0) { close = i; break; }
    }
  }
  if (close === -1 || text[close + 1] !== '(') return null;
  // URLs legitimately contain parens (wiki links, `alert(1)`), so balance them
  // instead of stopping at the first `)`.
  let end = -1;
  let parens = 0;
  for (let i = close + 1; i < text.length; i += 1) {
    if (text[i] === '\\') { i += 1; continue; }
    if (text[i] === '(') parens += 1;
    else if (text[i] === ')') {
      parens -= 1;
      if (parens === 0) { end = i; break; }
    }
  }
  if (end === -1) return null;
  const target = text.slice(close + 2, end).trim().split(/\s+/)[0];
  if (!target) return null;
  return { label: text.slice(start + 1, close), href: target, length: end - start + 1 };
}

function readEmphasis(text: string, start: number, char: string): { node: InlineNode; length: number } | null {
  const run = char === text[start + 1] ? 2 : 1;
  const delimiter = char.repeat(run);
  // `snake_case_words` must not become emphasis, so `_` needs a word boundary.
  if (char === '_' && run === 1 && /\w/.test(text[start - 1] || '')) return null;
  let search = start + run;
  while (search < text.length) {
    const close = text.indexOf(delimiter, search);
    if (close === -1) return null;
    if (text[close - 1] === '\\') { search = close + run; continue; }
    if (close === start + run) { search = close + run; continue; }
    if (char === '_' && run === 1 && /\w/.test(text[close + 1] || '')) { search = close + run; continue; }
    const inner = text.slice(start + run, close);
    if (!inner.trim()) return null;
    return {
      node: run === 2
        ? { type: 'strong', children: parseInline(inner) }
        : { type: 'em', children: parseInline(inner) },
      length: close + run - start,
    };
  }
  return null;
}

/* ── Helpers used by the renderer ───────────────────────────────────── */

/** True when any node in the tree needs a math typesetter. */
export function hasMath(nodes: InlineNode[]): boolean {
  return nodes.some((node) => {
    if (node.type === 'math') return true;
    return 'children' in node ? hasMath(node.children) : false;
  });
}

/** Flattens a tree back to plain text — used for accessibility labels. */
export function inlineToText(nodes: InlineNode[]): string {
  return nodes.map((node) => {
    if (node.type === 'text' || node.type === 'code') return node.text;
    if (node.type === 'math') return node.text;
    return inlineToText(node.children);
  }).join('');
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Mirrors the web client's URL allowlist. `javascript:` and `data:` hrefs must
 * never reach the WebView, and the native path passes hrefs to `Linking`, which
 * will happily hand an arbitrary scheme to another app.
 */
export function safeHref(href: string): string {
  const value = String(href ?? '').trim();
  if (/^(?:https?:|mailto:|tel:)/i.test(value)) return value;
  // Relative and anchor targets are harmless; anything with a scheme is not.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return '';
  return value;
}

/**
 * Serialises inline nodes to HTML for the WebView path. Math is emitted as an
 * empty span carrying the LaTeX in a data attribute, so the WebView calls
 * `katex.render` on exactly the source we parsed instead of re-scanning
 * delimiters in text we already escaped.
 */
export function inlineToHtml(nodes: InlineNode[]): string {
  return nodes.map((node) => {
    switch (node.type) {
      case 'text': return escapeHtml(node.text).replace(/\n/g, '<br/>');
      case 'code': return `<code>${escapeHtml(node.text)}</code>`;
      case 'math': return `<span data-math="${escapeHtml(node.text)}" data-display="0"></span>`;
      case 'link': {
        const href = safeHref(node.href);
        const inner = inlineToHtml(node.children);
        return href ? `<a href="${escapeHtml(href)}">${inner}</a>` : inner;
      }
      case 'strong': return `<strong>${inlineToHtml(node.children)}</strong>`;
      case 'em': return `<em>${inlineToHtml(node.children)}</em>`;
      case 'del': return `<del>${inlineToHtml(node.children)}</del>`;
      default: return '';
    }
  }).join('');
}

export { escapeHtml };
