import { Router } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { scheduledTasks } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { NotFound, BadRequest } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

const FREQUENCIES = ['once', 'hourly', 'daily', 'weekly', 'monthly', 'custom'];
const STATUSES = ['pending', 'active', 'paused', 'completed', 'failed'];

/* Normalise a client-supplied nextRunAt value. The form sends an ISO
   string; an empty string / null clears the field. Throws on garbage
   so a bad value never reaches the timestamp column. */
function parseNextRunAt(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(String(value));
  if (isNaN(date.getTime())) throw new BadRequest('nextRunAt is not a valid date');
  return date;
}

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
    if (!title || !String(title).trim()) throw new BadRequest('title is required');
    const freq = frequency || 'once';
    if (!FREQUENCIES.includes(freq)) throw new BadRequest('frequency must be one of: ' + FREQUENCIES.join(', '));
    /* Default the first run to "now" so a task created without an
       explicit time still executes on the next scheduler poll instead
       of sitting dormant forever with a NULL nextRunAt. */
    const firstRun = parseNextRunAt(nextRunAt) || new Date();
    const db = getDb();
    const [task] = await db.insert(scheduledTasks).values({
      userId: req.userId!,
      title: String(title).trim(),
      prompt: prompt || '',
      sessionId: sessionId || null,
      cronExpression: cronExpression || null,
      frequency: freq,
      status: 'active',
      nextRunAt: firstRun,
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
    for (const key of ['title', 'prompt', 'sessionId', 'cronExpression', 'frequency', 'status']) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }
    if (patch.frequency !== undefined && !FREQUENCIES.includes(String(patch.frequency))) {
      throw new BadRequest('frequency must be one of: ' + FREQUENCIES.join(', '));
    }
    if (patch.status !== undefined && !STATUSES.includes(String(patch.status))) {
      throw new BadRequest('status must be one of: ' + STATUSES.join(', '));
    }
    if (req.body.nextRunAt !== undefined) {
      patch.nextRunAt = parseNextRunAt(req.body.nextRunAt);
    }
    /* Resuming a task that has no future run slot (paused past its
       time, or a completed/failed one-shot being re-armed) would
       otherwise never fire again — give it an immediate slot. */
    if (patch.status === 'active' && patch.nextRunAt === undefined) {
      const current = existing.nextRunAt ? new Date(existing.nextRunAt) : null;
      if (!current || current.getTime() <= Date.now()) patch.nextRunAt = new Date();
    }
    patch.updatedAt = new Date();
    await db.update(scheduledTasks).set(patch).where(eq(scheduledTasks.id, req.params.id));
    const [updated] = await db.select().from(scheduledTasks).where(eq(scheduledTasks.id, req.params.id)).limit(1);
    return res.json(updated);
  } catch (err) { next(err); }
});

/* POST /api/scheduled-tasks/:id/run — execute immediately.
   Runs the task synchronously (LLM call included) and returns the
   updated row; the recurring schedule is left untouched so a manual
   run never shifts the next planned slot. */
router.post('/:id/run', async (req, res, next) => {
  try {
    const db = getDb();
    const [task] = await db.select().from(scheduledTasks)
      .where(and(eq(scheduledTasks.id, req.params.id), eq(scheduledTasks.userId, req.userId!)))
      .limit(1);
    if (!task) throw new NotFound('Scheduled task not found');
    const { runScheduledTaskNow } = await import('../services/scheduler.js');
    const updated = await runScheduledTaskNow(task, { reschedule: false });
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
