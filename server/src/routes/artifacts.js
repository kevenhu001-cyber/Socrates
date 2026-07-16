import { Router } from 'express';
import { eq, and, desc, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { artifacts, artifactVersions } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { NotFound, BadRequest } from '../lib/errors.js';
import { generateShareToken } from '../lib/crypto.js';
import { normalizeVisibility } from '../lib/sanitize.js';
import { requireOwnedArtifact } from '../services/artifactOwnership.js';

const router = Router();
router.use(requireAuth);

/* GET /api/artifacts — list user's artifacts (cursor-paginated) */
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const { sessionId, projectId, limit, cursor } = req.query;
    const maxLimit = Math.min(parseInt(limit || '50', 10), 200);

    const conditions = [eq(artifacts.userId, req.userId)];
    if (sessionId) conditions.push(eq(artifacts.sessionId, sessionId));
    if (projectId) conditions.push(eq(artifacts.projectId, projectId));
    if (cursor) conditions.push(sql`${artifacts.updatedAt} < ${cursor}::timestamptz`);

    const rows = await db.select().from(artifacts)
      .where(and(...conditions))
      .orderBy(desc(artifacts.updatedAt))
      .limit(maxLimit + 1);

    const hasMore = rows.length > maxLimit;
    const list = hasMore ? rows.slice(0, maxLimit) : rows;
    const nextCursor = hasMore ? list[list.length - 1].updatedAt.toISOString() : null;

    return res.json({ artifacts: list, nextCursor });
  } catch (err) { next(err); }
});

/* POST /api/artifacts — create */
router.post('/', async (req, res, next) => {
  try {
    const { type, title, source, language, sessionId, messageId, projectId } = req.body;
    if (!type || !source) throw new BadRequest('type and source are required');
    const db = getDb();
    const [a] = await db.insert(artifacts).values({
      userId: req.userId, type, title: title || '', source, language: language || null,
      sessionId: sessionId || null, messageId: messageId || null, projectId: projectId || null,
    }).returning();
    return res.status(201).json(a);
  } catch (err) { next(err); }
});

/* GET /api/artifacts/:id — get artifact */
router.get('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const [a] = await db.select().from(artifacts)
      .where(and(eq(artifacts.id, req.params.id), eq(artifacts.userId, req.userId)))
      .limit(1);
    if (!a) throw new NotFound('Artifact not found');
    return res.json(a);
  } catch (err) { next(err); }
});

/* PATCH /api/artifacts/:id */
router.patch('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const [a] = await db.select().from(artifacts)
      .where(and(eq(artifacts.id, req.params.id), eq(artifacts.userId, req.userId))).limit(1);
    if (!a) throw new NotFound('Artifact not found');
    const patch = {};
    for (const k of ['title', 'source']) if (req.body[k] !== undefined) patch[k] = req.body[k];
    patch.updatedAt = new Date();
    if (req.body.source) patch.version = a.version + 1;
    await db.update(artifacts).set(patch).where(eq(artifacts.id, req.params.id));
    if (req.body.source) {
      await db.insert(artifactVersions).values({
        artifactId: req.params.id, version: a.version + 1, source: req.body.source,
      });
    }
    const [updated] = await db.select().from(artifacts).where(eq(artifacts.id, req.params.id)).limit(1);
    return res.json(updated);
  } catch (err) { next(err); }
});

/* DELETE /api/artifacts/:id */
router.delete('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    await db.delete(artifacts).where(and(eq(artifacts.id, req.params.id), eq(artifacts.userId, req.userId)));
    return res.status(204).end();
  } catch (err) { next(err); }
});

/* GET /api/artifacts/:id/versions — list versions */
router.get('/:id/versions', async (req, res, next) => {
  try {
    const db = getDb();
    await requireOwnedArtifact(db, req.params.id, req.userId);
    const rows = await db.select().from(artifactVersions)
      .where(eq(artifactVersions.artifactId, req.params.id))
      .orderBy(desc(artifactVersions.version));
    return res.json({ versions: rows });
  } catch (err) { next(err); }
});

/* POST /api/artifacts/:id/share */
router.post('/:id/share', async (req, res, next) => {
  try {
    const db = getDb();
    const [a] = await db.select().from(artifacts)
      .where(and(eq(artifacts.id, req.params.id), eq(artifacts.userId, req.userId))).limit(1);
    if (!a) throw new NotFound('Artifact not found');
    const token = generateShareToken();
    /* P_share-visibility-enum — M6 audit fix. Whitelist visibility
     * at the API edge so the DB column cannot be poisoned with
     * arbitrary text (artifacts.visibility is plain TEXT). */
    const visibility = normalizeVisibility(req.body && req.body.visibility);
    await db.update(artifacts).set({ shareToken: token, visibility })
      .where(eq(artifacts.id, req.params.id));
    return res.status(201).json({ token, url: `/a/${token}`, visibility });
  } catch (err) { next(err); }
});

/* DELETE /api/artifacts/:id/share */
router.delete('/:id/share', async (req, res, next) => {
  try {
    const db = getDb();
    await db.update(artifacts).set({ shareToken: null, visibility: 'private' })
      .where(and(eq(artifacts.id, req.params.id), eq(artifacts.userId, req.userId)));
    return res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
