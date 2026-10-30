/**
 * POST /api/chat/stream — SSE streaming chat endpoint (route shell).
 *
 * M2 of the LobeHub-alignment plan moved the handler body into the
 * pipeline under `routes/chat/pipeline/`:
 *
 *   pipeline/runChatStreamPipeline.ts — SSE lifecycle + tool-calling
 *     loop + finalisation (the orchestration stage list is documented
 *     there).
 *   pipeline/toolContext.ts           — turn policy + registry.
 *   pipeline/toolExecutors.ts         — one executor per callable tool.
 *   pipeline/toolFeedback.ts          — model-facing result content.
 *   pipeline/sseEmitter.ts            — SSE frame writing.
 *
 * This file keeps only the route concerns that Express owns: middleware
 * gating, session-ownership binding, and request preparation.
 */

import { requireAuth } from '../../middleware/auth.js';
import { resourceScope } from '../../middleware/scopes.js';
import { parseChatSessionId, requireOwnedSession } from '../../lib/sessionOwnership.js';
import { isUuid } from '../../lib/validate.js';
import { Conflict, NotFound } from '../../lib/errors.js';
import { getDb } from '../../db/index.js';
import { chatTurns } from '../../db/schema/index.js';
import { and, eq } from 'drizzle-orm';
import {
  chatRateLimitDispatch,
  endSseWithError,
  prepareChatRequest,
  writeSsePrime,
  ChatPayloadSchema,
} from './helpers.js';
import { runChatStreamPipeline } from './pipeline/runChatStreamPipeline.js';
import { createStreamToolContext } from './pipeline/toolContext.js';
import { createChatTurn, withChatTurnExecution } from '../../services/core/chatTurns.js';
import { writeSseEvent } from '../../lib/sse.js';
import { createChatTiming, type ChatTiming } from '../../lib/chatTiming.js';

import type { Request, Router } from 'express';

/* A Begin flow normally awaits POST /api/sessions, but a save triggered by
 * another tab or a mobile reconnect can still race the first stream request.
 * Give that committed row a short window to become visible, while preserving
 * the session ID as an authority-bearing binding. Falling back to an
 * unbound/project workspace here would violate per-session isolation. */
async function requireOwnedSessionAfterSave(sessionId: string, userId: string) {
  const attempts = 4;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await requireOwnedSession(getDb(), sessionId, userId);
    } catch (err: unknown) {
      const status = err && typeof err === 'object'
        ? (err as { status?: unknown }).status
        : undefined;
      if (status !== 404 || attempt === attempts - 1) throw err;
      await new Promise<void>((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
  throw new Error('Session ownership check did not complete');
}

/**
 * Register POST /stream on the supplied router.
 *
 * @param {import('express').Router} router
 */
export function registerStreamRoute(router: Router) {
  /* P_stream-auth — the streaming route previously had no auth
   * middleware, leaving `req.userId` undefined when an unauthenticated
   * caller (or a mis-wired client) hit /stream. The downstream
   * code_interpreter tool then tried to insert into the
   * `executions` table with userId=null, which fails the
   * `user_id NOT NULL REFERENCES users(id)` constraint and surfaces
   * to the user as a confusing "Failed query: insert into executions…"
   * with no actionable error. Mount `requireAuth` here for parity
   * with the sync POST / route in chat.js — both endpoints spend
   * the user's LLM quota and write per-user rows, so both must be
   * gated identically. */
  router.post('/stream', (_req, res, next) => {
    res.locals.chatTiming = createChatTiming();
    next();
  }, requireAuth, resourceScope('chat'), chatRateLimitDispatch, async (req, res, next) => {
    const timing = res.locals.chatTiming as ChatTiming;
    timing.mark('authenticated');
    try {
      const sessionIdFromQuery = parseChatSessionId(req.query.sessionId ?? req.body?.sessionId);
      const projectIdFromBody = typeof req.body?.projectId === 'string' ? req.body.projectId : null;

      /* P_ttfb-prime-first — validate the body schema BEFORE we
         commit the SSE response. prepareChatRequest() does its own
         parse-and-400 path, but a 400 is no longer possible once the
         status line is out: writeSsePrime below sets it to 200 + SSE
         headers and Express will not let us change it. A bad body
         therefore gets the legacy JSON 400 here so the client gets a
         structured error, while every error AFTER the prime is
         surfaced as an SSE `event: error` frame. */
      try {
        ChatPayloadSchema.parse(req.body);
      } catch (err) {
        res.status(400).json({ code: 'INVALID_REQUEST', message: (err as Error).message });
        return;
      }

      /* P_ttfb-prime-first — write SSE status + headers + 32 KB
         prime NOW, before the session-ownership DB round-trip and
         before the provider/RAG/memory prelude start. The browser
         sees a 200 the instant the request lands, and EdgeOne's
         first-chunk buffer is already overflowed so a fast LLM
         answer still streams progressively instead of arriving in
         one shot at the end. If anything below throws after this
         point, endSseWithError writes a single `event: error`
         frame so the client gets a structured failure rather than a
         half-open connection. */
      const ssePrimed = writeSsePrime(res);

      const ownershipPromise: Promise<unknown> = sessionIdFromQuery
        ? requireOwnedSessionAfterSave(sessionIdFromQuery, req.userId!)
        : Promise.resolve(null);
      const turnPromise = resolveTurnBinding(req, sessionIdFromQuery, ownershipPromise);
      const [, turnId] = await Promise.all([ownershipPromise, turnPromise]);
      timing.mark('bound');

      // Claim before preparation: RAG/provider prelude can itself call an
      // upstream model. Losing retries must not perform that work either.
      try {
        await withChatTurnExecution(req.userId!, turnId, async (executionSignal) => {
          timing.mark('claimed');
          const bodyMode = (req.body as { mode?: unknown } | undefined)?.mode;
          const toolCtxPromise = createStreamToolContext(
            req as typeof req & { userId?: string }, bodyMode === 'tutor' ? 'tutor' : 'chat',
          );
          toolCtxPromise.catch(() => {});
          const prep = await prepareChatRequest(req, res, { signal: executionSignal });
          timing.mark('prepared');
          if (executionSignal.aborted) throw new Error('Turn execution interrupted during preparation');
          await runChatStreamPipeline({
            req: req as typeof req & { userId?: string }, res, prep,
            sessionIdFromQuery, projectIdFromBody, turnId, toolCtxPromise, ssePrimed,
            executionSignal, executionClaimed: true, timing,
          });
        });
      } catch (err) {
        // A retry that only supplied clientTurn.id still needs the durable
        // server ID to reconnect after losing its execution claim.
        if (err instanceof Conflict) writeSseEvent(res, 'turn_bound', { turnId });
        throw err;
      }
    } catch (err) {
      if (res.headersSent) endSseWithError(res, err);
      else next(err);
    }
  });
}

/* M1 async — optional detached-turn binding. Two shapes:
 *   turnId        — the client already created the turn (POST /api/chat-turns).
 *                   It must belong to the caller.
 *   clientTurnId  — P_prep-parallel: create-or-get the turn here instead, which
 *                   saves the client a full round-trip before the stream can
 *                   start. Idempotent on (user, clientTurnId), exactly like the
 *                   standalone endpoint, so a retried request re-binds the same
 *                   turn rather than opening a second one.
 * A turn is only created after the session-ownership gate passed. */
async function resolveTurnBinding(
  req: Request,
  sessionId: string | null,
  ownership: Promise<unknown>,
): Promise<string> {
  const rawTurnId = req.query.turnId ?? req.body?.turnId;
  if (typeof rawTurnId === 'string' && rawTurnId) {
    if (!isUuid(rawTurnId)) throw new NotFound('Chat turn not found');
    const [owned] = await getDb().select({ id: chatTurns.id, sessionId: chatTurns.sessionId })
      .from(chatTurns)
      .where(and(eq(chatTurns.id, rawTurnId), eq(chatTurns.userId, req.userId!)))
      .limit(1);
    if (!owned || owned.sessionId !== sessionId) throw new NotFound('Chat turn not found for this session');
    return owned.id;
  }
  const clientTurn = req.body?.clientTurn;
  const providedTurnId = clientTurn && typeof clientTurn.id === 'string' ? clientTurn.id.trim() : '';
  const effectiveTurnId = (providedTurnId && providedTurnId.length <= 200)
    ? providedTurnId
    : `srv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  await ownership;
  const created = await createChatTurn({
    userId: req.userId!,
    clientTurnId: effectiveTurnId,
    sessionId,
    model: null,
    inputSnapshot: clientTurn?.input ?? null,
  });
  return created.turn.id;
}
