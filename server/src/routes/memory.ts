import { Router } from 'express';
import { eq, and, desc, sql } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { memories } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { NotFound, BadRequest } from '../lib/errors.js';
import { isUuid } from '../lib/validate.js';

const router = Router();
router.use(requireAuth);

/* GET /api/memory (cursor-paginated) */
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const includeDisabled = req.query.includeDisabled === 'true';
    const { limit, cursor } = req.query;
    const maxLimit = Math.min(parseInt((limit as string) || '50', 10), 200);

    const conditions = [eq(memories.userId, req.userId!)];
    if (!includeDisabled) conditions.push(eq(memories.enabled, true));
    if (cursor) conditions.push(sql`${memories.createdAt} < ${cursor}::timestamptz`);

    const rows = await db.select().from(memories)
      .where(and(...conditions))
      .orderBy(desc(memories.createdAt))
      .limit(maxLimit + 1);

    const hasMore = rows.length > maxLimit;
    const list = hasMore ? rows.slice(0, maxLimit) : rows;
    const nextCursor = hasMore ? list[list.length - 1].createdAt.toISOString() : null;

    return res.json({ memories: list, nextCursor });
  } catch (err) { next(err); }
});

/* POST /api/memory */
router.post('/', async (req, res, next) => {
  try {
    const { text, scope, projectId, source } = req.body;
    if (!text) throw new BadRequest('text is required');
    const db = getDb();
    const [m] = await db.insert(memories).values({
      userId: req.userId!, text, scope: scope || 'global',
      projectId: projectId || null, source: source || 'user',
    }).returning();
    return res.status(201).json(m);
  } catch (err) { next(err); }
});

/* PATCH /api/memory/:id */
router.patch('/:id', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) throw new NotFound('Memory not found');
    const db = getDb();
    const [m] = await db.select().from(memories)
      .where(and(eq(memories.id, req.params.id), eq(memories.userId, req.userId!))).limit(1);
    if (!m) throw new NotFound('Memory not found');
    const patch: Record<string, unknown> = {};
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
    if (!isUuid(req.params.id)) throw new NotFound('Memory not found');
    const db = getDb();
    await db.delete(memories)
      .where(and(eq(memories.id, req.params.id), eq(memories.userId, req.userId!)));
    return res.status(204).end();
  } catch (err) { next(err); }
});

/* POST /api/memory/:id/enable */
router.post('/:id/enable', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) throw new NotFound('Memory not found');
    const db = getDb();
    const [m] = await db.select().from(memories)
      .where(and(eq(memories.id, req.params.id), eq(memories.userId, req.userId!)))
      .limit(1);
    if (!m) throw new NotFound('Memory not found');
    await db.update(memories).set({ enabled: true })
      .where(eq(memories.id, req.params.id));
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

/* POST /api/memory/:id/disable */
router.post('/:id/disable', async (req, res, next) => {
  try {
    if (!isUuid(req.params.id)) throw new NotFound('Memory not found');
    const db = getDb();
    const [m] = await db.select().from(memories)
      .where(and(eq(memories.id, req.params.id), eq(memories.userId, req.userId!)))
      .limit(1);
    if (!m) throw new NotFound('Memory not found');
    await db.update(memories).set({ enabled: false })
      .where(eq(memories.id, req.params.id));
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
