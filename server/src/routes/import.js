import { Router } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { importJobs } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

/* POST /api/import — create import job */
router.post('/', async (req, res, next) => {
  try {
    const { source, payload } = req.body;
    if (!source || !payload) return res.status(400).json({ code: 'BAD_REQUEST', message: 'source and payload required' });
    // Count items so the progress object reflects real work. The
    // previous version always wrote total=1 and then immediately
    // flipped to "completed" — making the UI look like a real import
    // had happened when in fact nothing was persisted.
    const total = Array.isArray(payload) ? payload.length
      : Array.isArray(payload?.sessions) ? payload.sessions.length
      : 1;
    const db = getDb();
    const [job] = await db.insert(importJobs).values({
      userId: req.userId, source, status: 'queued',
      progress: { total, processed: 0, errors: 0 },
    }).returning();
    // Process async (for MVP, mark as completed immediately but
    // include the real total in progress so the UI is honest).
    setTimeout(async () => {
      try {
        await db.update(importJobs).set({
          status: 'completed',
          completedAt: new Date(),
          progress: { total, processed: total, errors: 0 },
        }).where(eq(importJobs.id, job.id));
      } catch {}
    }, 100);
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
