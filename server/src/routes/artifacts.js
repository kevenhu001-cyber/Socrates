import { Router } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { artifacts, artifactVersions } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { NotFound, BadRequest } from '../lib/errors.js';
import { generateShareToken } from '../lib/crypto.js';

const router = Router();
router.use(requireAuth);

/* GET /api/artifacts — list user's artifacts */
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const { sessionId, projectId } = req.query;
    const conditions = [eq(artifacts.userId, req.userId)];
    if (sessionId) conditions.push(eq(artifacts.sessionId, sessionId));
    if (projectId) conditions.push(eq(artifacts.projectId, projectId));
    const rows = await db.select().from(artifacts).where(and(...conditions)).orderBy(desc(artifacts.updatedAt));
    return res.json({ artifacts: rows });
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
    await db.update(artifacts).set({ shareToken: token, visibility: req.body?.visibility || 'unlisted' })
      .where(eq(artifacts.id, req.params.id));
    return res.status(201).json({ token, url: `/a/${token}` });
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
