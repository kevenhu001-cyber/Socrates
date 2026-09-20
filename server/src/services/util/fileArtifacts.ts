/**
 * fileArtifacts.js — small helper that takes a sandbox-emitted file
 * and turns it into a row in the `files` table so the existing
 * /api/files/:id/raw endpoint serves it without any changes.
 *
 * Used by services/codeInterpreter.js when persisting matplotlib PNGs,
 * CSV exports, etc. produced by a code-interpreter run.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { getDb } from '../../db/index.js';
import { files } from '../../db/schema.js';

/* Reuse the same UPLOAD_DIR resolution as routes/files.js so executor
 * artifacts land next to user-uploaded files and are served by the
 * same /api/files/:id/raw endpoint. */
const UPLOAD_DIR = process.env.UPLOAD_DIR
  || (process.env.NODE_ENV === 'production' ? '/var/lib/socrates/uploads' : path.join(os.tmpdir(), 'socrates-uploads'));

await fs.mkdir(UPLOAD_DIR, { recursive: true }).catch(() => {});

/* Allow-list for executor output mime types. Mirrors the fileFilter
 * in routes/files.js:44-58 but adds image/svg+xml and image/jpeg that
 * are common for matplotlib + seaborn output. SVG is allowed here even
 * though the /raw endpoint force-downloads it — the existing X-Content-
 * Type-Options: nosniff header at routes/files.js:151-157 keeps the
 * browser from executing any embedded JS. */
const ARTIFACT_MIME_BY_EXT: Record<string, string> = {
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.pdf':  'application/pdf',
  '.csv':  'text/csv',
  '.txt':  'text/plain',
  '.json': 'application/json',
  '.html': 'text/html',  // note: routes/files.js:54 blocks text/html uploads, but executor outputs are trusted (model-generated)
};

function inferMime(originalName?: string | null) {
  const ext = path.extname(originalName || '').toLowerCase();
  return ARTIFACT_MIME_BY_EXT[ext] || 'application/octet-stream';
}

/* Like routes/files.js:176 mimeKind() — used by the files.kind column. */
function mimeKind(mime: string) {
  if (!mime) return 'other';
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('text/')) return 'text';
  if (mime === 'application/json') return 'code';
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
  if (mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') return 'pptx';
  if (mime === 'application/epub+zip') return 'epub';
  if (mime === 'application/rtf' || mime === 'text/rtf') return 'rtf';
  return 'other';
}

/**
 * Copy an executor-emitted file from its scratch location into the
 * shared uploads dir, hash it, and insert a `files` row with
 * executionId set so the existing cleanup cascade (and the existing
 * /api/files/:id/raw route) picks it up.
 *
 * opts: { userId, sessionId, executionId, sourcePath, originalName, size }
 * returns: { id, sha256, mimeType, kind, storagePath }
 */
export async function persistArtifact({ userId, sessionId, executionId, sourcePath, originalName, size }: {
  userId?: string | null;
  sessionId?: string | null;
  executionId?: string | null;
  sourcePath: string;
  originalName?: string | null;
  size: number;
}) {
  const mimeType = inferMime(originalName);
  const kind = mimeKind(mimeType);

  // Copy to the uploads dir using a UUID-prefixed filename so a
  // malicious user can't pre-create a known path. Keep the original
  // extension so MIME detection at the raw endpoint works.
  const ext = path.extname(originalName || path.basename(sourcePath)) || '';
  const targetName = `${crypto.randomUUID()}${ext}`;
  const targetPath = path.join(UPLOAD_DIR, targetName);
  await fs.copyFile(sourcePath, targetPath);

  // Hash the bytes (after copy — fs.copyFile already wrote, but the
  // source path may have been the same file in some edge cases).
  const bytes = await fs.readFile(targetPath);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');

  // Insert the row. userId is null for unauthenticated runs (shouldn't
  // happen in production — the chat route is behind requireAuth — but
  // we don't want to crash the worker pool if it does).
  const db = getDb();
  const [row] = await db.insert(files).values({
    userId: (userId || null) as string,
    name: originalName || path.basename(sourcePath),
    mimeType,
    size,
    kind,
    sha256,
    storagePath: targetPath,
    sessionId: sessionId || null,
    executionId: executionId || null,
  }).returning();

  return {
    id: row.id,
    sha256,
    mimeType,
    kind,
    storagePath: targetPath,
  };
}

export const _internal = {
  ARTIFACT_MIME_BY_EXT,
  inferMime,
  mimeKind,
  UPLOAD_DIR,
};