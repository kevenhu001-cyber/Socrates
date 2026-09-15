import { Router } from 'express';
import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { files, sessions } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { resourceScope } from '../middleware/scopes.js';
import { writeLimiter } from '../middleware/rateLimit.js';
import { NotFound, BadRequest, PayloadTooLarge } from '../lib/errors.js';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { extractText as extractDocumentText } from '../services/fileParsers/index.js';
import {
  TEXT_FILE_EXTENSIONS,
  DOCUMENT_FILE_EXTENSIONS,
  LEGACY_OFFICE_EXTENSIONS,
  MEDIA_FILE_EXTENSIONS,
  TEXTUAL_APPLICATION_MIMES,
} from '../services/attachmentReader.js';
import { isUuid } from '../lib/validate.js';

import os from 'node:os';

const UPLOAD_DIR = process.env.UPLOAD_DIR
  || (process.env.NODE_ENV === 'production'
    ? '/var/lib/socrates/uploads'
    : path.join(os.tmpdir(), 'socrates-uploads'));
const MAX_SIZE = 25 * 1024 * 1024; // 25 MB
// Per-user total storage quota. Defaults to 250 MB which is enough
// for ~10 mid-size PDFs at the 25 MB cap, with headroom for images
// and audio. Override via env var for paid tiers.
const USER_QUOTA_BYTES = (() => {
  const raw = process.env.FILES_USER_QUOTA_BYTES;
  const n = raw ? parseInt(raw, 10) : 250 * 1024 * 1024;
  return Number.isFinite(n) && n > 0 ? n : 250 * 1024 * 1024;
})();
const MAX_PREVIEW_CHARS = 200 * 1024;
const PLAIN_TEXT_MIMES = new Set([
  'application/json',
  'text/plain', 'text/csv', 'text/markdown',
]);

// Ensure upload dir exists
fs.mkdir(UPLOAD_DIR, { recursive: true }).catch(() => {});

const storage = multer.diskStorage({
  destination: (_req: any, _file: any, cb: any) => cb(null, UPLOAD_DIR),
  filename: (_req: any, file: any, cb: any) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

/* Upload allow-list. Chat attachments ride on this endpoint, so it must
   accept every format the model can read via read_attachment (text,
   PDF, Office, EPUB/RTF, images) plus media files kept as attachments.
   Extension sets are shared with services/attachmentReader.ts. */
const ALLOWED_EXACT_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/avif',
  'application/pdf',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg',
  'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/flac',
  /* Office formats — see services/fileParsers/index.js for the
     matching extractor set. The raw endpoint force-downloads
     these so the browser never renders embedded script. */
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  /* Legacy Office — stored as attachments; no extractor, the model gets
     metadata only until the file is converted. */
  'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
  'application/epub+zip',
  'application/rtf', 'text/rtf',
]);

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req: any, file: any, cb: any) => {
    const mime = String(file.mimetype || '').toLowerCase();
    // text/html, application/xhtml+xml and image/svg+xml are explicitly
    // blocked: a malicious upload labelled as HTML/SVG would render in
    // the browser when /api/files/:id/raw is hit, opening an XSS
    // surface. Other types are flagged for content-sniffing at the raw
    // endpoint via nosniff + force-download for non-image types.
    if (mime === 'text/html' || mime === 'application/xhtml+xml' || mime === 'image/svg+xml') {
      cb(new BadRequest(`Unsupported file type: ${mime}`));
      return;
    }
    if (ALLOWED_EXACT_MIMES.has(mime) || TEXTUAL_APPLICATION_MIMES.has(mime) || mime.startsWith('text/')) {
      cb(null, true);
      return;
    }
    /* Browsers label unrecognized types as application/octet-stream;
       admit them when the extension is a known readable format (code
       files, documents, media). */
    if (mime === 'application/octet-stream' || mime === 'binary/octet-stream' || !mime) {
      const ext = path.extname(String(file.originalname || '')).toLowerCase();
      const known = TEXT_FILE_EXTENSIONS.has(ext)
        || DOCUMENT_FILE_EXTENSIONS.has(ext)
        || LEGACY_OFFICE_EXTENSIONS.has(ext)
        || MEDIA_FILE_EXTENSIONS.has(ext);
      if (known) {
        cb(null, true);
        return;
      }
    }
    cb(new BadRequest(`Unsupported file type: ${mime || 'unknown'}`));
  },
});

const router = Router();
router.use(requireAuth, resourceScope('files'));

/* GET /api/files — list all files for the authenticated user.
 * Supports cursor-based pagination via ?cursor=<id>&limit=<n>.
 * Ordered by uploaded_at descending so the most recent files appear first. */
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 200);
    const cursor = req.query.cursor || null;

    let query = db.select({
      id: files.id, name: files.name, mimeType: files.mimeType,
      size: files.size, kind: files.kind, sha256: files.sha256,
      sessionId: files.sessionId, uploadedAt: files.uploadedAt,
    }).from(files)
      .where(eq(files.userId, req.userId!));

    if (cursor) {
      query = (query as any).where(sql`${files.id} < ${cursor}::uuid`);
    }

    const rows = await query
      .orderBy(sql`${files.uploadedAt} DESC, ${files.id} DESC`)
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    if (hasMore) rows.pop();

    return res.json({
      files: rows,
      nextCursor: hasMore ? rows[rows.length - 1]?.id : null,
    });
  } catch (err) { next(err); }
});

/* GET /api/files/:id/content — return a safe, text-only preview.
 * Plain text files are read directly. PDF and Office-family files use the
 * same server-side extractors as chat attachments, so the library can show
 * their contents without asking the user to start or reopen a conversation.
 * The response is capped to keep a large workbook or document from turning
 * a simple preview into an unbounded memory/JSON response. */
router.get('/:id/content', async (req, res, next) => {
  try {
    const db = getDb();
    const [file] = await db.select({
      id: files.id, name: files.name, mimeType: files.mimeType,
      kind: files.kind, storagePath: files.storagePath,
    }).from(files)
      .where(and(eq(files.id, req.params.id), eq(files.userId, req.userId!)))
      .limit(1);
    if (!file) throw new NotFound('File not found');

    let text = '';
    let meta: Record<string, unknown> = {};
    let truncated = false;
    if (PLAIN_TEXT_MIMES.has(file.mimeType)) {
      // Stream only the head of the file instead of reading it all into
      // memory. A user can upload up to the quota (250 MB) as text, so
      // buffering the whole file here would let a single preview consume
      // that much server memory. We read a little more than the char cap
      // to avoid splitting a multi-byte UTF-8 sequence, then clean up the
      // tail below via the same normalization + slice path.
      const headBytes = await readHead(file.storagePath, MAX_PREVIEW_CHARS + 4096);
      text = headBytes.toString('utf8');
    } else if (file.mimeType === 'application/pdf') {
      const mod = await import('pdf-parse');
      const pdfParse = mod.default || mod;
      const result = await pdfParse(await fs.readFile(file.storagePath));
      text = String((result && result.text) || '');
      meta = { pageCount: result && result.numpages ? Number(result.numpages) : 0 };
    } else if (['application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/epub+zip', 'application/rtf'].includes(file.mimeType)) {
      const result = await extractDocumentText(file.mimeType, file.storagePath);
      text = String(result.text || '');
      meta = result.meta || {};
      truncated = !!result.truncated;
    } else {
      return res.status(415).json({ ok: false, error: 'This file type cannot be previewed as text.' });
    }

    text = text.replace(/\r\n/g, '\n');
    if (text.length > MAX_PREVIEW_CHARS) {
      text = text.slice(0, MAX_PREVIEW_CHARS);
      truncated = true;
    }
    return res.json({ ok: true, id: file.id, name: file.name, mimeType: file.mimeType, kind: file.kind, text, truncated, meta });
  } catch (err) {
    if (err instanceof NotFound) throw err;
    return res.status(422).json({ ok: false, error: 'Could not parse this file for preview.' });
  }
});

/**
 * Read only the first `maxBytes` bytes from a file, avoiding buffering
 * the entire file into memory. This is critical for the text preview
 * path where a user could upload a 250 MB plain-text file.
 */
async function readHead(storagePath: string, maxBytes: number): Promise<Buffer> {
  const handle = await fs.open(storagePath, 'r');
  try {
    const buf = Buffer.alloc(maxBytes);
    const { bytesRead } = await handle.read(buf, 0, maxBytes, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/**
 * Stream the on-disk upload through SHA-256 without buffering the
 * whole file. A 25 MB upload × concurrent requests used to spike
 * memory; streaming keeps it flat.
 */
function hashFileStreaming(storagePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(storagePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Compute the user's current storage footprint so the upload
 * endpoint can reject new files that would push them over quota.
 * Done as a single SUM aggregate rather than scanning rows.
 */
async function getUserStorageBytes(userId: string, tx?: unknown) {
  const db = tx ?? getDb();
  const [row] = await (db as ReturnType<typeof getDb>).select({ total: sql`COALESCE(SUM(${files.size}), 0)` })
    .from(files)
    .where(eq(files.userId, userId));
  return Number(row?.total) || 0;
}

/* POST /api/files — upload file
 *
 * SECURITY:
 *   - writeLimiter caps total user writes (sessions + messages +
 *     uploads) to 120/min, defending against an upload-flood attack.
 *   - We enforce a per-user storage quota (USER_QUOTA_BYTES) so a
 *     single user cannot exhaust the disk. The check happens AFTER
 *     multer saves the file (multer can't pre-check quota), but we
 *     delete the on-disk file and roll back if the user is over.
 */
router.post('/', writeLimiter, upload.single('file'), async (req, res, next) => {
  try {
    if (!(req as any).file) throw new BadRequest('No file provided');

    const file = (req as any).file;
    const sha256 = await hashFileStreaming(file.path);

    /* Optional session link: an attachment uploaded from a chat composer
       carries sessionId so the file's share/lifecycle follows that
       conversation. The id must be a uuid AND point at one of the
       caller's own sessions — otherwise an arbitrary value could attach
       an upload to somebody else's session (or poison the link). */
    let sessionId: string | null = null;
    const rawSessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : '';
    if (rawSessionId) {
      if (!isUuid(rawSessionId)) throw new BadRequest('sessionId must be a uuid');
      const db = getDb();
      const [owned] = await db.select({ id: sessions.id }).from(sessions)
        .where(and(eq(sessions.id, rawSessionId), eq(sessions.userId, req.userId!)))
        .limit(1);
      if (!owned) throw new BadRequest('sessionId does not reference one of your sessions');
      sessionId = rawSessionId;
    }

    const db = getDb();
    let record;
    try {
      record = await db.transaction(async (tx) => {
        /* Serialize concurrent uploads from the same user so two
           simultaneous SUM checks cannot both pass before either
           INSERT lands. Advisory lock is transaction-scoped. */
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${req.userId!}))`);
        const usedBytes = await getUserStorageBytes(req.userId!, tx);
        if (usedBytes + file.size > USER_QUOTA_BYTES) {
          throw new PayloadTooLarge(
            `Storage quota exceeded. You have used ${usedBytes} bytes; this upload would exceed the ${USER_QUOTA_BYTES}-byte limit.`
          );
        }
        const [row] = await tx.insert(files).values({
          userId: req.userId!,
          name: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          kind: mimeKind(file.mimetype, file.originalname),
          sha256,
          storagePath: file.path,
          sessionId,
        }).returning();
        return row;
      });
    } catch (err) {
      // Roll back the on-disk file if the quota check or insert failed.
      if (err instanceof PayloadTooLarge) {
        await fs.unlink(file.path).catch(() => {});
      }
      throw err;
    }
    if (!record) {
      await fs.unlink(file.path).catch(() => {});
      throw new PayloadTooLarge('Storage quota exceeded.');
    }

    return res.status(201).json({
      id: record.id, name: record.name, mimeType: record.mimeType,
      size: record.size, kind: record.kind, sha256: record.sha256,
    });
  } catch (err) { next(err); }
});

/* GET /api/files/:id — file metadata */
router.get('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const [file] = await db.select().from(files)
      .where(and(eq(files.id, req.params.id), eq(files.userId, req.userId!)))
      .limit(1);
    if (!file) throw new NotFound('File not found');
    return res.json(file);
  } catch (err) { next(err); }
});

/* PATCH /api/files/:id — rename file */
router.patch('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const [file] = await db.select().from(files)
      .where(and(eq(files.id, req.params.id), eq(files.userId, req.userId!)))
      .limit(1);
    if (!file) throw new NotFound('File not found');
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : null;
    if (!name) throw new BadRequest('name is required');
    await db.update(files).set({ name }).where(eq(files.id, req.params.id));
    return res.json({ id: file.id, name });
  } catch (err) { next(err); }
});

/* DELETE /api/files/:id */
router.delete('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const [file] = await db.select().from(files)
      .where(and(eq(files.id, req.params.id), eq(files.userId, req.userId!)))
      .limit(1);
    if (!file) throw new NotFound('File not found');
    await fs.unlink(file.storagePath).catch(() => {});
    await db.delete(files).where(eq(files.id, req.params.id));
    return res.status(204).end();
  } catch (err) { next(err); }
});

function mimeKind(mime: string, name?: string) {
  const m = String(mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m === 'application/pdf') return 'pdf';
  if (m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (m === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
  if (m === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'pptx';
  if (m === 'application/msword') return 'doc';
  if (m === 'application/vnd.ms-excel') return 'xls';
  if (m === 'application/vnd.ms-powerpoint') return 'ppt';
  if (m === 'application/epub+zip') return 'epub';
  if (m === 'application/rtf' || m === 'text/rtf') return 'rtf';
  if (m.startsWith('text/') || TEXTUAL_APPLICATION_MIMES.has(m)) return 'text';
  /* octet-stream uploads are classified by extension so a .py or .csv
     file still lands in the 'text' bucket the reader can serve. */
  if ((m === 'application/octet-stream' || m === 'binary/octet-stream' || !m)
      && TEXT_FILE_EXTENSIONS.has(path.extname(String(name || '')).toLowerCase())) {
    return 'text';
  }
  return 'other';
}

export default router;
