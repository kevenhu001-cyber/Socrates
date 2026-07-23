import { Router } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { plugins } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { NotFound, BadRequest } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

/* GET /api/plugins — list user's installed plugins */
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const rows = await db.select().from(plugins)
      .where(eq(plugins.userId, req.userId!))
      .orderBy(desc(plugins.createdAt));
    return res.json({ plugins: rows });
  } catch (err) { next(err); }
});

/* GET /api/plugins/marketplace — list builtin plugins (global catalog) */
router.get('/marketplace', async (_req, res, next) => {
  try {
    const db = getDb();
    const rows = await db.select().from(plugins)
      .where(eq(plugins.isBuiltin, true))
      .orderBy(plugins.name);
    return res.json({ plugins: rows });
  } catch (err) { next(err); }
});

/* POST /api/plugins — install a plugin */
router.post('/', async (req, res, next) => {
  try {
    const { name, description, type, config } = req.body;
    if (!name) throw new BadRequest('name is required');
    const db = getDb();
    const [plugin] = await db.insert(plugins).values({
      userId: req.userId!,
      name,
      description: description || '',
      type: type || 'extension',
      config: config || {},
      isBuiltin: false,
      isEnabled: true,
    }).returning();
    return res.status(201).json(plugin);
  } catch (err) { next(err); }
});

/* PATCH /api/plugins/:id — update plugin config / toggle enabled */
router.patch('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const [existing] = await db.select().from(plugins)
      .where(and(eq(plugins.id, req.params.id), eq(plugins.userId, req.userId!)))
      .limit(1);
    if (!existing) throw new NotFound('Plugin not found');
    const patch: Record<string, unknown> = {};
    for (const key of ['name', 'description', 'type', 'config', 'isEnabled']) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }
    patch.updatedAt = new Date();
    await db.update(plugins).set(patch).where(eq(plugins.id, req.params.id));
    const [updated] = await db.select().from(plugins).where(eq(plugins.id, req.params.id)).limit(1);
    return res.json(updated);
  } catch (err) { next(err); }
});

/* DELETE /api/plugins/:id — uninstall */
router.delete('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    await db.delete(plugins)
      .where(and(eq(plugins.id, req.params.id), eq(plugins.userId, req.userId!)));
    return res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
