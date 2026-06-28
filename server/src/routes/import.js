import { Router } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { importJobs } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

/* POST /api/import — create import job
 *
 * The previous implementation queued a job, then 100 ms later
 * flipped the status to "completed" with `processed = total` while
 * never persisting any sessions / messages. The UI then rendered a
 * green "imported N items" toast that was a lie. We now surface the
 * real state: status='not_implemented' so the front-end can show a
 * clear "this feature is not yet wired up" notice instead of a
 * misleading success.
 */
router.post('/', async (req, res, next) => {
  try {
    const { source, payload } = req.body;
    if (!source || !payload) return res.status(400).json({ code: 'BAD_REQUEST', message: 'source and payload required' });
    const total = Array.isArray(payload) ? payload.length
      : Array.isArray(payload?.sessions) ? payload.sessions.length
      : 1;
    const db = getDb();
    const [job] = await db.insert(importJobs).values({
      userId: req.userId,
      source,
      // P0 honesty: don't claim a job is completed when the
      // pipeline isn't wired up.  The previous value was
      // 'completed' which silently mis-led the front-end.
      status: 'not_implemented',
      progress: { total, processed: 0, errors: 0 },
    }).returning();
    return res.status(202).json(job);
  } catch (err) { next(err); }
});

/* GET /api/import — list past imports */
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const rows = await db.select().from(importJobs).where(eq(importJobs.userId, req.userId)).orderBy(desc(importJobs.createdAt)).limit(20);
    return res.json({ jobs: rows });
  } catch (err) { next(err); }
});

/* GET /api/import/:id */
router.get('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    // Use `and` rather than selecting first and string-comparing
    // userId; the previous version did a JS-level comparison that
    // would 404 for the right reasons but skip the DB-side filter.
    const [job] = await db.select().from(importJobs)
      .where(and(eq(importJobs.id, req.params.id), eq(importJobs.userId, req.userId)))
      .limit(1);
    if (!job) return res.status(404).json({ code: 'NOT_FOUND', message: 'Import job not found' });
    return res.json(job);
  } catch (err) { next(err); }
});

export default router;
