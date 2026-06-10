import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { memories } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { NotFound, BadRequest } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

/* GET /api/memory */
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const includeDisabled = req.query.includeDisabled === 'true';
    const conditions = [eq(memories.userId, req.userId)];
    if (!includeDisabled) conditions.push(eq(memories.enabled, true));
    const rows = await db.select().from(memories).where(and(...conditions));
    return res.json({ memories: rows });
  } catch (err) { next(err); }
});

/* POST /api/memory */
router.post('/', async (req, res, next) => {
  try {
    const { text, scope, projectId, source } = req.body;
    if (!text) throw new BadRequest('text is required');
    const db = getDb();
    const [m] = await db.insert(memories).values({
      userId: req.userId, text, scope: scope || 'global',
      projectId: projectId || null, source: source || 'user',
    }).returning();
    return res.status(201).json(m);
  } catch (err) { next(err); }
});

/* PATCH /api/memory/:id */
router.patch('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const [m] = await db.select().from(memories)
      .where(and(eq(memories.id, req.params.id), eq(memories.userId, req.userId))).limit(1);
    if (!m) throw new NotFound('Memory not found');
    const patch = {};
    if (req.body.text !== undefined) patch.text = req.body.text;
    if (req.body.enabled !== undefined) patch.enabled = req.body.enabled;
    await db.update(memories).set(patch).where(eq(memories.id, req.params.id));
    const [updated] = await db.select().from(memories).where(eq(memories.id, req.params.id)).limit(1);
    return res.json(updated);
  } catch (err) { next(err); }
});

/* DELETE /api/memory/:id */
router.delete('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    await db.delete(memories)
      .where(and(eq(memories.id, req.params.id), eq(memories.userId, req.userId)));
    return res.status(204).end();
  } catch (err) { next(err); }
});

/* POST /api/memory/:id/enable */
router.post('/:id/enable', async (req, res, next) => {
  try {
    const db = getDb();
    await db.update(memories).set({ enabled: true })
      .where(and(eq(memories.id, req.params.id), eq(memories.userId, req.userId)));
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

/* POST /api/memory/:id/disable */
router.post('/:id/disable', async (req, res, next) => {
  try {
    const db = getDb();
    await db.update(memories).set({ enabled: false })
      .where(and(eq(memories.id, req.params.id), eq(memories.userId, req.userId)));
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
