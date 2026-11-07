/**
 * Document text extraction endpoint.
 *
 * Accepts multipart uploads of PDF / DOCX / XLSX / PPTX / EPUB / RTF /
 * DOC / XLS / ODT / ODS / ODP and returns the extracted plain-text
 * body. The original file is NOT
 * persisted — only the extracted text comes back. Same security
 * posture as before: keeps /api/files quota policy unchanged and
 * avoids "delete after extract" cleanup.
 *
 * Limits:
 *   - uploadLimiter (60/min/user) — CPU work counts against the upload bucket.
 *   - Legacy .ppt has no extractor and stays rejected here (metadata-only
 *     via /api/files, same as read_attachment).
 *   - 25 MB upload cap (matches /api/files MAX_SIZE).
 *   - Output text capped at MAX_TEXT_BYTES (200 K chars) so a single
 *     large spreadsheet cannot blow the LLM prompt budget; the cut keeps
 *     head + tail and says what was omitted. The text opens with a
 *     one-line `[Document info: …]` summary (type, size, pages/slides/
 *     sheets, scanned-PDF note).
 *
 * Response shape (uniform across all formats):
 *   {
 *     ok: true,
 *     text: string,
 *     truncated: boolean,
 *     meta: { pageCount?, sheetCount?, slideCount?, chapterCount?, ... },
 *     name: original filename,
 *     kind: 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'epub' | 'rtf'
 *   }
 *
 * Errors return `{ ok:false, error, name, kind }` so the front-end
 * can show the chip with a banner instead of crashing the chat send.
 */
import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { requireAuth } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimit.js';
import { BadRequest, PayloadTooLarge } from '../lib/errors.js';
import { extractText as dispatch, SUPPORTED_MIMES } from '../services/fileParsers/index.js';
import { resolveInsideRoot } from '../lib/pathSafety.js';
import { normalizeFileName } from '../lib/fileName.js';
import { truncateHeadTail } from '../services/fileParsers/text.js';
import { formatBytes } from '../services/embeddings/attachmentReader.js';

const MAX_UPLOAD = 25 * 1024 * 1024;        // 25 MB — matches /api/files
const MAX_TEXT_BYTES = 200 * 1024;          // 200 KB extracted text
const TMP_DIR = process.env.NODE_ENV === 'production'
  ? '/var/lib/socrates/tmp'
  : path.join(os.tmpdir(), 'socrates-extract-tmp');

await fs.mkdir(TMP_DIR, { recursive: true }).catch(() => {});

/* Map a few loose MIME aliases the browser sometimes sends (especially
   for drag-and-drop on Windows / older browsers).
   Legacy application/msword and application/vnd.ms-excel used to be
   aliased to the OOXML types here, which sent every .doc to mammoth and
   every .xls to exceljs — both fail on OLE binaries. They now keep their
   own types and reach the word-extractor / SheetJS parsers. */
const MIME_ALIASES: Record<string, string> = {
  'application/x-pdf': 'application/pdf',
  'application/acrobat': 'application/pdf',
};

function normalizeMime(raw: string, originalName: string) {
  let m = String(raw || '').toLowerCase().split(';')[0].trim();
  m = MIME_ALIASES[m] || m;
  if (m === 'application/octet-stream' && originalName) {
    /* Fall back to extension sniffing — covers uploads where the
       browser couldn't determine the type (e.g. .docx sent as
       octet-stream from a download manager). */
    const ext = path.extname(originalName).toLowerCase();
    if (ext === '.pdf') return 'application/pdf';
    if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (ext === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (ext === '.pptx') return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    if (ext === '.epub') return 'application/epub+zip';
    if (ext === '.rtf') return 'application/rtf';
    if (ext === '.doc') return 'application/msword';
    if (ext === '.xls') return 'application/vnd.ms-excel';
    if (ext === '.odt') return 'application/vnd.oasis.opendocument.text';
    if (ext === '.ods') return 'application/vnd.oasis.opendocument.spreadsheet';
    if (ext === '.odp') return 'application/vnd.oasis.opendocument.presentation';
  }
  return m;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, TMP_DIR),
    filename: (_req, _file, cb) => cb(null, `${crypto.randomUUID()}.bin`),
  }),
  limits: { fileSize: MAX_UPLOAD },
  /* UTF-8 filenames — busboy's latin1 default garbles Chinese names. */
  defParamCharset: 'utf8',
  fileFilter: (_req, file, cb) => {
    file.originalname = normalizeFileName(file.originalname) || 'file';
    const mime = normalizeMime(file.mimetype, file.originalname);
    /* Application/pdf + the new office formats pass. text/html and
       text/xhtml stay blocked (XSS surface at the raw endpoint). */
    const allowed = ['application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/epub+zip',
      'application/rtf', 'text/rtf',
      'application/msword',
      'application/vnd.ms-excel',
      'application/vnd.oasis.opendocument.text',
      'application/vnd.oasis.opendocument.spreadsheet',
      'application/vnd.oasis.opendocument.presentation',
    ];
    if (allowed.includes(mime)) return cb(null, true);
    if (mime === 'application/vnd.ms-powerpoint' || path.extname(file.originalname).toLowerCase() === '.ppt') {
      return cb(new BadRequest('Legacy .ppt files cannot be read. Save the presentation as .pptx or PDF and upload it again.'));
    }
    cb(new BadRequest(`Unsupported file type: ${file.mimetype || 'unknown'} ("${file.originalname}")`));
  },
});

const router = Router();

/**
 * POST /api/files/extract — accept a PDF/Office document, return
 *   { ok, text, truncated, meta, name, kind }
 */
router.post('/extract', requireAuth, uploadLimiter, (req, res, next) => {
  upload.single('file')(req, res, async (multerErr: (Error & { code?: string }) | null) => {
    /* Multer names the temp file with a server-generated uuid, but the
       value still reaches us through the request object. Resolve it
       through the temp root once, so every read/unlink below uses a
       path that is provably contained. */
    let uploadPath: string | null = null;
    const cleanup = () => (uploadPath ? fs.unlink(uploadPath).catch(() => {}) : Promise.resolve());
    try {
      if (req.file?.path) uploadPath = resolveInsideRoot(TMP_DIR, req.file.path);
      if (multerErr) {
        if (multerErr.code === 'LIMIT_FILE_SIZE') {
          await cleanup();
          return next(new PayloadTooLarge(`File exceeds the ${MAX_UPLOAD / 1024 / 1024} MB limit`));
        }
        await cleanup();
        return next(multerErr);
      }
      if (!req.file) {
        return next(new BadRequest('No file provided in field "file"'));
      }

      const uploadedFile = req.file;
      const mime = normalizeMime(uploadedFile.mimetype, uploadedFile.originalname);
      const kind = kindFromMime(mime);

      const displayName = uploadedFile.originalname;
      let extractResult: { text: string; truncated: boolean; meta: Record<string, unknown> };
      try {
        /* One dispatcher for every format, PDF included: page markers,
           markdown tables/headings, scanned and encrypted detection. */
        extractResult = await dispatch(mime, uploadPath!);
      } catch (e) {
        await cleanup();
        const code = (e && (e as NodeJS.ErrnoException).code) || 'PARSE_FAILED';
        const msg = (e && (e as Error).message) || String(e);
        const error = code === 'ENCRYPTED'
          ? `"${displayName}" is password-protected or encrypted and cannot be read. Remove the password and upload it again.`
          : code === 'EMPTY_DOCUMENT'
            ? `"${displayName}" contains no readable content.`
            : `Could not parse ${kind || 'file'} "${displayName}": ${msg}`;
        return res.json({
          ok: false,
          text: '',
          truncated: false,
          meta: {},
          name: displayName,
          kind,
          error,
          errorCode: code,
        });
      }
      await cleanup();

      const meta = (extractResult && extractResult.meta) || {};
      let truncated = !!extractResult?.truncated;
      let text = String((extractResult && extractResult.text) || '');
      const totalChars = text.length;
      /* Keep the beginning and the end (conclusions, answer keys, totals)
         with an explicit note of what was dropped, instead of a blind
         head cut. */
      if (text.length > MAX_TEXT_BYTES) {
        const cut = truncateHeadTail(text, MAX_TEXT_BYTES);
        text = cut.text;
        truncated = true;
        meta.omitted = `${cut.omittedChars} of ${totalChars} characters from the middle`;
      }
      /* A one-line summary the model can cite from (the client labels the
         part with the file name already). */
      const summary = describeExtract(kind, uploadedFile.size, meta, truncated);
      if (summary) text = `${summary}\n\n${text}`;
      return res.json({
        ok: true,
        text,
        truncated,
        meta,
        name: displayName,
        kind,
      });
    } catch (err) {
      await cleanup();
      next(err);
    }
  });
});

function describeExtract(kind: string, size: number, meta: Record<string, unknown>, truncated: boolean): string {
  const bits: string[] = [kind.toUpperCase(), formatBytes(size)];
  const n = (k: string) => (typeof meta[k] === 'number' && (meta[k] as number) > 0 ? (meta[k] as number) : 0);
  if (n('pageCount')) bits.push(`${n('pageCount')} pages, each starting with a "[Page N]" marker`);
  if (n('slideCount')) bits.push(`${n('slideCount')} slides under "## Slide N" headings`);
  if (n('sheetCount')) bits.push(`${n('sheetCount')} sheets as markdown tables under "## Sheet:" headings`);
  if (n('chapterCount')) bits.push(`${n('chapterCount')} chapters`);
  if (typeof meta.omitted === 'string' && truncated) bits.push(`truncated — omitted: ${meta.omitted}`);
  let line = `[Document info: ${bits.join(' · ')}]`;
  if (meta.scanned) {
    line += '\n[Note: this PDF has no text layer (scanned or image-only), so its content could not be extracted. ' +
      'Ask the user to send the pages as images or a text-based PDF.]';
  } else if (typeof meta.pagesWithoutText === 'string' && meta.pagesWithoutText) {
    line += `\n[Note: pages ${meta.pagesWithoutText} have no text layer (scanned images); their content is missing below.]`;
  }
  return line;
}

function kindFromMime(mime: string) {
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
  if (mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'pptx';
  if (mime === 'application/epub+zip') return 'epub';
  if (mime === 'application/rtf' || mime === 'text/rtf') return 'rtf';
  if (mime === 'application/msword') return 'doc';
  if (mime === 'application/vnd.ms-excel') return 'xls';
  if (mime === 'application/vnd.oasis.opendocument.text') return 'odt';
  if (mime === 'application/vnd.oasis.opendocument.spreadsheet') return 'ods';
  if (mime === 'application/vnd.oasis.opendocument.presentation') return 'odp';
  return 'document';
}

export { SUPPORTED_MIMES };
export default router;
