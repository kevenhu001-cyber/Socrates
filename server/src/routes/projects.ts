import { Router } from 'express';
import { eq, and } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { projects, sessions } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { NotFound, BadRequest } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

/* GET /api/projects — list projects */
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const rows = await db.select().from(projects)
      .where(eq(projects.userId, req.userId!))
      .orderBy(projects.createdAt);
    return res.json({ projects: rows });
  } catch (err) { next(err); }
});

/* POST /api/projects — create */
router.post('/', async (req, res, next) => {
  try {
    const { name, description, color, icon, systemPrompt } = req.body;
    if (!name) throw new BadRequest('name is required');
    const db = getDb();
    const [project] = await db.insert(projects).values({
      userId: req.userId!,
      name, description, color, icon, systemPrompt,
    }).returning();
    return res.status(201).json(project);
  } catch (err) { next(err); }
});

/* PATCH /api/projects/:id — update */
router.patch('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const [existing] = await db.select().from(projects)
      .where(and(eq(projects.id, req.params.id), eq(projects.userId, req.userId!)))
      .limit(1);
    if (!existing) throw new NotFound('Project not found');
    const patch: Record<string, unknown> = {};
    for (const key of ['name', 'description', 'color', 'icon', 'systemPrompt']) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }
    if (Object.keys(patch).length) {
      await db.update(projects).set(patch).where(eq(projects.id, req.params.id));
    }
    const [updated] = await db.select().from(projects).where(eq(projects.id, req.params.id)).limit(1);
    return res.json(updated);
  } catch (err) { next(err); }
});

/* DELETE /api/projects/:id */
router.delete('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    await db.delete(projects)
      .where(and(eq(projects.id, req.params.id), eq(projects.userId, req.userId!)));
    return res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
