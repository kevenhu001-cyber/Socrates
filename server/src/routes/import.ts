import { Router } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { importJobs } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { isImportableSource, runImportJob } from '../services/importer.js';

const router = Router();
router.use(requireAuth);

/* The import_jobs row has no dedicated errors column; failure detail is
   stored under progress.failures and surfaced as the documented top-level
   `errors` array (see site/openapi.json → ImportJob). */
function serializeJob(job: typeof importJobs.$inferSelect) {
  const progress = (job.progress ?? {}) as Record<string, unknown>;
  const failures = Array.isArray(progress.failures) ? progress.failures : [];
  return { ...job, errors: failures };
}

/* POST /api/import — create and execute an import job
 *
 * The previous implementation queued a job, then 100 ms later flipped the
 * status to "completed" with `processed = total` while never persisting
 * any sessions / messages — a green toast that was a lie. The job now runs
 * the real importer synchronously (the JSON body cap is 16 MB, so the
 * payload is already fully in memory): status lands on 'completed',
 * 'failed', or 'not_implemented' for sources without a wired importer.
 * Clients may still poll GET /api/import/:id — the response shape is
 * unchanged.
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
      userId: req.userId!,
      source,
      status: 'queued',
      progress: { total, processed: 0, errors: 0 },
    }).returning();

    /* Unsupported sources still get a job row — its terminal
       'not_implemented' status is an honest answer the caller can poll
       for, per the documented ImportJob status enum. */
    if (isImportableSource(source)) {
      try {
        await runImportJob(job.id, req.userId!, String(source), payload);
      } catch (runErr) {
        /* A catastrophic failure (DB drop mid-run, bug in the normalizer)
           must not leave the job pinned at 'running' — record it failed
           so polling clients terminate instead of waiting forever. */
        await db.update(importJobs).set({ status: 'failed', completedAt: new Date() }).where(eq(importJobs.id, job.id)).catch(() => {});
        throw runErr;
      }
    } else {
      await db.update(importJobs)
        .set({ status: 'not_implemented', completedAt: new Date() })
        .where(eq(importJobs.id, job.id));
    }

    const [finalJob] = await db.select().from(importJobs).where(eq(importJobs.id, job.id)).limit(1);
    res.setHeader('Location', `/api/import/${job.id}`);
    return res.status(202).json(serializeJob(finalJob || job));
  } catch (err) { next(err); }
});

/* GET /api/import — list past imports */
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const rows = await db.select().from(importJobs).where(eq(importJobs.userId, req.userId!)).orderBy(desc(importJobs.createdAt)).limit(20);
    return res.json({ jobs: rows.map(serializeJob) });
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
      .where(and(eq(importJobs.id, req.params.id), eq(importJobs.userId, req.userId!)))
      .limit(1);
    if (!job) return res.status(404).json({ code: 'NOT_FOUND', message: 'Import job not found' });
    return res.json(serializeJob(job));
  } catch (err) { next(err); }
});

export default router;
