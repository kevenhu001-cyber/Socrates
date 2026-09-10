/** Unified Agent Runtime HTTP surface.
 *
 * The client consumes one run contract regardless of whether the underlying
 * adapter is native or the Pi workspace agent. This route intentionally
 * exposes workspace and policy identifiers, never real filesystem paths or
 * provider credentials.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { startSseKeepalive, trackSseConnection, writeSseEvent, writeSseHeaders } from '../lib/sse.js';
import {
  WORKSPACE_AGENT_ENABLED,
  WORKSPACE_AGENT_BACKGROUND_ENABLED,
  WORKSPACE_AGENT_TOOL,
  createAgentRun,
  getAgentRun,
  interruptAgentRun,
  listAgentEvents,
  listAgentRuns,
  resumeAgentRun,
  retryAgentRun,
  runAgentTurn,
  subscribeToAgentRun,
  type AgentRuntimeEvent,
} from '../services/agentRuntime.js';
import { projectAgentEvent } from '../services/agentStepProjection.js';

const router = Router();

function publicRun(run: any) {
  if (!run) return null;
  return {
    id: run.id,
    userId: run.userId,
    sessionId: run.sessionId,
    projectId: run.projectId,
    workspaceId: run.workspaceId,
    threadId: run.threadId,
    task: run.task,
    status: run.status,
    mode: run.mode,
    kind: run.kind,
    source: run.source,
    providerMode: run.providerMode,
    model: run.model,
    summary: run.summary,
    error: run.error,
    usage: run.usage,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
  };
}

function publicArtifact(artifact: any) {
  return {
    id: artifact.id,
    name: artifact.name || artifact.title,
    type: artifact.type,
    language: artifact.language,
    createdAt: artifact.createdAt,
  };
}

/**
 * Forward one runtime event to a subscriber.
 *
 * `agent_event` carries the raw runtime event (existing contract). Events
 * that describe a visible step or a plan update are additionally projected
 * through the same mapper the chat stream uses, so the workspace page and
 * the chat transcript label Codex activity identically.
 */
function sendRunEvent(res: any, event: AgentRuntimeEvent) {
  writeSseEvent(res, 'agent_event', event);
  const projected = projectAgentEvent(event);
  if (projected?.type === 'step') {
    writeSseEvent(res, 'agent_step', { runId: event.runId, ...projected });
  } else if (projected?.type === 'plan') {
    writeSseEvent(res, 'agent_plan', { runId: event.runId, ...projected });
  }
}

async function streamRun(req: any, res: any, runId: string, run: Promise<unknown>) {
  let done = false;
  const abort = new AbortController();
  const finish = () => {
    if (done) return;
    done = true;
    abort.abort('client_disconnected');
    if (!res.writableEnded && !res.destroyed) res.end();
    try { trackSseConnection(req.app, -1); } catch { /* ignore */ }
  };
  req.on('close', finish);

  if (!writeSseHeaders(res)) return;
  trackSseConnection(req.app, +1);
  const keepalive = startSseKeepalive(res, { intervalMs: 10_000 });
  try {
    writeSseEvent(res, 'agent_init', { runId });
    const result = await run;
    if (!done) {
      writeSseEvent(res, 'agent_result', result);
      writeSseEvent(res, 'agent_done', { runId });
    }
  } catch (err) {
    if (!done) writeSseEvent(res, 'agent_error', { runId, message: (err as Error).message });
  } finally {
    keepalive.stop();
    finish();
  }
}

router.get('/capabilities', requireAuth, async (req, res) => {
  res.json({
    enabled: WORKSPACE_AGENT_ENABLED,
    providerModes: ['user', 'server'],
    adapters: ['native', 'pi'],
    background: WORKSPACE_AGENT_BACKGROUND_ENABLED,
    tool: WORKSPACE_AGENT_TOOL,
    policy: {
      sandbox: 'workspace-write',
      approvalPolicy: 'never',
      unattended: 'workspace-write',
    },
  });
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const rows = await listAgentRuns(req.userId!, {
      sessionId: typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined,
      projectId: typeof req.query.projectId === 'string' ? req.query.projectId : undefined,
      limit: typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined,
    });
    res.json({ runs: rows.map(publicRun) });
  } catch (err) { next(err); }
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const body = req.body || {};
    const task = typeof body.task === 'string' ? body.task : '';
    const created = await createAgentRun({
      userId: req.userId!,
      task,
      sessionId: body.sessionId ?? null,
      projectId: body.projectId ?? null,
      kind: body.kind === 'tutor' || body.kind === 'scheduled' || body.kind === 'retry' ? body.kind : 'chat',
      source: body.source === 'tutor' || body.source === 'scheduled' ? body.source : 'api',
      threadId: body.threadId ?? null,
    });
    res.status(201).json({ run: publicRun(created.run), workspace: { id: created.run.workspaceId || null }, capabilities: { resumable: true } });
  } catch (err) { next(err); }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await getAgentRun(req.userId!, String(req.params.id));
    const events = await listAgentEvents(req.userId!, String(req.params.id), 0, 80);
    res.json({ run: publicRun(result.run), artifacts: (result.artifacts || []).map(publicArtifact), events });
  } catch (err) { next(err); }
});

router.get('/:id/events', requireAuth, async (req, res, next) => {
  const runId = String(req.params.id);
  let unsubscribe: (() => void) | null = null;
  let keepalive: { stop: () => void } | null = null;
  let closed = false;
  try {
    const after = Math.max(0, Number(req.query.after || 0));
    const buffered: AgentRuntimeEvent[] = [];
    let replayComplete = false;
    unsubscribe = subscribeToAgentRun(runId, (event) => {
      if (closed || event.sequence <= after) return;
      if (!replayComplete) buffered.push(event);
      else sendRunEvent(res, event);
    });
    const rows = await listAgentEvents(req.userId!, runId, after);
    if (!writeSseHeaders(res)) return;
    trackSseConnection(req.app, +1);
    keepalive = startSseKeepalive(res, { intervalMs: 10_000 });
    for (const row of rows) sendRunEvent(res, row);
    replayComplete = true;
    buffered.sort((a, b) => a.sequence - b.sequence);
    const sent = new Set(rows.map((row) => row.sequence));
    for (const event of buffered) {
      if (!sent.has(event.sequence)) sendRunEvent(res, event);
    }
    req.on('close', () => {
      closed = true;
      unsubscribe?.();
      keepalive?.stop();
      try { trackSseConnection(req.app, -1); } catch { /* ignore */ }
    });
  } catch (err) {
    unsubscribe?.();
    if (!res.headersSent) next(err);
    else if (!res.writableEnded) res.end();
  }
});

router.post('/:id/turns', requireAuth, async (req, res, next) => {
  try {
    const runId = String(req.params.id);
    const input = req.body?.input == null ? undefined : String(req.body.input);
    const controller = new AbortController();
    req.on('close', () => controller.abort('client_disconnected'));
    await streamRun(req, res, runId, runAgentTurn(runId, req.userId!, input, controller.signal));
  } catch (err) {
    if (!res.headersSent) next(err);
  }
});

router.post('/:id/interrupt', requireAuth, async (req, res, next) => {
  try { res.json(await interruptAgentRun(req.userId!, String(req.params.id))); }
  catch (err) { next(err); }
});

router.post('/:id/resume', requireAuth, async (req, res, next) => {
  try {
    const result = await resumeAgentRun(req.userId!, String(req.params.id), req.body?.input == null ? undefined : String(req.body.input));
    res.json({ run: publicRun(await getAgentRun(req.userId!, result.runId).then((value) => value.run)), result });
  } catch (err) { next(err); }
});

router.post('/:id/retry', requireAuth, async (req, res, next) => {
  try {
    const result = await retryAgentRun(req.userId!, String(req.params.id));
    res.status(202).json({ result, runId: result.runId });
  } catch (err) { next(err); }
});

export default router;
