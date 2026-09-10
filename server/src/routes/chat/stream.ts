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

import type { Router } from 'express';

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
      if (sessionIdFromQuery) {
        await requireOwnedSessionAfterSave(sessionIdFromQuery, req.userId!);
      }
      const projectIdFromBody = typeof req.body?.projectId === 'string' ? req.body.projectId : null;

      /* M1 async — optional detached-turn binding. The turn must belong
       * to the caller; otherwise the run proceeds unbound (legacy path)
       * rather than leaking another user's turn stream. */
      let turnId: string | null = null;
      const rawTurnId = req.query.turnId ?? req.body?.turnId;
      if (typeof rawTurnId === 'string' && rawTurnId) {
        if (!isUuid(rawTurnId)) throw new NotFound('Chat turn not found');
        const [owned] = await getDb().select({ id: chatTurns.id })
          .from(chatTurns)
          .where(and(eq(chatTurns.id, rawTurnId), eq(chatTurns.userId, req.userId!)))
          .limit(1);
        if (!owned) throw new NotFound('Chat turn not found');
        turnId = owned.id;
      }

      const prep = await prepareChatRequest(req, res);
      if (!prep.ok) return;

      await runChatStreamPipeline({
        req: req as typeof req & { userId?: string },
        res,
        prep: prep as typeof prep & { ok: true },
        sessionIdFromQuery,
        projectIdFromBody,
        turnId,
      });
    } catch (err) { next(err); }
  });
}
