/**
 * PDF text extraction endpoint.
 *
 * The chat client uploads a PDF (one-shot via multipart) and receives
 * the extracted plain-text body, which the front-end embeds in the
 * outgoing message. The PDF itself is NOT persisted on the server:
 *   - Reduces storage pressure (PDFs are big; their text is small).
 *   - Avoids needing a separate "delete after extract" cleanup.
 *   - Keeps the existing /api/files quota policy unchanged.
 *
 * Limits:
 *   - writeLimiter (120/min/user) — covers this endpoint because
 *     PDF parsing is CPU work.
 *   - 25 MB upload cap (matches /api/files MAX_SIZE).
 *   - Output text capped at 200 KB to bound prompt size.
 *   - PDF only; other MIME types return 400.
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

const MAX_UPLOAD = 25 * 1024 * 1024;        // 25 MB — matches /api/files
const MAX_TEXT_BYTES = 200 * 1024;          // 200 KB extracted text
const TMP_DIR = process.env.NODE_ENV === 'production'
  ? '/var/lib/socrates/tmp'
  : path.join(os.tmpdir(), 'socrates-extract-tmp');

await fs.mkdir(TMP_DIR, { recursive: true }).catch(() => {});

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, TMP_DIR),
    filename: (_req, _file, cb) => cb(null, `${crypto.randomUUID()}.pdf`),
  }),
  limits: { fileSize: MAX_UPLOAD },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      cb(new BadRequest(`Only application/pdf is accepted, got ${file.mimetype}`));
      return;
    }
    cb(null, true);
  },
});

const router = Router();

/**
 * POST /api/files/extract — accept a PDF multipart upload, return
 *   { ok: true, text, truncated, pageCount, name }
 *
 * Authentication: required (requireAuth).
 * Rate limit: writeLimiter (120/min/user) — shared with /api/files.
 */
router.post('/extract', requireAuth, writeLimiter, (req, res, next) => {
  upload.single('file')(req, res, async (multerErr) => {
    // Free the temp file before doing anything async.
    const cleanup = () => req.file?.path
      ? fs.unlink(req.file.path).catch(() => {})
      : Promise.resolve();
    try {
      if (multerErr) {
        if (multerErr.code === 'LIMIT_FILE_SIZE') {
          await cleanup();
          return next(new PayloadTooLarge(`PDF exceeds the ${MAX_UPLOAD / 1024 / 1024} MB limit`));
        }
        await cleanup();
        return next(multerErr);
      }
      if (!req.file) {
        return next(new BadRequest('No file provided in field "file"'));
      }

      // Dynamic import so the pdf-parse startup cost (~50 MB pdf.js
      // bundle) is only paid on the first PDF upload, not at process
      // boot. This matters because the chat server handles thousands
      // of text-only requests and never touches PDF parsing.
      let pdfParse;
      try {
        const mod = await import('pdf-parse');
        // pdf-parse's default export is a function; some versions
        // export under .default.
        pdfParse = mod.default || mod;
      } catch (e) {
        await cleanup();
        return next(new Error('pdf-parse unavailable: ' + e.message));
      }

      let result;
      try {
        result = await pdfParse(req.file.path);
      } catch (e) {
        // Corrupt / non-PDF / password-protected etc.
        await cleanup();
        return res.json({
          ok: true,
          text: '',
          truncated: false,
          pageCount: 0,
          name: req.file.originalname,
          error: 'PDF could not be parsed (corrupt or password-protected)',
        });
      }
      await cleanup();

      let text = (result && typeof result.text === 'string') ? result.text : '';
      const pageCount = (result && result.numpages) ? Number(result.numpages) : 0;
      let truncated = false;
      if (text.length > MAX_TEXT_BYTES) {
        text = text.slice(0, MAX_TEXT_BYTES);
        truncated = true;
      }
      // Normalise line endings; PDF extraction often returns \r\n.
      text = text.replace(/\r\n/g, '\n');

      return res.json({
        ok: true,
        text,
        truncated,
        pageCount,
        name: req.file.originalname,
      });
    } catch (err) {
      await cleanup();
      next(err);
    }
  });
});

export default router;