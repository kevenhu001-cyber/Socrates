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
import { NotFound } from '../../lib/errors.js';
import { getDb } from '../../db/index.js';
import { chatTurns } from '../../db/schema.js';
import { and, eq } from 'drizzle-orm';
import {
  chatRateLimitDispatch,
  prepareChatRequest,
} from './helpers.js';
import { runChatStreamPipeline } from './pipeline/runChatStreamPipeline.js';
import { createStreamToolContext } from './pipeline/toolContext.js';
import { createChatTurn } from '../../services/chatTurns.js';

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
    } catch (err: any) {
      if (err?.status !== 404 || attempt === attempts - 1) throw err;
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
  router.post('/stream', requireAuth, resourceScope('chat'), chatRateLimitDispatch, async (req, res, next) => {
    try {
      const sessionIdFromQuery = parseChatSessionId(req.query.sessionId ?? req.body?.sessionId);
      const projectIdFromBody = typeof req.body?.projectId === 'string' ? req.body.projectId : null;

      /* P_prep-parallel — the session-ownership gate, the detached-turn
         binding and the request prelude (provider, RAG, memories, …) are
         independent reads, and they used to run one after another before the
         first upstream byte. Start them together.

         The ownership gate still decides the outcome: nothing is streamed
         unless it passes, and its error wins over anything the prelude
         produced. The prelude writes its own error responses, so once
         headers are out an ownership failure can only end the request. */
      const ownershipPromise: Promise<unknown> = sessionIdFromQuery
        ? requireOwnedSessionAfterSave(sessionIdFromQuery, req.userId!)
        : Promise.resolve(null);
      const turnPromise = resolveTurnBinding(req, sessionIdFromQuery, ownershipPromise);
      /* Observed below via Promise.all; this only stops an early rejection
         (bad turnId) from being reported as unhandled while ownership is
         still pending. */
      turnPromise.catch(() => {});
      const prepPromise = ownershipPromise.then(
        () => prepareChatRequest(req, res),
        () => null,
      );
      /* P_prep-parallel — the tool context (connector snapshots +
         registry build) only needs the request mode, not the prepared
         payload, so start it here alongside ownership/turn/prep instead
         of inside the pipeline after prep settles. The connector reads
         then overlap the RAG embedding round-trip rather than queueing
         behind it on the path to the first token. The mode mirrors the
         ChatPayloadSchema default; an invalid body fails prep below and
         the orphaned promise is dropped (rejection already handled). */
      const bodyMode = (req.body as { mode?: unknown } | undefined)?.mode;
      const toolCtxPromise = createStreamToolContext(
        req as typeof req & { userId?: string },
        bodyMode === 'tutor' ? 'tutor' : 'chat',
      );
      toolCtxPromise.catch(() => {});
      /* Ownership must pass before the prelude runs, since the prelude may
         write a response of its own. Chaining it keeps that guarantee while
         the turn binding overlaps both. */
      await ownershipPromise;
      const [turnId, prep] = await Promise.all([turnPromise, prepPromise]);
      if (!prep || !prep.ok) return;

      await runChatStreamPipeline({
        req: req as typeof req & { userId?: string },
        res,
        prep: prep as typeof prep & { ok: true },
        sessionIdFromQuery,
        projectIdFromBody,
        turnId,
        toolCtxPromise,
      });
    } catch (err) { next(err); }
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
): Promise<string | null> {
  const rawTurnId = req.query.turnId ?? req.body?.turnId;
  if (typeof rawTurnId === 'string' && rawTurnId) {
    if (!isUuid(rawTurnId)) throw new NotFound('Chat turn not found');
    const [owned] = await getDb().select({ id: chatTurns.id })
      .from(chatTurns)
      .where(and(eq(chatTurns.id, rawTurnId), eq(chatTurns.userId, req.userId!)))
      .limit(1);
    if (!owned) throw new NotFound('Chat turn not found');
    return owned.id;
  }
  const clientTurn = req.body?.clientTurn;
  const providedTurnId = clientTurn && typeof clientTurn.id === 'string' ? clientTurn.id.trim() : '';
  const effectiveTurnId = (providedTurnId && providedTurnId.length <= 200)
    ? providedTurnId
    : `srv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  try { await ownership; } catch { return null; }
  try {
    const created = await createChatTurn({
      userId: req.userId!,
      clientTurnId: effectiveTurnId,
      sessionId,
      model: null,
      inputSnapshot: clientTurn?.input ?? null,
    });
    return created.turn.id;
  } catch (err) {
    /* A detached turn is a resilience feature. Failing to create one
       degrades to the legacy unbound stream, as it does on the client. */
    console.warn('[chat/stream] detached turn binding failed:', (err as Error).message);
    return null;
  }
}
