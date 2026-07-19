import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';
import { executions, files } from '../db/schema.js';
import { isUuid } from '../lib/validate.js';
import { NotFound } from '../lib/errors.js';
import { trackSseConnection, startSseKeepalive } from '../lib/sse.js';
import { subscribeExecution, subscribeExecutionResult, unsubscribeExecution, unsubscribeExecutionResult } from '../services/codeInterpreter.js';

const router = Router();

/**
 * SSE endpoint for real-time code execution progress.
 *
 * Mounted at /api/executions/:id/stream so the frontend can open an
 * EventSource without exposing the entire chat router. The handler
 * is extracted from chat.js to avoid the duplicate route-mount in
 * app.js that previously exposed all chat routes under /api/executions/.
 *
 * SSE event types:
 *   event: progress — { phase, stream, chunk, elapsedMs, executionId }
 *   event: result   — { status, executionId, stdout, stderr, durationMs, artifactFileIds }
 *   event: error    — error description
 */
router.get('/:id/stream', requireAuth, async (req, res, next) => {
  try {
    const executionId = req.params.id;
    if (!isUuid(executionId)) {
      return res.status(400).json({ code: 'BAD_REQUEST', message: 'Invalid execution ID format' });
    }
    const db = getDb();
    const [exec] = await db.select().from(executions)
      .where(and(eq(executions.id, executionId), eq(executions.userId, req.userId)))
      .limit(1);
    if (!exec) throw new NotFound('Execution not found');

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    trackSseConnection(req.app, +1);

    /* SSE keepalive — periodic `:keepalive` comment so the reverse
       proxy (nginx / EdgeOne) doesn't idle-kill the upstream while
       a long-running execution emits no progress events. The helper
       emits one comment immediately (so a slow first event doesn't
       look like a hang) and self-cleans on res close/finish/error. */
    startSseKeepalive(res, { intervalMs: 10_000 });

    if (exec.status === 'completed' || exec.status === 'failed' || exec.status === 'timeout' || exec.status === 'cancelled') {
      let artifactFileIds = [];
      try {
        const artifactRows = await db.select({ id: files.id, name: files.name, mimeType: files.mimeType })
          .from(files)
          .where(eq(files.executionId, executionId));
        artifactFileIds = artifactRows;
      } catch (err) {
        console.warn('[execution] artifact fetch failed:', err.message);
      }

      res.write(`event: result\ndata: ${JSON.stringify({
        status: exec.status,
        executionId: exec.id,
        stdout: exec.stdout || '',
        stderr: exec.stderr || '',
        durationMs: exec.durationMs || 0,
        exitCode: exec.exitCode,
        errorMessage: exec.errorMessage || null,
        artifactFileIds,
      })}\n\n`);
      res.flush?.();
      res.end();
      trackSseConnection(req.app, -1);
      return;
    }

    const onProgress = (event) => {
      try {
        res.write(`event: progress\ndata: ${JSON.stringify({
          phase: event.phase, stream: event.stream,
          chunk: event.chunk || '', executionId: event.executionId,
          elapsedMs: event.elapsedMs || 0,
        })}\n\n`);
        res.flush?.();
      } catch {}
    };
    const onResult = (event) => {
      try {
        res.write(`event: result\ndata: ${JSON.stringify(event)}\n\n`);
        res.flush?.();
      } catch {}
    };
    const onError = (event) => {
      try {
        res.write(`event: error\ndata: ${JSON.stringify({ error: event.errorMessage || event })}\n\n`);
        res.flush?.();
      } catch {}
    };

    const unsubProgress = await subscribeExecution(executionId, onProgress);
    const unsubResult = await subscribeExecutionResult(executionId, onResult);

    req.on('close', () => {
      trackSseConnection(req.app, -1);
      if (unsubProgress) { try { unsubProgress(); } catch {} }
      if (unsubResult) { try { unsubResult(); } catch {} }
      try { unsubscribeExecution(executionId, onProgress); } catch {}
      try { unsubscribeExecutionResult(executionId, onResult); } catch {}
    });
  } catch (err) { next(err); }
});

export default router;
