/**
 * SSE priming and typed error frames for the chat stream.
 *
 * The 32 KB prime defeats intermediary first-chunk buffers; the error frame
 * keeps a post-header failure on the SSE protocol instead of emitting JSON.
 */
import { ApiError } from '../../../lib/errors.js';
import { buildSseErrorFrame } from '../../../lib/sseErrorFrame.js';
import type { ErrorLocale } from '../../../lib/errorMessages.js';

/* ─────────────────────────────────────────────────────────────────
   SSE prime
   ───────────────────────────────────────────────────────────────── */

/* SSE_PRIME — 32 KB comment-padding frame written immediately after the
   response headers to flush first-chunk buffers that sit between Node and
   the browser:

   • EdgeOne CDN applies a first-chunk buffer (typically ~8 KB, but
     production configurations may use larger thresholds or per-chunk
     minimum sizes). A short LLM answer fits entirely inside that buffer,
     so the CDN holds the whole response until the stream ends and then
     forwards it in one shot — the user sees a fully-formed bubble with
     no progressive streaming and no Thinking pill.
   • Safari's fetch ReadableStream coalesces the first ~1 KB of body data
     before releasing the first chunk to reader.read(), so even on a direct
     origin connection Safari paints nothing until enough bytes accumulate.

   8 bytes (the previous `: open\n\n`) is far below both thresholds, so the
   priming never actually flushed either buffer. 32 KB provides ~4× margin
   over the assumed 8 KB threshold — enough to overflow EdgeOne's default
   buffer, Safari's 1 KB threshold, and any operator-tuned larger buffer,
   while keeping the priming overhead low enough that slow connections
   (3G, mobile) don't add seconds of latency before the first real data
   byte. The chat stream route and the built-in minimax proxy both reuse
   this single constant; do not redefine it locally.

   Comment lines (leading `:`) are valid per the SSE spec and ignored by
   every parser, including ours (the frontend skips frames that contain no
   `data:` line). Split into 33 short lines so no single line exceeds ~1 KB,
   staying under any intermediary line-length limit. Precomputed once at
   module load — zero per-request cost. */
export const SSE_PRIME = ': open\n' + Array.from({ length: 32 }, () => ':' + 'o'.repeat(1022)).join('\n') + '\n\n';

/* P_ttfb-prime-first — write the SSE status line + headers + 32 KB
   prime comment in one call. The route shell invokes this BEFORE
   awaiting the session-ownership check so the browser sees a 200 /
   text-event-stream response the instant the request lands, instead
   of waiting for ownership + prep + turn binding to settle. Without
   the early prime, Express buffers the headers until the first body
   byte arrives from the LLM (a few hundred ms on a fast network),
   and EdgeOne's ~8 KB first-chunk buffer swallows short LLM answers
   whole — the client gets the full reply in one shot at the end and
   never sees a Thinking pill. Callers that already opened an SSE
   response should pass nothing here; the helper bails on the second
   writeHead so `runChatStreamPipeline` is still safe to call from
   tests that drive it directly. */
export function writeSsePrime(res: import('express').Response): boolean {
  if (res.headersSent) return false;
  try {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();
    res.write(SSE_PRIME);
    try { (res as { flush?: () => void }).flush?.(); } catch { /* best effort */ }
    return true;
  } catch {
    /* socket already closed — the route's req.on('close') guard
       handles cleanup; nothing more we can do. */
    return false;
  }
}

/* P_ttfb-sse-error — short-circuit the SSE response once the route
   has already primed it but a later step (ownership, prep, turn
   binding) threw. The client sees a single `event: error` frame
   followed by [DONE] and the socket closes; status stays 200 because
   the response already committed. Errors BEFORE writeSsePrime should
   still use the legacy `res.status(...).json(...)` path — this helper
   assumes headers are out. */
export function endSseWithError(res: import('express').Response, err: unknown, locale?: ErrorLocale): void {
  /* P_sse-error-contract — the error frame carries the same machine-readable
     fields as the JSON error path (status / code / retryable), so the browser
     can tell a deterministic failure (quota, bad key, unsupported mode) from
     a transient one and does not replay a whole turn for a request that
     cannot succeed. buildSseErrorFrame also guarantees that a raw upstream
     provider body is never forwarded to the client. */
  const details = buildSseErrorFrame(err, locale ? { locale } : {});
  const safe = (() => {
    try { return JSON.stringify(details); } catch { return '{}'; }
  })();
  try {
    if (!res.headersSent) {
      res.status(details.status ?? 500).json({
        code: details.code,
        message: details.message,
        ...(typeof details.retryable === 'boolean' ? { retryable: details.retryable } : {}),
      });
      return;
    }
    res.write(`event: error\ndata: ${safe}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  } catch { /* socket closed */ }
}

/* ─────────────────────────────────────────────────────────────────
   Shared request prep — both / and /stream call this.
   ───────────────────────────────────────────────────────────────── */

/* Run the canonical prelude that every chat endpoint shares:
 *   1. Zod-validate the request body.
 *   2. Initialize the server-owned session prompt once, or load its snapshot.
 *   3. Attach changing lesson/recall context outside that stable prefix.
 *   4. Sanitise extra_body (whitelist-only keys).
 *   5. Resolve the user's active LLM provider + decrypted key.
 *   6. Enforce the per-tier monthly Beagle quota for built-in keys.
 *   7. Reject image content when the active provider is not marked as
 *      multimodal, then apply the legacy transform for any non-image parts.
 *
 * Returns { ok: true, payload } on success and REJECTS with a typed ApiError
 * on every failure. The rejection is deliberate: the SSE route commits a
 * 200 + text/event-stream before the prelude runs, so a failure that wrote
 * `res.status(...).json(...)` here would land a JSON body on an SSE stream
 * and then degrade into an opaque "Request preparation failed" 500 — which
 * the browser then replays as a whole turn. A typed rejection lets the SSE
 * path emit a structured `event: error` frame with the real status/code and
 * the JSON path return the same status through the error middleware. */
/** RN-6 — the server-owned learning-mode block for one tutor turn, with the
 * learner's focus (a concept, a mistake) attached as untrusted data. */

