/**
 * DOCX text extractor — mammoth → HTML → markdown.
 *
 * extractRawText flattened everything into paragraph runs: headings lost
 * their level, list items lost their bullets/numbers, and table cells came
 * out one per line so the model could not tell which value belonged to
 * which column. We now ask mammoth for semantic HTML (its default style map
 * already maps Word's Heading 1–6, lists and tables) and walk that DOM into
 * markdown: `#` headings, `-` / `1.` lists with nesting, `| a | b |`
 * tables, `**bold**`, ^superscript / _subscript (exponents and chemical
 * formulas in homework), and `[image: alt]` placeholders instead of
 * multi-megabyte base64 data URIs.
 *
 * If the HTML route fails for any reason we fall back to extractRawText,
 * so this is never worse than before.
 */
import mammoth from 'mammoth';
import { JSDOM } from 'jsdom';
import { assertNotEncryptedOoxml, cleanExtractedText, markdownTable, parseError } from './text.js';

interface DomNode {
  nodeType: number;
  nodeName: string;
  textContent: string | null;
  childNodes: ArrayLike<DomNode>;
  getAttribute?: (name: string) => string | null;
}

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

function children(node: DomNode): DomNode[] {
  return Array.from(node.childNodes || []);
}

function tag(node: DomNode): string {
  return String(node.nodeName || '').toLowerCase();
}

function inline(node: DomNode): string {
  if (node.nodeType === TEXT_NODE) return String(node.textContent || '').replace(/\s+/g, ' ');
  if (node.nodeType !== ELEMENT_NODE) return '';
  const t = tag(node);
  if (t === 'br') return '\n';
  if (t === 'img') {
    const alt = (node.getAttribute?.('alt') || '').trim();
    return alt ? `[image: ${alt}]` : '[image]';
  }
  const inner = children(node).map(inline).join('');
  switch (t) {
    case 'strong':
    case 'b':
      return inner.trim() ? `**${inner.trim()}**` : inner;
    case 'sup':
      return inner.trim() ? (inner.trim().length === 1 ? `^${inner.trim()}` : `^(${inner.trim()})`) : '';
    case 'sub':
      return inner.trim() ? (inner.trim().length === 1 ? `_${inner.trim()}` : `_(${inner.trim()})`) : '';
    case 'a': {
      const href = node.getAttribute?.('href') || '';
      const text = inner.trim();
      if (/^https?:\/\//i.test(href) && text && text !== href) return `${text} (${href})`;
      return inner;
    }
    /* Block elements nested inside a table cell or list item flatten to
       inline text separated by spaces. */
    case 'p':
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6':
    case 'li':
      return ` ${inner} `;
    default:
      return inner;
  }
}

function listBlock(list: DomNode, depth: number): string[] {
  const ordered = tag(list) === 'ol';
  const lines: string[] = [];
  let n = 0;
  for (const item of children(list)) {
    if (item.nodeType !== ELEMENT_NODE || tag(item) !== 'li') continue;
    n++;
    const own: string[] = [];
    const nested: string[] = [];
    for (const child of children(item)) {
      const ct = tag(child);
      if (ct === 'ul' || ct === 'ol') nested.push(...listBlock(child, depth + 1));
      else own.push(inline(child));
    }
    const text = own.join('').replace(/\s+/g, ' ').trim();
    const indent = '  '.repeat(depth);
    lines.push(`${indent}${ordered ? `${n}.` : '-'} ${text}`);
    lines.push(...nested);
  }
  return lines;
}

function tableBlock(table: DomNode): string {
  const rows: string[][] = [];
  const visit = (node: DomNode) => {
    for (const child of children(node)) {
      const ct = tag(child);
      if (ct === 'tr') {
        rows.push(children(child)
          .filter((c) => tag(c) === 'td' || tag(c) === 'th')
          .map((c) => inline(c).replace(/\s+/g, ' ').trim()));
      } else if (ct === 'thead' || ct === 'tbody' || ct === 'tfoot') {
        visit(child);
      }
    }
  };
  visit(table);
  return markdownTable(rows);
}

function blocks(root: DomNode): string[] {
  const out: string[] = [];
  for (const node of children(root)) {
    if (node.nodeType === TEXT_NODE) {
      const text = String(node.textContent || '').trim();
      if (text) out.push(text);
      continue;
    }
    if (node.nodeType !== ELEMENT_NODE) continue;
    const t = tag(node);
    const heading = /^h([1-6])$/.exec(t);
    if (heading) {
      const text = inline(node).replace(/\s+/g, ' ').trim();
      if (text) out.push(`${'#'.repeat(Number(heading[1]))} ${text}`);
    } else if (t === 'ul' || t === 'ol') {
      const lines = listBlock(node, 0);
      if (lines.length) out.push(lines.join('\n'));
    } else if (t === 'table') {
      const md = tableBlock(node);
      if (md) out.push(md);
    } else if (t === 'p' || t === 'blockquote' || t === 'pre') {
      const text = inline(node).replace(/[ \t]+/g, ' ').trim();
      if (text) out.push(t === 'blockquote' ? `> ${text}` : text);
    } else if (t === 'div' || t === 'section' || t === 'article' || t === 'body') {
      out.push(...blocks(node));
    } else {
      const text = inline(node).replace(/[ \t]+/g, ' ').trim();
      if (text) out.push(text);
    }
  }
  return out;
}

export async function extract(filepath: string) {
  await assertNotEncryptedOoxml(filepath, 'docx');

  let markdown = '';
  let messageCount = 0;
  let tableCount = 0;
  let headingCount = 0;
  try {
    const result = await mammoth.convertToHtml({ path: filepath }, {
      /* Placeholder <img> (alt text kept by mammoth) instead of base64. */
      convertImage: mammoth.images.imgElement(async () => ({ src: '' })),
    });
    messageCount = Array.isArray(result?.messages) ? result.messages.length : 0;
    const dom = new JSDOM(`<!doctype html><html><body>${String(result?.value || '')}</body></html>`);
    const body = dom.window.document.body as DomNode;
    const parts = blocks(body);
    tableCount = parts.filter((p) => p.startsWith('| ')).length;
    headingCount = parts.filter((p) => /^#{1,6} /.test(p)).length;
    markdown = parts.join('\n\n');
    dom.window.close?.();
  } catch {
    markdown = '';
  }

  if (!markdown.trim()) {
    /* Fallback: the previous raw-text path. */
    let raw;
    try {
      raw = await mammoth.extractRawText({ path: filepath });
    } catch (e) {
      const em = e as Error;
      throw parseError('PARSE_FAILED', 'docx_parse_failed: ' + (em.message || em));
    }
    messageCount = Array.isArray(raw?.messages) ? raw.messages.length : messageCount;
    markdown = String(raw?.value || '');
  }

  // mammoth.messages are warnings (unsupported styles etc.) — only the
  // count is surfaced so raw XML warnings never reach the client.
  const meta: Record<string, unknown> = { format: 'markdown', warnings: messageCount };
  if (headingCount) meta.headings = headingCount;
  if (tableCount) meta.tables = tableCount;
  return {
    text: cleanExtractedText(markdown),
    truncated: false,
    meta,
  };
}
