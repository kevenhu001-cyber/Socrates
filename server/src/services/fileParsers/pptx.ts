/**
 * PPTX text extractor — hand-rolled on top of JSZip + xml2js.
 *
 * Why no library: the popular `pptx-parser` package pulls in
 * `phantomjs`-era `window` globals that fail in Node. PPTX is just a
 * ZIP of OOXML — `ppt/slides/slide{N}.xml` holds each slide.
 *
 * Output per slide:
 *
 *   ## Slide 3
 *   ### <slide title>
 *   - bullet
 *     - sub-bullet
 *   | table | cells |
 *   Notes: <speaker notes>
 *
 * Earlier versions emitted every `<a:t>` run on its own line, which split
 * one sentence into fragments wherever the formatting changed mid-line, and
 * ignored tables and speaker notes. We now join runs per paragraph
 * (`<a:p>`), mark the title placeholder, indent by bullet level, render
 * `<a:tbl>` as markdown tables, walk grouped shapes, and append speaker
 * notes (often the lecturer's actual explanation) from the slide's
 * notesSlide relationship. Charts, SmartArt and images stay out of scope.
 */
import JSZip from 'jszip';
import { parseStringPromise } from 'xml2js';
import { assertNotEncryptedOoxml, cleanExtractedText, markdownTable, parseError } from './text.js';

const SLIDE_PATH = /^ppt\/slides\/slide(\d+)\.xml$/i;

/* Same output budget as xlsx — stop materializing slides once the
   cap is hit so a huge deck cannot blow memory before truncation. */
const MAX_OUTPUT_CHARS = 200 * 1024;
const MAX_SLIDES = 200;

type XNode = Record<string, unknown>;

const PARSE_OPTS = {
  explicitArray: true,
  mergeAttrs: false,
  /* trim:false — trimming each <a:t> glued "Hello " + "world". */
  trim: false,
  explicitCharkey: false,
};

function arr(v: unknown): XNode[] {
  if (v === undefined || v === null) return [];
  return (Array.isArray(v) ? v : [v]) as XNode[];
}

function first(node: XNode | undefined, key: string): XNode | undefined {
  return node ? arr(node[key])[0] : undefined;
}

function attr(node: XNode | undefined, name: string): string | undefined {
  const a = node?.['$'] as Record<string, string> | undefined;
  return a ? a[name] : undefined;
}

function textOf(t: unknown): string {
  if (t === undefined || t === null) return '';
  if (typeof t === 'string' || typeof t === 'number') return String(t);
  if (typeof t === 'object') return String((t as XNode)._ ?? '');
  return '';
}

/** All `<a:t>` text in a node, any depth (fallback only). */
function collectTextRuns(node: unknown, out: string[]): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const child of node) collectTextRuns(child, out);
    return;
  }
  if (typeof node === 'object') {
    const obj = node as XNode;
    if (obj['a:t'] !== undefined) for (const t of arr(obj['a:t'])) out.push(textOf(t));
    for (const key of Object.keys(obj)) {
      if (key === '$' || key === 'a:t') continue;
      collectTextRuns(obj[key], out);
    }
  }
}

interface Para { text: string; level: number; bullet: boolean | null }

function paragraphs(txBody: XNode | undefined): Para[] {
  const out: Para[] = [];
  for (const p of arr(txBody?.['a:p'])) {
    let text = '';
    /* xml2js groups children by tag, so run/field/break order inside one
       paragraph is approximated as runs then fields; soft line breaks
       (<a:br>) are not reproduced. Good enough for slide text. */
    for (const r of arr(p['a:r'])) for (const t of arr(r['a:t'])) text += textOf(t);
    for (const f of arr(p['a:fld'])) for (const t of arr(f['a:t'])) text += textOf(t);
    text = text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const pPr = first(p, 'a:pPr');
    const level = Number(attr(pPr, 'lvl') || 0) || 0;
    let bullet: boolean | null = null;
    if (pPr && (pPr['a:buChar'] || pPr['a:buAutoNum'])) bullet = true;
    if (pPr && pPr['a:buNone']) bullet = false;
    out.push({ text, level, bullet });
  }
  return out;
}

function placeholderType(sp: XNode): string | null {
  const nv = first(sp, 'p:nvSpPr');
  const nvPr = first(nv, 'p:nvPr');
  const ph = first(nvPr, 'p:ph');
  if (!ph) return null;
  return attr(ph, 'type') || 'obj';
}

function tableMarkdown(tbl: XNode): string {
  const rows: string[][] = [];
  for (const tr of arr(tbl['a:tr'])) {
    rows.push(arr(tr['a:tc']).map((tc) => paragraphs(first(tc, 'a:txBody')).map((p) => p.text).join(' ')));
  }
  return markdownTable(rows);
}

interface SlideContent { title: string; lines: string[] }

function walkShapes(tree: XNode | undefined, acc: SlideContent): void {
  if (!tree) return;
  for (const sp of arr(tree['p:sp'])) {
    const ph = placeholderType(sp);
    if (ph === 'sldNum' || ph === 'dt' || ph === 'ftr' || ph === 'hdr') continue;
    const paras = paragraphs(first(sp, 'p:txBody'));
    if (!paras.length) continue;
    if ((ph === 'title' || ph === 'ctrTitle') && !acc.title) {
      acc.title = paras.map((p) => p.text).join(' ');
      continue;
    }
    const bodyPlaceholder = ph === 'body' || ph === 'obj';
    for (const p of paras) {
      const bulleted = p.bullet ?? (bodyPlaceholder || p.level > 0);
      const indent = '  '.repeat(Math.min(p.level, 6));
      acc.lines.push(bulleted ? `${indent}- ${p.text}` : `${indent}${p.text}`);
    }
    acc.lines.push('');
  }
  for (const gf of arr(tree['p:graphicFrame'])) {
    const data = first(first(gf, 'a:graphic'), 'a:graphicData');
    const tbl = first(data, 'a:tbl');
    if (tbl) {
      const md = tableMarkdown(tbl);
      if (md) acc.lines.push(md, '');
    }
  }
  for (const grp of arr(tree['p:grpSp'])) walkShapes(grp, acc);
}

function spTreeOf(parsed: XNode, root: string): XNode | undefined {
  return first(first(first(parsed, root), 'p:cSld'), 'p:spTree');
}

async function notesFor(zip: JSZip, slideN: number): Promise<string> {
  const relsName = `ppt/slides/_rels/slide${slideN}.xml.rels`;
  const rels = zip.files[relsName];
  if (!rels) return '';
  try {
    const relXml = await parseStringPromise(await rels.async('string'), PARSE_OPTS) as XNode;
    const list = arr(first(relXml, 'Relationships')?.['Relationship']);
    const rel = list.find((r) => /\/notesSlide$/.test(attr(r, 'Type') || ''));
    const target = attr(rel, 'Target');
    if (!target) return '';
    const notesPath = target.startsWith('/')
      ? target.slice(1)
      : `ppt/${target.replace(/^\.\.\//, '')}`;
    const file = zip.files[notesPath];
    if (!file) return '';
    const parsed = await parseStringPromise(await file.async('string'), PARSE_OPTS) as XNode;
    const tree = spTreeOf(parsed, 'p:notes');
    const lines: string[] = [];
    for (const sp of arr(tree?.['p:sp'])) {
      if (placeholderType(sp) !== 'body') continue;
      for (const p of paragraphs(first(sp, 'p:txBody'))) lines.push(p.text);
    }
    return lines.join('\n');
  } catch {
    return '';
  }
}

export async function extract(filepath: string) {
  await assertNotEncryptedOoxml(filepath, 'pptx');
  let zip;
  try {
    const fs = await import('node:fs/promises');
    const buf = await fs.readFile(filepath);
    zip = await JSZip.loadAsync(buf);
  } catch (e) {
    const em = e as Error;
    throw parseError('PARSE_FAILED', 'pptx_unzip_failed: ' + (em.message || em));
  }

  /* Collect slide entries, sort by slide number. */
  const slides: { name: string; n: number }[] = [];
  for (const entry of Object.keys(zip.files)) {
    const m = entry.match(SLIDE_PATH);
    if (m) slides.push({ name: entry, n: parseInt(m[1], 10) });
  }
  if (slides.length === 0) {
    /* .pptx with no slides, or not a real pptx — bail so the caller
       can show a friendly "no slides found" error. */
    throw parseError('EMPTY_DOCUMENT', 'pptx_no_slides: this presentation has no slides.');
  }
  slides.sort((a, b) => a.n - b.n);

  const parts: string[] = [];
  let outChars = 0;
  let truncated = slides.length > MAX_SLIDES;
  let lastSlideShown = 0;
  let notesCount = 0;
  for (const [i, slide] of slides.slice(0, MAX_SLIDES).entries()) {
    if (outChars >= MAX_OUTPUT_CHARS) {
      truncated = true;
      break;
    }
    /* Number by deck position, not by the file name — files can skip
       numbers after slides are deleted and reordered. */
    const position = i + 1;
    let chunk: string;
    try {
      const xml = await zip.files[slide.name].async('string');
      const parsed = await parseStringPromise(xml, PARSE_OPTS) as XNode;
      const acc: SlideContent = { title: '', lines: [] };
      walkShapes(spTreeOf(parsed, 'p:sld'), acc);
      let body = acc.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
      if (!body && !acc.title) {
        const runs: string[] = [];
        collectTextRuns(parsed, runs);
        body = runs.map((s) => s.trim()).filter(Boolean).join('\n');
      }
      const hidden = attr(first(parsed, 'p:sld'), 'show') === '0' ? ' (hidden)' : '';
      const notes = await notesFor(zip, slide.n);
      if (notes) notesCount++;
      chunk = `## Slide ${position}${hidden}\n` +
        (acc.title ? `### ${acc.title}\n` : '') +
        (body || (acc.title ? '' : '(no text on this slide)')) +
        (notes ? `\n\nNotes: ${notes}` : '') + '\n';
    } catch {
      /* Skip individual unreadable slides rather than failing the
         whole document — partial text is better than nothing. */
      chunk = `## Slide ${position}\n[unreadable]\n`;
    }
    if (outChars + chunk.length > MAX_OUTPUT_CHARS) {
      const room = MAX_OUTPUT_CHARS - outChars;
      if (room > 0) parts.push(chunk.slice(0, room));
      outChars = MAX_OUTPUT_CHARS;
      truncated = true;
      lastSlideShown = position;
      break;
    }
    parts.push(chunk);
    outChars += chunk.length;
    lastSlideShown = position;
  }

  const meta: Record<string, unknown> = { slideCount: slides.length };
  if (notesCount) meta.slidesWithNotes = notesCount;
  if (truncated) {
    meta.omitted = `slides ${lastSlideShown + 1}–${slides.length}`;
    parts.push(`\n[presentation truncated — showing slides 1–${lastSlideShown} of ${slides.length}]`);
  }
  return {
    text: cleanExtractedText(parts.join('\n')),
    truncated,
    meta,
  };
}
