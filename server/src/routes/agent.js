import { Router } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { agentRuns, sessions, messages } from '../db/schema.js';
import { requireAuth } from '../middleware/auth.js';
import { chatLimiter } from '../middleware/rateLimit.js';
import { NotFound, BadRequest } from '../lib/errors.js';
import { getActiveApiKey } from '../services/apiKey.js';
import { streamChatCompletion } from '../services/llm.js';
import crypto from 'node:crypto';

const router = Router();
router.use(requireAuth);

/* POST /api/agent/run — SSE agent stream */
router.post('/run', chatLimiter, async (req, res, next) => {
  try {
    const { task, sessionId } = req.body;
    if (!task) throw new BadRequest('task is required');

    const provider = await getActiveApiKey(req.userId);
    if (!provider) return res.status(503).json({ code: 'NO_PROVIDER', message: 'No active LLM provider configured' });

    const db = getDb();
    const [run] = await db.insert(agentRuns).values({
      userId: req.userId, task, sessionId: sessionId || null, status: 'running',
    }).returning();

    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache',
      'Connection': 'keep-alive', 'X-Accel-Buffering': 'no',
    });

    const hb = setInterval(() => { try { res.write(': keepalive\n\n'); } catch { clearInterval(hb); } }, 10000);
    const ac = new AbortController();
    req.on('close', () => { clearInterval(hb); ac.abort(); });

    res.write(`event: start\ndata: ${JSON.stringify({ runId: run.id })}\n\n`);

    const msgs = [
      { role: 'system', content: `You are an AI agent. Task: ${task}` },
      { role: 'user', content: task },
    ];

    let fullText = '';
    await streamChatCompletion(
      { apiBase: provider.url, apiKey: provider.keyPlaintext, model: provider.model, messages: msgs, maxTokens: 4096, signal: ac.signal },
      (chunk) => { fullText += chunk; try { res.write(`event: text\ndata: ${JSON.stringify(chunk)}\n\n`); } catch {} },
      () => {
        clearInterval(hb);
        db.update(agentRuns).set({ status: 'completed', completedAt: new Date() }).where(eq(agentRuns.id, run.id)).catch(() => {});
        try { res.write(`event: done\ndata: ${JSON.stringify({ runId: run.id })}\n\n`); res.end(); } catch {}
      },
      (err) => {
        clearInterval(hb);
        db.update(agentRuns).set({ status: 'failed' }).where(eq(agentRuns.id, run.id)).catch(() => {});
        try { res.write(`event: error\ndata: ${err.message}\n\n`); res.end(); } catch {}
      },
    );
  } catch (err) { next(err); }
});

/* GET /api/agent/runs/:runId */
router.get('/runs/:runId', async (req, res, next) => {
  try {
    const db = getDb();
    const [run] = await db.select().from(agentRuns)
      .where(and(eq(agentRuns.id, req.params.runId), eq(agentRuns.userId, req.userId)))
      .limit(1);
    if (!run) throw new NotFound('Run not found');
    return res.json(run);
  } catch (err) { next(err); }
});

/* PUT /api/agent/runs/:runId/plan */
router.put('/runs/:runId/plan', async (req, res, next) => {
  try {
    const db = getDb();
    const { steps, approved } = req.body;
    if (!Array.isArray(steps)) throw new BadRequest('steps array is required');
    await db.update(agentRuns).set({
      plan: steps, status: approved ? 'running' : 'awaiting_approval',
    }).where(and(eq(agentRuns.id, req.params.runId), eq(agentRuns.userId, req.userId)));
    return res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
