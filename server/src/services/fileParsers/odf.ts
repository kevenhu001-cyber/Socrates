/**
 * ODF text extractors (OpenDocument: .odt / .ods / .odp) — hand-rolled
 * on top of JSZip + xml2js, the same stack as the PPTX parser.
 *
 * An ODF file is a ZIP whose `content.xml` holds the document body:
 *   - .odt: office:body/office:text → text:h / text:p (/ lists)
 *   - .ods: office:body/office:spreadsheet → table:table/row/cell
 *   - .odp: office:body/office:presentation → draw:page → text runs
 *
 * xml2js runs with explicitChildren + preserveChildrenOrder +
 * charsAsChildren so mixed content (`First <span>para</span>.`) and
 * heading/paragraph interleaving keep document order — the default
 * mode merges sibling text runs and would emit `First .para`.
 *
 * No new dependency: jszip + xml2js are already on the upload path.
 * Output budgets mirror the other parsers (200 KB text cap) so a huge
 * document cannot blow memory before truncation.
 */
import JSZip from 'jszip';
import { parseStringPromise } from 'xml2js';
import fs from 'node:fs/promises';

const MAX_OUTPUT_CHARS = 200 * 1024;
const MAX_SHEETS = 50;
const MAX_ROWS_PER_SHEET = 5000;
const MAX_SLIDES = 200;

interface OdfNode {
  '#name'?: string;
  _?: unknown;
  $?: Record<string, string>;
  $$?: OdfNode[];
  [key: string]: unknown;
}

const PARSE_OPTS = {
  explicitArray: false,
  explicitChildren: true,
  preserveChildrenOrder: true,
  charsAsChildren: true,
  includeWhiteChars: true,
  mergeAttrs: false,
  trim: false,
};

function asArray<T>(v: unknown): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? (v as T[]) : [v as T];
}

function orderedChildren(node: unknown): OdfNode[] {
  if (!node || typeof node !== 'object') return [];
  const kids = (node as OdfNode).$$;
  return Array.isArray(kids) ? kids : [];
}

/** Inline text of a node in document order (spans, trailing punctuation). */
function inlineText(node: unknown): string {
  if (node === undefined || node === null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(inlineText).join('');
  if (typeof node === 'object') {
    const o = node as OdfNode;
    const kids = orderedChildren(o);
    if (kids.length > 0) return kids.map(inlineText).join('');
    let out = '';
    if (o._ !== undefined) out += inlineText(o._);
    for (const key of Object.keys(o)) {
      if (key === '$' || key === '_' || key === '#name' || key === '$$') continue;
      out += inlineText(o[key]);
    }
    return out;
  }
  return '';
}

/** Block paragraphs/headings of a text container, in document order. */
function blockTexts(container: unknown): string[] {
  const out: string[] = [];
  for (const child of orderedChildren(container)) {
    const name = child['#name'];
    if (name === 'text:p') {
      const t = inlineText(child).trim();
      if (t) out.push(t);
    } else if (name === 'text:h') {
      const t = inlineText(child).trim();
      if (t) out.push(`## ${t}`);
    } else if (name === 'text:list') {
      for (const item of orderedChildren(child).filter((c) => c['#name'] === 'text:list-item')) {
        for (const t of blockTexts(item)) out.push(`- ${t.replace(/^## /, '')}`);
      }
    }
  }
  // Fallback for containers parsed without $$ (should not happen).
  if (out.length === 0 && container && typeof container === 'object') {
    const o = container as OdfNode;
    for (const p of asArray<unknown>(o['text:p'])) {
      const t = inlineText(p).trim();
      if (t) out.push(t);
    }
  }
  return out;
}

/** Deep-collect every paragraph/heading under a node (slides, shapes). */
function deepTexts(node: unknown, out: string[]): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) deepTexts(child, out);
    return;
  }
  for (const t of blockTexts(node)) out.push(t);
  for (const child of orderedChildren(node)) {
    if (child['#name'] === 'text:p' || child['#name'] === 'text:h' || child['#name'] === 'text:list') continue;
    deepTexts(child, out);
  }
}

/** First child element with the given tag (explicitArray:false → object or array). */
function childNamed(node: unknown, name: string): OdfNode | undefined {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return undefined;
  return asArray<OdfNode>((node as OdfNode)[name] as never)[0];
}

function attr(node: unknown, name: string): string {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return '';
  const attrs = (node as OdfNode).$;
  const v = attrs ? attrs[name] : undefined;
  return typeof v === 'string' ? v : '';
}

async function loadBody(filepath: string): Promise<OdfNode> {
  const buf = await fs.readFile(filepath);
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch (e) {
    throw coded(e, 'odf_parse_failed');
  }
  const entry = zip.file('content.xml');
  if (!entry) throw coded('missing content.xml', 'odf_parse_failed');
  let parsed: unknown;
  try {
    parsed = await parseStringPromise(await entry.async('string'), PARSE_OPTS);
  } catch (e) {
    throw coded(e, 'odf_parse_failed');
  }
  const doc = (parsed as OdfNode)?.['office:document-content'] as OdfNode | undefined;
  const body = doc ? childNamed(doc, 'office:body') : undefined;
  if (!body) throw coded('missing office:body', 'odf_parse_failed');
  return body;
}

function coded(e: unknown, code: string): Error & { code: string } {
  const em = e instanceof Error ? e : new Error(String(e));
  const err = new Error(`${code}: ${em.message}`) as Error & { code: string };
  err.code = 'PARSE_FAILED';
  return err;
}

function cap() {
  const parts: string[] = [];
  let outChars = 0;
  let truncated = false;
  const push = (s: string) => {
    if (outChars + s.length > MAX_OUTPUT_CHARS) {
      const room = MAX_OUTPUT_CHARS - outChars;
      if (room > 0) parts.push(s.slice(0, room));
      outChars = MAX_OUTPUT_CHARS;
      truncated = true;
      return false;
    }
    parts.push(s);
    outChars += s.length;
    return true;
  };
  return { push, done: () => truncated, text: () => parts.join('\n').replace(/\r\n/g, '\n') };
}

export async function extractOdt(filepath: string) {
  const body = await loadBody(filepath);
  const textNode = childNamed(body, 'office:text');
  if (!textNode) throw coded('missing office:text', 'odf_parse_failed');
  const { push, done, text } = cap();
  for (const para of blockTexts(textNode)) {
    if (!push(para + '\n')) break;
  }
  return { text: text(), truncated: done(), meta: {} };
}

const SHEET_HEADER = (name: string) => `### Sheet: ${name || 'Untitled'}\n`;

export async function extractOds(filepath: string) {
  const body = await loadBody(filepath);
  const calc = childNamed(body, 'office:spreadsheet');
  if (!calc) throw coded('missing office:spreadsheet', 'odf_parse_failed');
  const tables = asArray<OdfNode>((calc as OdfNode)['table:table']).slice(0, MAX_SHEETS);
  const { push, done, text } = cap();
  let sheetCount = 0;
  for (const table of tables) {
    sheetCount++;
    if (!push(SHEET_HEADER(attr(table, 'table:name')))) break;
    const rows = asArray<OdfNode>(table['table:table-row']);
    let rowCount = 0;
    let go = true;
    for (const row of rows) {
      if (!go || rowCount >= MAX_ROWS_PER_SHEET) break;
      const cells: string[] = [];
      for (const cell of asArray<OdfNode>(row['table:table-cell'])) {
        // Covered cells (merge continuations) carry no text — skip.
        const repeat = Math.max(1, parseInt(attr(cell, 'table:number-columns-repeated') || '1', 10) || 1);
        const t = blockTexts(cell).join(' ');
        for (let i = 0; i < Math.min(repeat, MAX_ROWS_PER_SHEET); i++) cells.push(t);
      }
      const line = cells.join('\t');
      if (line.trim().length > 0) {
        rowCount++;
        go = push(line + '\n');
      }
    }
    if (rowCount >= MAX_ROWS_PER_SHEET) {
      push(`\n[sheet truncated at ${MAX_ROWS_PER_SHEET} rows]\n`);
    }
    if (!go) break;
    push('\n');
  }
  return { text: text(), truncated: done(), meta: { sheetCount } };
}

export async function extractOdp(filepath: string) {
  const body = await loadBody(filepath);
  const pres = childNamed(body, 'office:presentation');
  if (!pres) throw coded('missing office:presentation', 'odf_parse_failed');
  const pages = asArray<OdfNode>(pres['draw:page']).slice(0, MAX_SLIDES);
  const { push, done, text } = cap();
  let slideCount = 0;
  for (const page of pages) {
    slideCount++;
    if (!push(`### Slide ${slideCount}\n`)) break;
    const runs: string[] = [];
    deepTexts(page, runs);
    for (const t of runs) {
      if (!push(t + '\n')) break;
    }
    push('\n');
  }
  return { text: text(), truncated: done(), meta: { slideCount } };
}
