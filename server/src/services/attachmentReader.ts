/**
 * attachmentReader — server-side reader for user-uploaded chat attachments.
 *
 * Attachment contract (P_file-attachments):
 *   - The client uploads every attached file to POST /api/files, which
 *     persists a `files` row (storage path, mime, size, owner).
 *   - The message's attachments[] jsonb stores {kind, name, mime, size,
 *     fileId} — a durable reference, never a pre-parsed text dump.
 *   - The user message carries a `[Attached file: "name" (mime, size) —
 *     fileId: <uuid>]` pointer per attachment so the model knows the file
 *     exists and can call the `read_attachment` native tool on demand.
 *
 * Extraction strategy by stored mime/kind:
 *   - text/* and textual application types → raw UTF-8 read (paged)
 *   - application/pdf → pdf-parse (with pageCount meta)
 *   - Office/EPUB/RTF → services/fileParsers dispatch
 *   - image/* → MiniMax vision describe (describeImageFile) — this is how
 *     a text-only model "sees" an attached image without pre-baking a
 *     description into the prompt
 *   - audio/video/other binary → metadata only (readable:false note)
 *
 * Paging: callers pass offset/limit; the full extraction is LRU-cached so
 * walking a 25 MB workbook in slices does not re-parse it per hop.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { files } from '../db/schema.js';
import { extractText as extractDocumentText, SUPPORTED_MIMES } from './fileParsers/index.js';
import { describeImageFile } from './vision.js';

/* ─── Tool definition (sent to upstream on every chat turn) ─── */

export const READ_ATTACHMENT_TOOL = {
  type: 'function',
  function: {
    name: 'read_attachment',
    description:
      '## What this tool does\n' +
      'Reads a file the user attached to the conversation. A user message may contain ' +
      '`[Attached file: "name" (mime, size) — fileId: <uuid>]` pointers; call this tool with ' +
      'that fileId to fetch the file\'s extracted text page by page, a visual description ' +
      'for image attachments, or metadata for media/binary files.\n\n' +
      '## When to call\n' +
      '- The user asks about an attached file\'s contents: summarize, analyze, quote, extract data, answer questions, review code.\n' +
      '- Always read an attachment before answering questions about it — do not guess its contents from the filename.\n' +
      '- For long documents, page through with `offset` until `hasMore` is false.\n\n' +
      '## When NOT to call\n' +
      '- The file\'s content was already returned by an earlier call in this turn — reuse it.\n' +
      '- The user mentions a file by name but no `[Attached file: …]` pointer with a fileId exists — there is nothing to read.\n\n' +
      '## Paging\n' +
      'Each call returns at most `limit` characters starting at `offset`. The result header reports ' +
      'totalChars and hasMore; continue with offset = offset + returned characters until hasMore is false. ' +
      'Default limit is 12000, maximum 30000.\n\n' +
      '## Images\n' +
      'For image attachments the tool returns a vision-model description instead of text. Pass a short ' +
      '`question` to focus the description (e.g. "what text appears in the screenshot?").',
    parameters: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'The fileId uuid exactly as it appears in the [Attached file: …] pointer of the user message.',
        },
        offset: {
          type: 'number',
          default: 0,
          minimum: 0,
          description: 'Character offset into the extracted text. Use the previous response\'s offset + returned character count to page forward.',
        },
        limit: {
          type: 'number',
          default: 12000,
          minimum: 1,
          maximum: 30000,
          description: 'Maximum characters to return in this page.',
        },
        question: {
          type: 'string',
          maxLength: 500,
          description: 'Optional question that focuses an image description (ignored for text-extractable files).',
        },
      },
      required: ['fileId'],
      additionalProperties: false,
    },
  },
};

/* ─── Shared file-type sets ───
 * Used here for the read dispatch and re-used by routes/files.ts for the
 * upload allow-list so the two never disagree about what "a text file" is. */

export const TEXT_FILE_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.csv', '.tsv', '.log', '.json', '.jsonl', '.ndjson',
  '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.env', '.tex', '.bib',
  '.py', '.pyw', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.java', '.c', '.h',
  '.cpp', '.cc', '.cxx', '.hpp', '.hh', '.cs', '.go', '.rs', '.rb', '.php', '.swift',
  '.kt', '.kts', '.m', '.mm', '.scala', '.sh', '.bash', '.zsh', '.fish', '.pl', '.pm',
  '.lua', '.r', '.jl', '.sql', '.css', '.scss', '.less', '.vue', '.svelte', '.dart',
  '.ex', '.exs', '.erl', '.hrl', '.clj', '.cljs', '.hs', '.ml', '.fs', '.vb', '.ps1',
  '.bat', '.cmd', '.ipynb', '.diff', '.patch', '.gitignore', '.dockerignore', '.proto',
]);
export const DOCUMENT_FILE_EXTENSIONS = new Set(['.pdf', '.docx', '.xlsx', '.pptx', '.epub', '.rtf']);
export const LEGACY_OFFICE_EXTENSIONS = new Set(['.doc', '.xls', '.ppt']);
export const MEDIA_FILE_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.mp3', '.wav', '.m4a', '.ogg', '.flac', '.aac']);

/* application/* types that are really plain text inside. Office XML
   containers are NOT here — they are zip files handled by the parsers. */
export const TEXTUAL_APPLICATION_MIMES = new Set([
  'application/json', 'application/xml', 'application/javascript',
  'application/x-javascript', 'application/typescript', 'application/x-typescript',
  'application/yaml', 'application/x-yaml', 'application/x-sh',
  'application/sql', 'application/graphql', 'application/x-httpd-php',
  'application/toml', 'application/ld+json', 'application/x-ndjson', 'application/jsonl',
]);

const PARSER_MIMES = new Set(SUPPORTED_MIMES);

export const READ_PAGE_DEFAULT = 12_000;
export const READ_PAGE_MAX = 30_000;
const EXTRACT_CACHE_MAX = 16;
/* Skip caching extractions above ~8 M chars; a huge plain-text file is
   re-read from disk per page instead of pinning RAM. */
const EXTRACT_CACHE_TEXT_CAP = 8_000_000;

export class AttachmentReadError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = 'AttachmentReadError';
    this.code = code;
    this.retryable = retryable;
  }
}

type FileRow = typeof files.$inferSelect;

export interface AttachmentPage {
  fileId: string;
  name: string;
  kind: string;
  mimeType: string;
  size: number;
  readable: boolean;
  totalChars: number;
  offset: number;
  returnedChars: number;
  hasMore: boolean;
  truncated: boolean;
  meta: Record<string, unknown>;
  text: string;
  note?: string;
}

interface Extracted {
  readable: boolean;
  text: string;
  meta: Record<string, unknown>;
  truncated: boolean;
  note?: string;
}

function extOf(name: string): string {
  return path.extname(String(name || '')).toLowerCase();
}

function normalizeText(raw: unknown): string {
  return String(raw || '').replace(/\r\n/g, '\n');
}

export function formatBytes(n: number): string {
  const size = Number(n) || 0;
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

/** True when the file can be read as UTF-8 text without a parser. */
export function isTextReadable(mime: string, name: string, kind?: string | null): boolean {
  const m = String(mime || '').toLowerCase();
  if (m.startsWith('text/')) {
    /* HTML/XHTML are rejected at upload; RTF goes through the parser
       (its markup is not useful raw text). */
    return m !== 'text/html' && m !== 'text/xhtml' && m !== 'text/rtf' && m !== 'image/svg+xml';
  }
  if (TEXTUAL_APPLICATION_MIMES.has(m)) return true;
  if (kind === 'text') return true;
  if ((m === 'application/octet-stream' || !m) && TEXT_FILE_EXTENSIONS.has(extOf(name))) return true;
  return false;
}

const EXTRACT_CACHE = new Map<string, Extracted>();

async function extractFile(file: FileRow, question?: string): Promise<Extracted> {
  const mime = String(file.mimeType || '').toLowerCase();
  try {
    if (mime === 'application/pdf') {
      const mod = await import('pdf-parse');
      const pdfParse = (mod as { default?: unknown }).default || mod;
      const result = await (pdfParse as (b: Buffer) => Promise<{ text?: string; numpages?: number }>)(await fs.readFile(file.storagePath));
      return {
        readable: true,
        text: normalizeText(result && result.text),
        meta: { pageCount: result && result.numpages ? Number(result.numpages) : 0 },
        truncated: false,
      };
    }
    if (PARSER_MIMES.has(mime)) {
      const result = await extractDocumentText(mime, file.storagePath);
      return {
        readable: true,
        text: normalizeText(result && result.text),
        meta: (result && result.meta) || {},
        truncated: !!(result && result.truncated),
      };
    }
    if (mime.startsWith('image/')) {
      const described = await describeImageFile({ path: file.storagePath, prompt: question });
      return {
        readable: true,
        text: normalizeText(described && described.description),
        meta: { via: 'vision', model: described && described.model, latencyMs: described && described.latencyMs },
        truncated: false,
      };
    }
    if (isTextReadable(mime, file.name, file.kind)) {
      const buf = await fs.readFile(file.storagePath);
      return {
        readable: true,
        text: normalizeText(buf.toString('utf8')),
        meta: { encoding: 'utf-8' },
        truncated: false,
      };
    }
    return {
      readable: false,
      text: '',
      meta: {},
      truncated: false,
      note:
        `This file type (${mime || 'unknown'}) has no readable text representation. ` +
        `Only metadata is available: name "${file.name}", ${formatBytes(file.size)}. ` +
        'If the user needs its contents analyzed, ask them to convert it to a supported ' +
        'document format (PDF, DOCX, XLSX, PPTX, EPUB, RTF, plain text, or an image).',
    };
  } catch (err) {
    if (err instanceof AttachmentReadError) throw err;
    const code = (err as NodeJS.ErrnoException)?.code;
    const message = (err as Error)?.message || String(err);
    if (code === 'ENOENT') {
      throw new AttachmentReadError('file_missing', 'The uploaded file is missing from storage.', false);
    }
    if (mime.startsWith('image/')) {
      const status = (err as { status?: number })?.status;
      throw new AttachmentReadError(
        status === 413 ? 'image_too_large' : 'vision_failed',
        `Could not describe the image: ${message}`,
        status !== 413,
      );
    }
    throw new AttachmentReadError('parse_failed', `Could not extract text from this file: ${message}`, false);
  }
}

async function extractCached(file: FileRow, question?: string): Promise<Extracted> {
  /* For images the question shapes the output, so it is part of the key. */
  const key = `${file.id}${question ? `|q:${question.slice(0, 200)}` : ''}`;
  const hit = EXTRACT_CACHE.get(key);
  if (hit) {
    EXTRACT_CACHE.delete(key);
    EXTRACT_CACHE.set(key, hit);
    return hit;
  }
  const extracted = await extractFile(file, question);
  if (extracted.text.length <= EXTRACT_CACHE_TEXT_CAP) {
    EXTRACT_CACHE.set(key, extracted);
    if (EXTRACT_CACHE.size > EXTRACT_CACHE_MAX) {
      const oldest = EXTRACT_CACHE.keys().next().value;
      if (oldest !== undefined) EXTRACT_CACHE.delete(oldest);
    }
  }
  return extracted;
}

/**
 * Read one page of a user-owned uploaded file. Ownership is enforced here
 * (fileId + userId) — a model- or client-supplied id can never reach
 * another user's file.
 */
export async function readAttachmentForUser(input: {
  fileId: string;
  userId: string;
  offset?: number;
  limit?: number;
  question?: string;
}): Promise<AttachmentPage> {
  const { fileId, userId } = input;
  const offset = Math.max(0, Math.floor(Number(input.offset) || 0));
  const limit = Math.min(READ_PAGE_MAX, Math.max(1, Math.floor(Number(input.limit) || READ_PAGE_DEFAULT)));
  const question = typeof input.question === 'string' && input.question.trim()
    ? input.question.trim().slice(0, 500)
    : undefined;

  const db = getDb();
  const [file] = await db.select().from(files)
    .where(and(eq(files.id, fileId), eq(files.userId, userId)))
    .limit(1);
  if (!file) {
    throw new AttachmentReadError(
      'file_not_found',
      'Attachment not found — the file may have been deleted or does not belong to this user.',
      false,
    );
  }

  const extracted = await extractCached(file, question);
  const total = extracted.text.length;
  const start = Math.min(offset, total);
  const slice = extracted.text.slice(start, start + limit);
  return {
    fileId: file.id,
    name: file.name,
    kind: file.kind || 'file',
    mimeType: file.mimeType,
    size: file.size,
    readable: extracted.readable,
    totalChars: total,
    offset: start,
    returnedChars: slice.length,
    hasMore: start + slice.length < total,
    truncated: extracted.truncated,
    meta: extracted.meta,
    text: extracted.readable ? slice : '',
    note: extracted.note,
  };
}

/** Render the model-facing tool output for one page. */
export function formatAttachmentReadOutput(page: AttachmentPage): string {
  const header = `[file: "${page.name}" — ${page.mimeType} — ${formatBytes(page.size)}]`;
  if (!page.readable) {
    return `${header}\n${page.note || 'This file has no readable text representation.'}`;
  }
  const metaEntries = Object.entries(page.meta || {}).filter(([, v]) => v != null && v !== '');
  const metaLine = metaEntries.length
    ? `[meta: ${metaEntries.map(([k, v]) => `${k}=${String(v)}`).join(', ')}]\n`
    : '';
  const end = page.offset + page.returnedChars;
  const range = `[extract: chars ${page.offset}–${end} of ${page.totalChars}` +
    (page.hasMore ? ` — more available; call read_attachment again with offset=${end}` : ' — end of file') +
    (page.truncated ? '; note: the source extraction itself was capped' : '') + ']';
  return `${header}\n${metaLine}${range}\n${page.text}`;
}
