/**
 * Document text extraction endpoint.
 *
 * Accepts multipart uploads of PDF / DOCX / XLSX / PPTX / EPUB / RTF
 * and returns the extracted plain-text body. The original file is NOT
 * persisted — only the extracted text comes back. Same security
 * posture as before: keeps /api/files quota policy unchanged and
 * avoids "delete after extract" cleanup.
 *
 * Limits:
 *   - writeLimiter (120/min/user) — CPU work counts against it.
 *   - 25 MB upload cap (matches /api/files MAX_SIZE).
 *   - Output text capped at MAX_TEXT_BYTES (200 KB) so a single
 *     large spreadsheet cannot blow the LLM prompt budget.
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
import { writeLimiter } from '../middleware/rateLimit.js';
import { BadRequest, PayloadTooLarge } from '../lib/errors.js';
import { extractText as dispatch, SUPPORTED_MIMES } from '../services/fileParsers/index.js';

const MAX_UPLOAD = 25 * 1024 * 1024;        // 25 MB — matches /api/files
const MAX_TEXT_BYTES = 200 * 1024;          // 200 KB extracted text
const TMP_DIR = process.env.NODE_ENV === 'production'
  ? '/var/lib/socrates/tmp'
  : path.join(os.tmpdir(), 'socrates-extract-tmp');

await fs.mkdir(TMP_DIR, { recursive: true }).catch(() => {});

/* Map a few loose MIME aliases the browser sometimes sends (especially
   for drag-and-drop on Windows / older browsers). */
const MIME_ALIASES: Record<string, string> = {
  'application/x-pdf': 'application/pdf',
  'application/acrobat': 'application/pdf',
  'application/msword': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
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
  }
  return m;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req: any, _file: any, cb: any) => cb(null, TMP_DIR),
    filename: (_req: any, _file: any, cb: any) => cb(null, `${crypto.randomUUID()}.bin`),
  }),
  limits: { fileSize: MAX_UPLOAD },
  fileFilter: (_req: any, file: any, cb: any) => {
    const mime = normalizeMime(file.mimetype, file.originalname);
    /* Application/pdf + the new office formats pass. text/html and
       text/xhtml stay blocked (XSS surface at the raw endpoint). */
    const allowed = ['application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/epub+zip',
      'application/rtf', 'text/rtf',
    ];
    if (allowed.includes(mime)) return cb(null, true);
    cb(new BadRequest(`Unsupported file type: ${file.mimetype}`));
  },
});

const router = Router();

/**
 * POST /api/files/extract — accept a PDF/Office document, return
 *   { ok, text, truncated, meta, name, kind }
 */
router.post('/extract', requireAuth, writeLimiter, (req, res, next) => {
  upload.single('file')(req, res, async (multerErr: (Error & { code?: string }) | null) => {
    const cleanup = () => (req as any).file?.path
      ? fs.unlink((req as any).file.path).catch(() => {})
      : Promise.resolve();
    try {
      if (multerErr) {
        if (multerErr.code === 'LIMIT_FILE_SIZE') {
          await cleanup();
          return next(new PayloadTooLarge(`File exceeds the ${MAX_UPLOAD / 1024 / 1024} MB limit`));
        }
        await cleanup();
        return next(multerErr);
      }
      if (!(req as any).file) {
        return next(new BadRequest('No file provided in field "file"'));
      }

      const mime = normalizeMime((req as any).file.mimetype, (req as any).file.originalname);
      const kind = kindFromMime(mime);

      let extractResult: { text: string; meta: Record<string, unknown> };
      try {
        if (mime === 'application/pdf') {
          /* PDF keeps the existing pdf-parse path — it takes a Buffer
             (not a path); files.ts preview uses the same convention. */
          const mod = await import('pdf-parse');
          const pdfParse = mod.default || mod;
          const result = await pdfParse(await fs.readFile((req as any).file.path));
          extractResult = {
            text: String((result && result.text) || ''),
            meta: { pageCount: result && result.numpages ? Number(result.numpages) : 0 },
          };
        } else {
          extractResult = await dispatch(mime, (req as any).file.path);
        }
      } catch (e) {
        await cleanup();
        const code = (e && (e as NodeJS.ErrnoException).code) || 'PARSE_FAILED';
        const msg = (e && (e as Error).message) || String(e);
        return res.json({
          ok: false,
          text: '',
          truncated: false,
          meta: {},
          name: (req as any).file.originalname,
          kind,
          error: `Could not parse ${kind || 'file'}: ${msg}`,
          errorCode: code,
        });
      }
      await cleanup();

      let text = String((extractResult && extractResult.text) || '').replace(/\r\n/g, '\n');
      const meta = (extractResult && extractResult.meta) || {};
      let truncated = false;
      if (text.length > MAX_TEXT_BYTES) {
        text = text.slice(0, MAX_TEXT_BYTES);
        truncated = true;
      }
      return res.json({
        ok: true,
        text,
        truncated,
        meta,
        name: (req as any).file.originalname,
        kind,
      });
    } catch (err) {
      await cleanup();
      next(err);
    }
  });
});

function kindFromMime(mime: string) {
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
  if (mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'pptx';
  if (mime === 'application/epub+zip') return 'epub';
  if (mime === 'application/rtf' || mime === 'text/rtf') return 'rtf';
  return 'document';
}

export { SUPPORTED_MIMES };
export default router;