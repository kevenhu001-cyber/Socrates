/**
 * SSE response lifecycle: commit headers, prime intermediary buffers, account
 * the active connection and start the keepalive.
 */
import type { Request, Response } from 'express';
import { startSseKeepalive, trackSseConnection } from '../../../lib/sse.js';
import { SSE_PRIME } from '../prepare/sse.js';

export function startSseStream({
  res,
  app,
  ssePrimed,
}: {
  res: Response;
  app: Request['app'];
  ssePrimed?: boolean;
}): void {
  // Set SSE headers
  /* when the route shell has already primed
       the SSE response (writeSsePrime) before awaiting ownership,
       skip the pipeline's own writeHead + SSE_PRIME write. The two
       code paths converge here so direct pipeline callers (tests)
       still get a self-contained pipeline that writes headers itself. */
  if (!ssePrimed) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    /* Prime the stream BEFORE the upstream has anything to say.

         1. `res.flushHeaders()` forces Node to write the response status
            line + headers to the socket immediately. Without this, Express
            buffers the headers until the first body byte arrives from the
            LLM, which on a fast network can be a few hundred ms — the
            browser has painted the page but shows nothing yet, making the
            request look hung.

         2. EdgeOne CDN (~8 KB) and Safari's fetch ReadableStream (~1 KB)
            both apply a first-chunk buffer: they hold the start of the
            body until enough bytes accumulate, then switch to streaming
            mode. A short LLM answer fits entirely inside that buffer, so
            the client receives the whole response in one shot at the end
            — no progressive streaming, no Thinking pill.

            SSE_PRIME (32 KB of `:` comment lines, shared with the
            built-in minimax proxy) overflows both buffers so subsequent
            writes — even one-byte deltas — flow through immediately.
            Comment lines are valid per the SSE spec and ignored by every
            parser, including ours. */
    try {
      res.flushHeaders();
      res.write(SSE_PRIME);
      try {
        (res as { flush?: () => void }).flush?.();
      } catch {
        /* empty-catch: intentional — res.flush is absent on some compression stacks */
      }
    } catch {
      /* empty-catch: intentional — socket already closed; the req.on('close') guard below handles it */
    }
  }

  /* bump the active-connection counter so the
       /api/health endpoint can report how many SSE streams are open
       right now. The close handler (set below) decrements on any
       disconnect, including client aborts mid-stream. */
  trackSseConnection(app, +1);

  /* SSE keepalive — periodic `:keepalive` comment so the reverse proxy
       doesn't idle-kill the upstream while a reasoning model is
       thinking (60–120 s silences are common). The helper emits one
       comment immediately (so a slow first chunk doesn't look like a
       hang to nginx / EdgeOne) and self-cleans on res close/finish/
       error, so the explicit clearInterval(heartbeat) calls scattered
       through this route are no longer needed. */
  startSseKeepalive(res, { intervalMs: 10_000 });
}
