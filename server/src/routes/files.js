import { Router } from 'express';
import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { files } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rateLimit.js';
import { NotFound, BadRequest, PayloadTooLarge } from '../lib/errors.js';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';

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

// Ensure upload dir exists
fs.mkdir(UPLOAD_DIR, { recursive: true }).catch(() => {});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf', 'text/plain', 'text/csv', 'text/markdown',
      'video/mp4', 'audio/mpeg', 'audio/wav', 'audio/webm',
      'application/json',
      /* Office formats — see services/fileParsers/index.js for the
         matching extractor set. The raw endpoint force-downloads
         these so the browser never renders embedded script. */
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/epub+zip',
      'application/rtf', 'text/rtf'];
    // text/html and application/xhtml+xml are explicitly blocked:
    // a malicious upload labelled as HTML would render in the
    // browser when /api/files/:id/raw is hit, opening an XSS
    // surface. SVG is allowed (image rendering) but flagged for
    // content-sniffing at the raw endpoint via nosniff header and
    // force-download for non-image types.
    if (file.mimetype === 'text/html' || file.mimetype === 'application/xhtml+xml') {
      cb(new BadRequest(`Unsupported file type: ${file.mimetype}`));
      return;
    }
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequest(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

const router = Router();
router.use(requireAuth);

/**
 * Compute the user's current storage footprint so the upload
 * endpoint can reject new files that would push them over quota.
 * Done as a single SUM aggregate rather than scanning rows.
 */
async function getUserStorageBytes(userId) {
  const db = getDb();
  const [row] = await db.select({ total: sql`COALESCE(SUM(${files.size}), 0)` })
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
    if (!req.file) throw new BadRequest('No file provided');

    const file = req.file;
    const sha256 = crypto.createHash('sha256').update(await fs.readFile(file.path)).digest('hex');

    const db = getDb();
    const usedBytes = await getUserStorageBytes(req.userId);
    if (usedBytes + file.size > USER_QUOTA_BYTES) {
      // Roll back the upload so the on-disk file doesn't accumulate.
      await fs.unlink(file.path).catch(() => {});
      throw new PayloadTooLarge(
        `Storage quota exceeded. You have used ${usedBytes} bytes; this upload would exceed the ${USER_QUOTA_BYTES}-byte limit.`
      );
    }

    const [record] = await db.insert(files).values({
      userId: req.userId,
      name: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      kind: mimeKind(file.mimetype),
      sha256,
      storagePath: file.path,
      sessionId: req.body.sessionId || null,
    }).returning();

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
      .where(and(eq(files.id, req.params.id), eq(files.userId, req.userId)))
      .limit(1);
    if (!file) throw new NotFound('File not found');
    return res.json(file);
  } catch (err) { next(err); }
});

/* GET /api/files/:id/raw — serve file bytes */
router.get('/:id/raw', async (req, res, next) => {
  try {
    const db = getDb();
    const [file] = await db.select().from(files)
      .where(and(eq(files.id, req.params.id), eq(files.userId, req.userId)))
      .limit(1);
    if (!file) throw new NotFound('File not found');
    // X-Content-Type-Options: nosniff — prevents the browser from
    // guessing a different content type than the one we send.
    // Critical for SVG (which can contain JS) and for any file
    // whose on-disk extension doesn't match its MIME.
    res.set('X-Content-Type-Options', 'nosniff');
    // No caching for artifact files so regenerated images with the
    // same fileId always show the latest version.
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    // Force-download for any file that could execute script in the
    // browser — text, SVG, JSON, XML, etc. Only images and PDFs are
    // safe to render inline.
    if (!file.mimeType.startsWith('image/') && file.mimeType !== 'application/pdf') {
      res.set('Content-Disposition', 'attachment');
    }
    return res.sendFile(file.storagePath);
  } catch (err) { next(err); }
});

/* DELETE /api/files/:id */
router.delete('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const [file] = await db.select().from(files)
      .where(and(eq(files.id, req.params.id), eq(files.userId, req.userId)))
      .limit(1);
    if (!file) throw new NotFound('File not found');
    await fs.unlink(file.storagePath).catch(() => {});
    await db.delete(files).where(eq(files.id, req.params.id));
    return res.status(204).end();
  } catch (err) { next(err); }
});

function mimeKind(mime) {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('text/')) return 'text';
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
  if (mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'pptx';
  if (mime === 'application/epub+zip') return 'epub';
  if (mime === 'application/rtf' || mime === 'text/rtf') return 'rtf';
  return 'other';
}

export default router;
