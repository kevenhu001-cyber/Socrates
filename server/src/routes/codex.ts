/**
 * codex.js — HTTP surface for the embedded Codex agent runtime.
 *
 *   POST   /api/codex/threads                 create a thread (isolated workspace + per-user provider)
 *   GET    /api/codex/threads/:id             thread status (owner, last turn, pending approvals)
 *   POST   /api/codex/threads/:id/turns       start a turn; streams bridged events over SSE
 *   POST   /api/codex/threads/:id/approvals   answer a pending approval request
 *   POST   /api/codex/threads/:id/interrupt   interrupt the active turn
 *   DELETE /api/codex/threads/:id             delete thread + workspace
 *   GET    /api/codex/capabilities            enabled flag + provider mode for the caller
 *
 * SSE events (event: name / data: JSON):
 *   codex_turn_started, codex_delta, codex_reasoning, codex_tool, codex_tool_output,
 *   codex_item_completed, codex_approval, codex_turn_completed, codex_thread_status,
 *   codex_usage, codex_error, codex_done
 *
 * Security: the client never supplies config/policy. The server builds the
 * per-thread config (provider, cwd, approvalPolicy, sandbox) from the DB and
 * fixed defaults; approvals are the only interactive control surface.
 */

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { requireAuth } from '../middleware/auth.js';
import { trackSseConnection, startSseKeepalive, writeSseEvent, writeSseHeaders } from '../lib/sse.js';
import { BadRequest, NotFound } from '../lib/errors.js';
import { codexHarness, CODEX_ENABLED } from '../services/codexHarness.js';
import { resolveCodexProvider, ensureWorkspace, removeWorkspace } from '../services/codexProvider.js';

const router = Router();

/** threadId → last turn id (in-memory). */
const threadTurns = new Map<string, string>();

const APPROVAL_DECISIONS = new Set([
  'accept', 'acceptForSession', 'decline', 'cancel',
  'acceptWithExecpolicyAmendment', 'applyNetworkPolicyAmendment',
]);

function requireThreadOwner(req: any, threadId: string) {
  if (!codexHarness.isThreadOwner(threadId, req.userId ?? null)) {
    throw new NotFound('Codex thread not found');
  }
}

/** Map an app-server notification to a client-visible SSE event, if any. */
function mapNotification(method: string, params: any): { event: string; data: any } | null {
  switch (method) {
    case 'turn/started':
      return { event: 'codex_turn_started', data: { turnId: params.turn?.id ?? params.turnId, status: params.turn?.status } };
    case 'thread/status/changed':
      return { event: 'codex_thread_status', data: { threadId: params.threadId, status: params.status } };
    case 'item/agentMessage/delta':
      return { event: 'codex_delta', data: { itemId: params.itemId, delta: params.delta ?? '' } };
    case 'item/reasoning/textDelta':
    case 'item/reasoning/summaryTextDelta':
      return { event: 'codex_reasoning', data: { itemId: params.itemId, delta: params.delta ?? '' } };
    case 'item/commandExecution/outputDelta':
    case 'item/fileChange/outputDelta':
      return { event: 'codex_tool_output', data: { itemId: params.itemId, delta: params.delta ?? '' } };
    case 'item/started': {
      const it = params.item || {};
      switch (it.type) {
        case 'commandExecution':
          return { event: 'codex_tool', data: { itemId: it.id, type: 'commandExecution', command: it.command, cwd: it.cwd, status: it.status } };
        case 'fileChange':
          return { event: 'codex_tool', data: { itemId: it.id, type: 'fileChange', changes: it.changes, status: it.status } };
        case 'mcpToolCall':
          return { event: 'codex_tool', data: { itemId: it.id, type: 'mcpToolCall', name: it.name, status: it.status } };
        case 'webSearch':
          return { event: 'codex_tool', data: { itemId: it.id, type: 'webSearch', query: it.query, status: it.status } };
        case 'agentMessage':
          return { event: 'codex_item_started', data: { itemId: it.id, type: 'agentMessage', phase: it.phase } };
        case 'reasoning':
          return { event: 'codex_item_started', data: { itemId: it.id, type: 'reasoning', summary: it.summary } };
        default:
          return { event: 'codex_item_started', data: { itemId: it.id, type: it.type } };
      }
    }
    case 'item/completed': {
      const it = params.item || {};
      return { event: 'codex_item_completed', data: { itemId: it.id, type: it.type, status: it.status, text: it.text ?? null } };
    }
    case 'item/commandExecution/requestApproval':
      return {
        event: 'codex_approval',
        data: {
          requestId: params.itemId ?? params.requestId,
          kind: 'commandExecution',
          itemId: params.itemId,
          threadId: params.threadId,
          turnId: params.turnId,
          reason: params.reason ?? null,
          command: params.command ?? null,
          cwd: params.cwd ?? null,
          environmentId: params.environmentId ?? null,
          availableDecisions: params.availableDecisions ?? ['accept', 'decline'],
        },
      };
    case 'item/fileChange/requestApproval':
      return {
        event: 'codex_approval',
        data: {
          requestId: params.itemId ?? params.requestId,
          kind: 'fileChange',
          itemId: params.itemId,
          threadId: params.threadId,
          turnId: params.turnId,
          reason: params.reason ?? null,
          availableDecisions: ['accept', 'decline'],
        },
      };
    case 'thread/tokenUsage/updated':
      return { event: 'codex_usage', data: { threadId: params.threadId, usage: params.usage ?? params.tokenUsage ?? null } };
    default:
      return null;
  }
}

router.get('/capabilities', requireAuth, async (req, res) => {
  const { resolveCodexProvider } = await import('../services/codexProvider.js');
  const provider = await resolveCodexProvider(req.userId ?? null);
  res.json({
    enabled: CODEX_ENABLED,
    providerMode: provider.mode,
    model: provider.model,
  });
});

router.post('/threads', requireAuth, async (req, res, next) => {
  try {
    const { model } = req.body || {};
    await codexHarness.ensureStarted();

    const provider = await resolveCodexProvider(req.userId ?? null);
    const threadId = randomUUID();
    const cwd = ensureWorkspace(req.userId, threadId);

    const params: Record<string, unknown> = {
      cwd,
      // Fixed, safe defaults — never client-controlled.
      approvalPolicy: 'on-request',
      sandbox: 'workspace-write',
      ephemeral: true,
      sessionStartSource: 'startup',
    };
    if (provider.config) params.config = provider.config;
    if (model) {
      params.model = String(model);
    } else if (provider.model) {
      params.model = provider.model;
    }
    if (!params.model) delete params.model;

    const result = await codexHarness.request('thread/start', params);
    const thread = result?.thread;
    if (!thread?.id) throw new Error('thread/start returned no thread id');

    codexHarness.claimThread(thread.id, req.userId ?? null, String(params.model || provider.model || ''));
    res.status(201).json({
      threadId: thread.id,
      cwd,
      model: thread.model ?? params.model ?? null,
      modelProvider: thread.modelProvider ?? provider.mode,
    });
  } catch (err) { next(err); }
});

router.get('/threads/:id', requireAuth, async (req, res, next) => {
  try {
    const threadId = String(req.params.id);
    requireThreadOwner(req, threadId);
    const approvals = codexHarness.listApprovals(threadId).map((a) => ({
      requestId: a.rpcId,
      kind: a.params.kind ?? a.method,
      itemId: a.itemId,
      reason: a.params.reason ?? null,
      command: a.params.command ?? null,
      cwd: a.params.cwd ?? null,
    }));
    res.json({
      threadId,
      turnId: threadTurns.get(threadId) ?? null,
      pendingApprovals: approvals.length,
    });
  } catch (err) { next(err); }
});

router.post('/threads/:id/turns', requireAuth, async (req, res, next) => {
  let unsub: (() => void) | null = null;
  let done = false;
  let keepalive: { stop: () => void } | null = null;

  const finish = (res: any) => {
    if (done) return;
    done = true;
    if (keepalive) { try { keepalive.stop(); } catch { /* ignore */ } }
    if (unsub) { try { unsub(); } catch { /* ignore */ } }
    if (!res.writableEnded && !res.destroyed) res.end();
    try { trackSseConnection(req.app, -1); } catch { /* ignore */ }
  };

  try {
    const threadId = String(req.params.id);
    requireThreadOwner(req, threadId);

    const input = String((req.body || {}).input ?? '').trim();
    if (!input) throw new BadRequest('input is required');
    if (input.length > 20000) throw new BadRequest('input too long');

    // Hard prerequisites first — if these fail, answer with JSON before
    // the stream headers are written (an SSE frame would be unparseable).
    await codexHarness.ensureStarted();

    if (!writeSseHeaders(res)) return;
    trackSseConnection(req.app, +1);
    keepalive = startSseKeepalive(res, { intervalMs: 10_000 });

    // Subscribe before starting the turn so we never miss a notification.
    unsub = codexHarness.onThreadEvent(threadId, (method, params, meta) => {
      if (done || res.writableEnded || res.destroyed) return;
      try {
        if (method === 'turn/completed') {
          const turn: any = params.turn ?? {};
          const status: unknown = turn.status;
          writeSseEvent(res, 'codex_turn_completed', { turnId: params.turnId ?? turn.id, status, error: turn.error ?? null });
          writeSseEvent(res, 'codex_done', {});
          finish(res);
          return;
        }
        const mapped = mapNotification(method, params);
        if (mapped) {
          if (mapped.event === 'codex_approval' && meta?.rpcId != null) {
            mapped.data.requestId = meta.rpcId;
          }
          writeSseEvent(res, mapped.event, mapped.data);
        }
      } catch { /* socket gone */ }
    });

    // Replay any approvals that are still pending (e.g. this SSE stream
    // reconnected while a command waited for a decision).
    for (const a of codexHarness.listApprovals(threadId)) {
      if (done || res.writableEnded || res.destroyed) break;
      const mapped = mapNotification(a.method, a.params);
      if (mapped) {
        mapped.data.requestId = a.rpcId;
        writeSseEvent(res, mapped.event, mapped.data);
      }
    }

    req.on('close', () => finish(res));

    writeSseEvent(res, 'codex_init', { threadId });
    const turnResult = await codexHarness.request('turn/start', {
      threadId,
      clientUserMessageId: randomUUID(),
      input: [{ type: 'text', text: input }],
    });
    const turnId = turnResult?.turn?.id;
    if (turnId) threadTurns.set(threadId, turnId);
  } catch (err) {
    // Before headers were written → a normal JSON error response.
    if (!res.headersSent) {
      const status = (err as any).status && (err as any).status >= 400 && (err as any).status < 600
        ? (err as any).status
        : 500;
      res.status(status).json({ code: (err as any).code || 'CODEX_ERROR', message: (err as Error).message });
      return;
    }
    try {
      writeSseEvent(res, 'codex_error', { message: (err as Error).message });
    } catch { /* ignore */ }
    if (keepalive) { try { keepalive.stop(); } catch { /* ignore */ } }
    if (unsub) { try { unsub(); } catch { /* ignore */ } }
    if (!res.writableEnded && !res.destroyed) res.end();
    try { trackSseConnection(req.app, -1); } catch { /* ignore */ }
  }
});

router.post('/threads/:id/approvals', requireAuth, async (req, res, next) => {
  try {
    const threadId = String(req.params.id);
    requireThreadOwner(req, threadId);
    const { requestId, decision } = req.body || {};
    if (requestId == null || typeof decision !== 'string') {
      throw new BadRequest('requestId and decision are required');
    }
    const normalized = decision.trim();
    if (!APPROVAL_DECISIONS.has(normalized)) {
      throw new BadRequest(`invalid decision; expected one of ${[...APPROVAL_DECISIONS].join(', ')}`);
    }
    const ok = codexHarness.respondToRequest(requestId, { decision: normalized });
    if (!ok) throw new NotFound('Approval request is no longer pending');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/threads/:id/interrupt', requireAuth, async (req, res, next) => {
  try {
    const threadId = String(req.params.id);
    requireThreadOwner(req, threadId);
    const turnId = String((req.body || {}).turnId ?? threadTurns.get(threadId) ?? '');
    if (!turnId) throw new BadRequest('No active turn to interrupt');
    await codexHarness.request('turn/interrupt', { threadId, turnId });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/threads/:id', requireAuth, async (req, res, next) => {
  try {
    const threadId = String(req.params.id);
    requireThreadOwner(req, threadId);
    try {
      await codexHarness.request('thread/delete', { threadId });
    } catch (err) {
      console.warn('[codex] thread/delete failed:', (err as Error).message);
    }
    codexHarness.releaseThread(threadId);
    threadTurns.delete(threadId);
    removeWorkspace(req.userId, threadId);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
