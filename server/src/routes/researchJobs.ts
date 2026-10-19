import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { resourceScope } from '../middleware/scopes.js';
import { BadRequest } from '../lib/errors.js';
import { writeSseHeaders, startSseKeepalive, trackSseConnection } from '../lib/sse.js';
import {
  createResearchJob, getResearchJob, getResearchResult, listResearchJobs, listResearchEvents,
  controlResearchJob, refineResearchJob, publicResearchJob, ResearchId, ResearchCursor,
} from '../services/core/researchJobs.js';

const router = Router();
router.use(requireAuth);
router.use(resourceScope('chat'));
router.param('id', (req, _res, next, id) => {
  if (!ResearchId.safeParse(id).success) return next(new BadRequest('Invalid research job id'));
  next();
});

router.post('/', async (req, res, next) => {
  try { res.status(202).json({ job: publicResearchJob(await createResearchJob(req.userId!, req.body)) }); }
  catch (error) { next(error); }
});
router.get('/', async (req, res, next) => {
  try {
    const sessionId = req.query.sessionId;
    if (sessionId !== undefined && !ResearchId.safeParse(sessionId).success) throw new BadRequest('Invalid session id');
    res.json({ jobs: (await listResearchJobs(req.userId!, sessionId as string | undefined)).map(publicResearchJob) });
  } catch (error) { next(error); }
});
router.get('/:id', async (req, res, next) => {
  try { res.json({ job: publicResearchJob(await getResearchJob(req.userId!, String(req.params.id))) }); }
  catch (error) { next(error); }
});
router.get('/:id/result', async (req, res, next) => {
  try { res.json({ message: await getResearchResult(req.userId!, String(req.params.id)) }); }
  catch (error) { next(error); }
});
// Declared one route per action rather than looping over ['cancel','retry']:
// the OpenAPI drift ratchet (scripts/check-openapi-drift.mjs) discovers routes
// by matching literal path strings, so a template-literal path here would be
// invisible to it and silently drop both endpoints from contract drift checks.
router.post('/:id/cancel', async (req, res, next) => {
  try { res.status(200).json({ job: publicResearchJob(await controlResearchJob(req.userId!, String(req.params.id), 'cancel')) }); }
  catch (error) { next(error); }
});
router.post('/:id/retry', async (req, res, next) => {
  try { res.status(202).json({ job: publicResearchJob(await controlResearchJob(req.userId!, String(req.params.id), 'retry')) }); }
  catch (error) { next(error); }
});
router.post('/:id/refine', async (req, res, next) => {
  try {
    const result = await refineResearchJob(req.userId!, String(req.params.id), req.body);
    res.status(202).json({ job: publicResearchJob(result.job), previous: publicResearchJob(result.previous) });
  } catch (error) { next(error); }
});

router.get('/:id/events', async (req, res, next) => {
  let closed = false;
  let counted = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let keepalive: { stop: () => void } | undefined;
  const finish = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    keepalive?.stop();
    if (counted) trackSseConnection(req.app, -1);
  };
  // Response close reflects disconnection reliably even after the GET request
  // has finished reading. Closing this stream never cancels background work.
  res.once('close', finish);
  try {
    const parsed = ResearchCursor.safeParse(req.get('Last-Event-ID') ?? req.query.after ?? 0);
    if (!parsed.success) throw new BadRequest('Invalid research event cursor');
    let cursor = parsed.data;
    const job = await getResearchJob(req.userId!, String(req.params.id));
    if (cursor > job.eventSequence) throw new BadRequest('Research event cursor is ahead of the job');
    if (closed || !writeSseHeaders(res)) { finish(); return; }
    counted = true;
    trackSseConnection(req.app, 1);
    keepalive = startSseKeepalive(res);
    const pump = async () => {
      try {
        if (closed) return;
        const events = await listResearchEvents(req.userId!, job.id, cursor);
        for (const event of events) {
          if (closed) return;
          cursor = event.sequence;
          if (!res.write(`id: ${cursor}\nevent: research_event\ndata: ${JSON.stringify(event)}\n\n`)) {
            // End slow streams instead of buffering unbounded history. The
            // client reconnects with its last received event ID.
            res.end(); finish(); return;
          }
        }
        const latest = await getResearchJob(req.userId!, job.id);
        if (['succeeded', 'failed', 'cancelled'].includes(latest.status) && cursor >= latest.eventSequence) {
          res.end(); finish(); return;
        }
        if (!closed) timer = setTimeout(() => { void pump(); }, events.length === 100 ? 0 : 1000);
      } catch { res.end(); finish(); }
    };
    void pump();
  } catch (error) { finish(); next(error); }
});

export default router;
