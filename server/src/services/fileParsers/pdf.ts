/**
 * PDF text extractor — pdf-parse (bundled pdf.js) with a custom page
 * renderer.
 *
 * Compared with pdf-parse's default renderer this:
 *   - prefixes every page with a `[Page N]` marker so the model can cite
 *     pages and the reader can tell where a page starts;
 *   - re-inserts the spaces pdf.js drops between same-line text items of
 *     Latin text (the default glued "Hello" + "world" into "Helloworld"),
 *     while keeping CJK runs unspaced;
 *   - keeps paragraph breaks where the vertical gap is larger than a line;
 *   - counts text per page so a scanned PDF (images only, no text layer)
 *     is flagged instead of returning an empty string the model would read
 *     as "this document is blank";
 *   - turns pdf.js PasswordException into a clear ENCRYPTED error.
 */

import fs from 'node:fs/promises';
import { parseError } from './text.js';

interface PdfTextItem {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
}

interface PdfPage {
  pageIndex?: number;
  getTextContent(opts: Record<string, unknown>): Promise<{ items: PdfTextItem[] }>;
}

type PdfParseFn = (data: Buffer, opts?: Record<string, unknown>) => Promise<{
  text?: string;
  numpages?: number;
  info?: Record<string, unknown>;
}>;

/* A page with fewer visible characters than this is treated as having no
   text layer (page numbers and stray headers survive scanning tools). */
const MIN_CHARS_PER_TEXT_PAGE = 20;

const CJK = /[\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/;

function renderItems(items: PdfTextItem[]): string {
  let out = '';
  let lastY: number | null = null;
  let lastXEnd = 0;
  let lastLineHeight = 0;
  for (const item of items) {
    const str = String(item.str ?? '');
    const t = item.transform || [1, 0, 0, 1, 0, 0];
    const x = Number(t[4]) || 0;
    const y = Number(t[5]) || 0;
    const fontSize = Math.abs(Number(item.height) || Math.hypot(Number(t[2]) || 0, Number(t[3]) || 0) || 10);
    if (lastY === null) {
      out += str;
    } else {
      const dy = Math.abs(y - lastY);
      if (dy <= Math.max(1, fontSize * 0.4)) {
        /* Same visual line: add a space when there is a visible gap and
           neither neighbour is CJK. */
        const gap = x - lastXEnd;
        const prev = out.slice(-1);
        const next = str.slice(0, 1);
        if (gap > fontSize * 0.2 && prev && next && prev !== ' ' && next !== ' '
            && !CJK.test(prev) && !CJK.test(next)) {
          out += ' ';
        }
        out += str;
      } else {
        const lineHeight = lastLineHeight || fontSize;
        out += dy > lineHeight * 1.8 ? '\n\n' : '\n';
        out += str;
      }
    }
    if (str.trim()) {
      lastY = y;
      lastXEnd = x + (Number(item.width) || 0);
      lastLineHeight = fontSize * 1.2;
    } else if (lastY === null) {
      lastY = y;
    }
  }
  return out.replace(/[ \t]+\n/g, '\n').trim();
}

export async function extract(filepath: string) {
  const mod = await import('pdf-parse');
  const pdfParse = ((mod as { default?: unknown }).default || mod) as PdfParseFn;
  const data = await fs.readFile(filepath);

  const pageTexts: string[] = [];
  let rendered = 0;
  const pagerender = async (page: PdfPage) => {
    const index = typeof page.pageIndex === 'number' ? page.pageIndex : rendered;
    rendered++;
    const content = await page.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
    const text = renderItems(content.items || []);
    pageTexts[index] = text;
    return text;
  };

  let result;
  try {
    result = await pdfParse(data, { pagerender });
  } catch (e) {
    const err = e as { name?: string; message?: string };
    if (err?.name === 'PasswordException' || /password/i.test(String(err?.message || ''))) {
      throw parseError('ENCRYPTED',
        'pdf_encrypted: this PDF is password-protected. Remove the password (or print it to a new PDF) and upload it again.');
    }
    throw parseError('PARSE_FAILED', 'pdf_parse_failed: ' + (err?.message || String(e)));
  }

  const pageCount = Number(result?.numpages) || pageTexts.length;
  const parts: string[] = [];
  const emptyPages: number[] = [];
  let textChars = 0;
  for (let i = 0; i < pageCount; i++) {
    const body = pageTexts[i] ?? '';
    const visible = body.replace(/\s+/g, '').length;
    textChars += visible;
    if (visible < MIN_CHARS_PER_TEXT_PAGE) emptyPages.push(i + 1);
    parts.push(`[Page ${i + 1}]\n${body || '(no extractable text on this page)'}`);
  }

  /* Whole-document verdict: almost no text across the pages means a
     scanned or image-only PDF. Mixed documents list the image-only pages. */
  const scanned = pageCount > 0 && textChars / pageCount < MIN_CHARS_PER_TEXT_PAGE;
  const info = (result?.info || {}) as Record<string, unknown>;
  const title = typeof info.Title === 'string' ? info.Title.trim() : '';

  const meta: Record<string, unknown> = { pageCount };
  if (title) meta.title = title;
  if (scanned) {
    meta.scanned = true;
    meta.textLayer = 'none';
  } else if (emptyPages.length > 0) {
    meta.pagesWithoutText = emptyPages.length > 20
      ? `${emptyPages.slice(0, 20).join(',')},… (${emptyPages.length} pages)`
      : emptyPages.join(',');
  }

  return {
    text: parts.join('\n\n'),
    truncated: false,
    meta,
  };
}
