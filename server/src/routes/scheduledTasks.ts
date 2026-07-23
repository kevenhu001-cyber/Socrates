import { Router } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { scheduledTasks } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { NotFound, BadRequest } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

/* GET /api/scheduled-tasks — list user's scheduled tasks */
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const rows = await db.select().from(scheduledTasks)
      .where(eq(scheduledTasks.userId, req.userId!))
      .orderBy(desc(scheduledTasks.nextRunAt));
    return res.json({ tasks: rows });
  } catch (err) { next(err); }
});

/* POST /api/scheduled-tasks — create */
router.post('/', async (req, res, next) => {
  try {
    const { title, prompt, sessionId, cronExpression, frequency, nextRunAt } = req.body;
    if (!title) throw new BadRequest('title is required');
    const db = getDb();
    const [task] = await db.insert(scheduledTasks).values({
      userId: req.userId!,
      title,
      prompt: prompt || '',
      sessionId: sessionId || null,
      cronExpression: cronExpression || null,
      frequency: frequency || 'once',
      status: 'pending',
      nextRunAt: nextRunAt ? new Date(nextRunAt) : null,
    }).returning();
    return res.status(201).json(task);
  } catch (err) { next(err); }
});

/* PATCH /api/scheduled-tasks/:id — update */
router.patch('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const [existing] = await db.select().from(scheduledTasks)
      .where(and(eq(scheduledTasks.id, req.params.id), eq(scheduledTasks.userId, req.userId!)))
      .limit(1);
    if (!existing) throw new NotFound('Scheduled task not found');
    const patch: Record<string, unknown> = {};
    for (const key of ['title', 'prompt', 'sessionId', 'cronExpression', 'frequency', 'status', 'nextRunAt']) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }
    patch.updatedAt = new Date();
    if (patch.nextRunAt) patch.nextRunAt = new Date(patch.nextRunAt as string);
    await db.update(scheduledTasks).set(patch).where(eq(scheduledTasks.id, req.params.id));
    const [updated] = await db.select().from(scheduledTasks).where(eq(scheduledTasks.id, req.params.id)).limit(1);
    return res.json(updated);
  } catch (err) { next(err); }
});

/* DELETE /api/scheduled-tasks/:id */
router.delete('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    await db.delete(scheduledTasks)
      .where(and(eq(scheduledTasks.id, req.params.id), eq(scheduledTasks.userId, req.userId!)));
    return res.status(204).end();
  } catch (err) { next(err); }
});

export default router;
