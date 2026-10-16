/**
 * Chat Turns HTTP surface (M1).
 *
 * POST /api/chat-turns        — create a turn idempotently (clientTurnId).
 * GET  /api/chat-turns        — list recent turns (optional ?sessionId=).
 * GET  /api/chat-turns/:id    — fetch one turn.
 * GET  /api/chat-turns/:id/events?after= — SSE replay + live tail.
 * POST /api/chat-turns/:id/interrupt     — mark interrupted.
 *
 * Closing the events stream only unsubscribes; the worker (M2) keeps
 * running detached, and the client re-attaches with ?after=lastSeq.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { resourceScope } from '../middleware/scopes.js';
import { BadRequest } from '../lib/errors.js';
import { startSseKeepalive, trackSseConnection, writeSseEvent, writeSseHeaders } from '../lib/sse.js';
import {
  createChatTurn,
  getChatTurn,
  interruptChatTurn,
  listChatTurnEvents,
  listChatTurns,
  subscribeToChatTurn,
  type ChatTurnEvent,
} from '../services/chatTurns.js';

const router = Router();

router.use(requireAuth, resourceScope('chat'));

function publicTurn(turn: any) {
  if (!turn) return null;
  return {
    id: turn.id,
    sessionId: turn.sessionId,
    clientTurnId: turn.clientTurnId,
    status: turn.status,
    model: turn.model,
    generation: turn.generation,
    fullText: turn.fullText,
    fullReasoning: turn.fullReasoning,
    toolCalls: turn.toolCalls,
    usage: turn.usage,
    error: turn.error,
    startedAt: turn.startedAt,
    completedAt: turn.completedAt,
    updatedAt: turn.updatedAt,
  };
}

function sendTurnEvent(res: any, event: ChatTurnEvent) {
  writeSseEvent(res, 'turn_event', event);
  // Chat-protocol aliases so the existing SSE consumer can reuse its
  // per-event routing without knowing about the turn envelope.
  if (event.event === 'content' && event.data && typeof event.data.delta === 'string') {
    writeSseData(res, { delta: event.data.delta });
  } else if (event.event === 'reasoning' && event.data && typeof event.data.delta === 'string') {
    writeSseData(res, { reasoning: event.data.delta });
  } else {
    writeSseEvent(res, event.event, { turnId: event.turnId, sequence: event.sequence, ...event.data });
  }
}

function writeSseData(res: any, data: unknown) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  if (res.writableEnded || res.destroyed) return false;
  return res.write(`data: ${payload}\n\n`);
}

router.get('/', async (req, res, next) => {
  try {
    const rows = await listChatTurns(req.userId!, {
      sessionId: typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined,
      limit: typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined,
    });
    res.json({ turns: rows.map(publicTurn) });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    const clientTurnId =
      typeof body.clientTurnId === 'string' && body.clientTurnId.trim()
        ? body.clientTurnId.trim()
        : typeof req.headers['x-idempotency-key'] === 'string'
          ? String(req.headers['x-idempotency-key']).trim()
          : '';
    if (!clientTurnId) throw new BadRequest('clientTurnId is required');
    const created = await createChatTurn({
      userId: req.userId!,
      clientTurnId,
      sessionId: body.sessionId ?? null,
      model: body.model ?? null,
      inputSnapshot: body.input ?? null,
    });
    res.status(created.created ? 201 : 200).json({
      turn: publicTurn(created.turn),
      created: created.created,
      capabilities: { resumable: true },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const turn = await getChatTurn(req.userId!, String(req.params.id));
    const events = await listChatTurnEvents(req.userId!, String(req.params.id), 0, 200);
    res.json({ turn: publicTurn(turn), events });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/events', async (req, res, next) => {
  const turnId = String(req.params.id);
  let cursor = Number(req.query.after ?? 0);
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > 2_147_483_647) {
    return next(new BadRequest('after must be a non-negative 32-bit integer'));
  }
  let unsubscribe: (() => void) | null = null;
  let keepalive: { stop: () => void } | null = null;
  let poll: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  let tracked = false;
  let draining = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    unsubscribe?.();
    keepalive?.stop();
    if (poll) clearInterval(poll);
    if (tracked) trackSseConnection(req.app, -1);
  };
  res.once('close', cleanup);

  // Read the durable log for both replay and live delivery. Local events
  // only wake this reader; the poll catches writes from other processes,
  // and avoids depending on a lossy notification channel for correctness.
  const drain = async () => {
    if (closed || draining) return;
    draining = true;
    try {
      while (!closed) {
        const rows = await listChatTurnEvents(req.userId!, turnId, cursor, 500);
        for (const row of rows) {
          if (closed) break;
          sendTurnEvent(res, row);
          cursor = row.sequence;
        }
        if (rows.length < 500) break;
      }
    } finally { draining = false; }
  };
  const wake = () => {
    void drain().catch((err) => {
      console.warn('[chat-turns] event tail read failed:', (err as Error).message);
    });
  };
  try {
    await getChatTurn(req.userId!, turnId);
    if (closed || !writeSseHeaders(res)) { cleanup(); return; }
    trackSseConnection(req.app, +1);
    tracked = true;
    keepalive = startSseKeepalive(res, { intervalMs: 10_000 });
    unsubscribe = subscribeToChatTurn(turnId, wake);
    poll = setInterval(wake, 1000);
    poll.unref();
    await drain();
  } catch (err) {
    cleanup();
    if (!res.headersSent) next(err);
    else if (!res.writableEnded) res.end();
  }
});

router.post('/:id/interrupt', async (req, res, next) => {
  try {
    const result = await interruptChatTurn(req.userId!, String(req.params.id));
    res.json({ turn: publicTurn(result.turn), idempotent: result.idempotent });
  } catch (err) {
    next(err);
  }
});

export default router;
