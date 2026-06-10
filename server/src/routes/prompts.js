import { Router } from 'express';
import { eq, and, or } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { prompts } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { NotFound, BadRequest } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

/* GET /api/prompts */
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const { scope = 'all' } = req.query;
    const where = scope === 'builtin' ? eq(prompts.isBuiltin, true)
      : scope === 'mine' ? eq(prompts.userId, req.userId)
      : or(eq(prompts.userId, req.userId), eq(prompts.isBuiltin, true));
    const rows = await db.select().from(prompts).where(where);
    return res.json({ templates: rows });
  } catch (err) { next(err); }
});

/* POST /api/prompts */
router.post('/', async (req, res, next) => {
  try {
    const { title, description, body, icon, category, shortcut } = req.body;
    if (!title || !body) throw new BadRequest('title and body are required');
    const db = getDb();
    const [p] = await db.insert(prompts).values({
      userId: req.userId, title, description, body, icon, category: category || 'other', shortcut,
    }).returning();
    return res.status(201).json(p);
  } catch (err) { next(err); }
});

/* PATCH /api/prompts/:id */
router.patch('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const [p] = await db.select().from(prompts)
      .where(and(eq(prompts.id, req.params.id), eq(prompts.userId, req.userId))).limit(1);
    if (!p) throw new NotFound('Template not found');
    const patch = {};
    for (const k of ['title', 'description', 'body', 'icon', 'category', 'shortcut'])
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    await db.update(prompts).set(patch).where(eq(prompts.id, req.params.id));
    const [updated] = await db.select().from(prompts).where(eq(prompts.id, req.params.id)).limit(1);
    return res.json(updated);
  } catch (err) { next(err); }
});

/* DELETE /api/prompts/:id */
router.delete('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    await db.delete(prompts).where(and(eq(prompts.id, req.params.id), eq(prompts.userId, req.userId)));
    return res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
