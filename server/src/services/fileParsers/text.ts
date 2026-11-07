/**
 * Shared helpers for the document parsers: text decoding with encoding
 * detection, whitespace cleanup, markdown tables, typed parse errors, and
 * head/tail truncation with an explicit omission note.
 *
 * No new dependency: decoding uses the WHATWG TextDecoder built into Node
 * (official Node builds ship full ICU, so gb18030 / big5 / utf-16 are
 * available). If a runtime lacks a legacy codec the constructor throws and
 * we fall back to lossy UTF-8.
 */

import fs from 'node:fs/promises';

export type ParseErrorCode =
  | 'PARSE_FAILED'
  | 'ENCRYPTED'
  | 'EMPTY_DOCUMENT'
  | 'UNSUPPORTED_MIME';

export function parseError(code: ParseErrorCode, message: string): Error & { code: ParseErrorCode } {
  const err = new Error(message) as Error & { code: ParseErrorCode };
  err.code = code;
  return err;
}

/* ─── Encoding detection ─── */

/* Very common Chinese characters (simplified + traditional forms). A
   correct decode of Chinese prose hits this set often; decoding GBK bytes
   as Big5 (or the reverse) produces mostly rare characters instead. */
const COMMON_CJK = new Set(Array.from(
  '的一是不了人我在有他这這为為之大来來以个個中上们們到说說国國和地也子时時道出而要于於就下得可你年生' +
  '自会會那后後能对對着著事其里裡所去行过過家十用发發天如然作方成者多日都三小军軍二无無同么麼经經法当當' +
  '起与與好看学學进進种種将將还還分此心前面又定见見只主没沒公从從知问問题題数數实實点點题习習课課答案'
));

function tryDecode(buf: Uint8Array, label: string): string | null {
  try {
    /* stream:true tolerates a multi-byte sequence cut at the end of a
       head-only read instead of rejecting the whole buffer. */
    return new TextDecoder(label, { fatal: true }).decode(buf, { stream: true });
  } catch {
    return null;
  }
}

function commonCjkScore(text: string): number {
  let hits = 0;
  let cjk = 0;
  for (const ch of text.slice(0, 20_000)) {
    const c = ch.codePointAt(0) || 0;
    if (c >= 0x3400 && c <= 0x9fff) {
      cjk++;
      if (COMMON_CJK.has(ch)) hits++;
    }
  }
  return cjk === 0 ? 0 : hits / cjk;
}

export interface DecodedText {
  text: string;
  encoding: string;
}

/**
 * Decode text bytes: BOM (UTF-8 / UTF-16) first, then strict UTF-8, then
 * the Chinese legacy code pages (GB18030 ⊃ GBK ⊃ GB2312, and Big5 for
 * Traditional Chinese files), picking whichever yields common characters.
 */
export function decodeTextBuffer(input: Uint8Array): DecodedText {
  const buf = input;
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(buf.subarray(3)), encoding: 'utf-8 (BOM)' };
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(buf.subarray(2)), encoding: 'utf-16le' };
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    try {
      return { text: new TextDecoder('utf-16be').decode(buf.subarray(2)), encoding: 'utf-16be' };
    } catch { /* codec unavailable — fall through */ }
  }
  const sample = buf.subarray(0, 256 * 1024);
  const utf8 = tryDecode(sample, 'utf-8');
  if (utf8 !== null) {
    return { text: new TextDecoder('utf-8').decode(buf), encoding: 'utf-8' };
  }
  const candidates: Array<{ label: string; score: number }> = [];
  for (const label of ['gb18030', 'big5']) {
    const decoded = tryDecode(sample, label);
    if (decoded !== null) candidates.push({ label, score: commonCjkScore(decoded) });
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (best) {
    try {
      return { text: new TextDecoder(best.label).decode(buf), encoding: best.label };
    } catch { /* fall through */ }
  }
  return { text: new TextDecoder('utf-8').decode(buf), encoding: 'utf-8 (lossy)' };
}

/** Read and decode a whole text file. */
export async function readTextFile(filepath: string): Promise<DecodedText> {
  return decodeTextBuffer(await fs.readFile(filepath));
}

/* ─── Whitespace cleanup ─── */

/**
 * Normalize extracted text for the model: unified newlines, no control or
 * zero-width junk, NBSP/full-width spaces left alone inside lines but
 * trailing whitespace trimmed, and runs of blank lines collapsed. Leading
 * indentation is kept (code, nested lists).
 */
export function cleanExtractedText(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\f/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000e-\u001f\u007f\u200b\u200c\u2060\ufeff\ufffe]/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t\u3000]+$/gm, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/^\n+/, '')
    .replace(/\s+$/, '');
}

/* ─── Markdown tables ─── */

function tableCell(value: unknown): string {
  return String(value ?? '')
    .replace(/\r\n?|\n/g, ' ')
    .replace(/\|/g, '\\|')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Render rows as a GitHub-style markdown table. The first row is the
 * header. Fully-empty rows and trailing empty columns are dropped; ragged
 * rows are padded so columns stay aligned.
 */
export function markdownTable(rows: unknown[][]): string {
  const cleaned = rows
    .map((r) => (Array.isArray(r) ? r : [r]).map(tableCell))
    .filter((r) => r.some((c) => c.length > 0));
  if (cleaned.length === 0) return '';
  let width = 0;
  for (const r of cleaned) {
    let last = r.length;
    while (last > 0 && r[last - 1] === '') last--;
    width = Math.max(width, last);
  }
  if (width === 0) return '';
  const pad = (r: string[]) => {
    const out = r.slice(0, width);
    while (out.length < width) out.push('');
    return `| ${out.join(' | ')} |`;
  };
  const lines = [pad(cleaned[0]), `| ${Array(width).fill('---').join(' | ')} |`];
  for (const r of cleaned.slice(1)) lines.push(pad(r));
  return lines.join('\n');
}

/* ─── Truncation ─── */

export interface TruncateResult {
  text: string;
  truncated: boolean;
  omittedChars: number;
}

/**
 * Keep the head and the tail of a long text (default 75% / 25%), cut on
 * line boundaries, and say exactly what was dropped in between. The tail
 * often carries conclusions, answers or totals that a head-only cut loses.
 */
export function truncateHeadTail(text: string, maxChars: number, headShare = 0.75): TruncateResult {
  if (text.length <= maxChars) return { text, truncated: false, omittedChars: 0 };
  const budget = Math.max(0, maxChars - 200);
  let headEnd = Math.floor(budget * headShare);
  let tailStart = text.length - (budget - headEnd);
  const nlHead = text.lastIndexOf('\n', headEnd);
  if (nlHead > headEnd * 0.8) headEnd = nlHead;
  const nlTail = text.indexOf('\n', tailStart);
  if (nlTail !== -1 && nlTail - tailStart < (text.length - tailStart) * 0.2) tailStart = nlTail + 1;
  const omitted = tailStart - headEnd;
  const omittedLines = text.slice(headEnd, tailStart).split('\n').length - 1;
  const note = `\n\n[… ${omitted} characters (~${omittedLines} lines) omitted from the middle of this file; ` +
    `${text.length} characters in total. Showing the beginning and the end. …]\n\n`;
  return {
    text: text.slice(0, headEnd) + note + text.slice(tailStart),
    truncated: true,
    omittedChars: omitted,
  };
}

/* ─── Encrypted OOXML detection ─── */

/**
 * A password-protected .docx/.xlsx/.pptx is not a ZIP at all: Office wraps
 * it in an OLE compound file (D0 CF 11 E0). The ZIP readers then fail with
 * an opaque "end of central directory" error — detect it up front.
 */
export async function assertNotEncryptedOoxml(filepath: string, kind: string): Promise<void> {
  let head: Buffer;
  const handle = await fs.open(filepath, 'r');
  try {
    head = Buffer.alloc(8);
    await handle.read(head, 0, 8, 0);
  } finally {
    await handle.close();
  }
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) {
    throw parseError('ENCRYPTED',
      `${kind}_encrypted: this ${kind.toUpperCase()} file is password-protected (or saved in a legacy binary format with a modern extension). Remove the password or re-save it, then upload again.`);
  }
  if (!(head[0] === 0x50 && head[1] === 0x4b)) {
    throw parseError('PARSE_FAILED', `${kind}_not_zip: this file is not a valid ${kind.toUpperCase()} document.`);
  }
}
