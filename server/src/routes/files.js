import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { files } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { NotFound, BadRequest } from '../lib/errors.js';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';

const UPLOAD_DIR = process.env.UPLOAD_DIR || '/tmp/socrates-uploads';
const MAX_SIZE = 25 * 1024 * 1024; // 25 MB

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
      'application/pdf', 'text/plain', 'text/csv',
      'video/mp4', 'audio/mpeg', 'audio/wav', 'audio/webm',
      'application/json'];
    if (allowed.includes(file.mimetype) || file.mimetype.startsWith('text/')) {
      cb(null, true);
    } else {
      cb(new BadRequest(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

const router = Router();
router.use(requireAuth);

/* POST /api/files — upload file */
router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new BadRequest('No file provided');

    const file = req.file;
    const sha256 = crypto.createHash('sha256').update(await fs.readFile(file.path)).digest('hex');

    const db = getDb();
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
  return 'other';
}

export default router;
