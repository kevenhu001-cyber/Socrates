/**
 * sse.js — helpers for SSE (text/event-stream) responses.
 *
 * Provides:
 *   - writeSseHeaders(res): set Content-Type + cache headers + flush
 *   - writeSseEvent(res, event, data): single named-event frame
 *   - writeSseData(res, data): default-event data frame
 *   - writeSseComment(res, text): SSE comment line (`: text\n\n`).
 *     The browser's EventSource ignores these; they exist to keep the
 *     TCP socket warm and to defeat reverse-proxy idle timeouts.
 *   - startSseKeepalive(res, opts): periodic `:keepalive` pings with
 *     automatic teardown on response close.
 *   - trackSseConnection(app, delta): maintenance hook to maintain an
 *     active-connection counter on `app.locals.sseCount`. Optional —
 *     callers can opt in or ignore.
 *
 * Why a single helper:
 *   - The chat SSE stream (reasoning models) can idle for 60-90 s
 *     between tokens. nginx (and EdgeOne / Cloudflare) commonly kill
 *     idle upstream connections after 60 s. A periodic comment frame
 *     keeps the socket warm and lets the proxy see forward progress.
 *   - Centralising the format avoids subtle per-route drift (the chat
 *     route was already writing `: keepalive` but the execution SSE
 *     endpoint and any future SSE route would have to repeat the
 *     same boilerplate).
 */

import type { Response, Application } from 'express';

const DEFAULT_KEEPALIVE_MS = 15_000;
const COMMENT_PREFIX = ':';

/**
 * Options for {@link startSseKeepalive}. The declared fields are the
 * ones actually read by the implementation; the index signature keeps
 * the door open for forward-compatible extra options without forcing
 * every caller to know about them.
 */
interface SseKeepaliveOpts {
  intervalMs?: number;
  text?: string;
  [key: string]: unknown;
}

/**
 * Write the standard SSE response headers and flush them immediately.
 * Returns true if headers flushed, false if the socket was already
 * closed (caller should bail out).
 */
export function writeSseHeaders(res: Response) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders?.();
  return !res.writableEnded && !res.destroyed;
}

/**
 * Write a single SSE event frame.
 *
 *   event: <name>\n
 *   data: <data>\n
 *   \n
 *
 * `data` may be a string (written verbatim) or any JSON-serialisable
 * value (will be JSON.stringify'd). Returns false if the socket is
 * no longer writable so callers can abort cleanly.
 */
export function writeSseEvent(res: Response, event: string, data: unknown) {
  if (res.writableEnded || res.destroyed) return false;
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  return res.write(`event: ${event}\ndata: ${payload}\n\n`);
}

/**
 * Write a default-event data frame.
 * Equivalent to `writeSseEvent(res, null, data)` but omits the
 * `event:` line. Convention for chat-style deltas.
 */
export function writeSseData(res: Response, data: unknown) {
  if (res.writableEnded || res.destroyed) return false;
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  return res.write(`data: ${payload}\n\n`);
}

/**
 * Write a single SSE comment frame. The browser's EventSource ignores
 * these. Used to keep the TCP socket warm across long reasoning-model
 * silences (which can exceed reverse-proxy idle timeouts).
 */
export function writeSseComment(res: Response, text: string) {
  if (res.writableEnded || res.destroyed) return false;
  return res.write(`${COMMENT_PREFIX} ${text}\n\n`);
}

/**
 * Start a periodic SSE keepalive. The first comment is emitted
 * immediately so even a very fast client disconnect after the headers
 * still observes a healthy stream. Subsequent comments fire every
 * `intervalMs` (default 15 s) — comfortably below nginx's 60 s default
 * upstream-idle timeout, and short enough that a wedged proxy is
 * detected within one interval rather than one minute.
 *
 * The interval is cleared automatically when the response closes
 * (`close` / `finish` / `error`), so callers do not need to track the
 * timer themselves.
 *
 * @param {ServerResponse} res
 * @param {object} [opts]
 * @param {number} [opts.intervalMs=15000]
 * @param {string} [opts.text='keepalive']
 * @returns {{ stop: () => void, intervalMs: number }}
 */
export function startSseKeepalive(res: Response, opts: SseKeepaliveOpts = {}) {
  /* Floor: 250 ms. Anything shorter risks a tight write loop if a
     buggy caller passes `intervalMs: 0` and the comment write ever
     becomes non-trivial. 250 ms is still ≪ nginx's 60 s default
     upstream-idle timeout, so the keepalive keeps the socket warm
     with plenty of margin. The floor also keeps integration tests
     fast — a 1 s floor would force every test to wait >1 s to catch
     a single periodic tick. */
  const intervalMs = Math.max(250, opts.intervalMs || DEFAULT_KEEPALIVE_MS);
  const text = opts.text || 'keepalive';
  let stopped = false;

  // Emit one immediately so a slow first chunk from upstream doesn't
  // look like a hang to the reverse proxy.
  try {
    writeSseComment(res, text);
  } catch {
    /* socket may already be closed — that's fine, the timers below
       will detect it via the close listener. */
  }

  const timer = setInterval(() => {
    if (stopped) return;
    if (res.writableEnded || res.destroyed) {
      stop();
      return;
    }
    try {
      const ok = writeSseComment(res, text);
      if (!ok) stop();
    } catch {
      stop();
    }
  }, intervalMs);
  // Don't keep the event loop alive solely for keepalive timers.
  if (typeof timer.unref === 'function') timer.unref();

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
  };

  res.on('close', stop);
  res.on('finish', stop);
  res.on('error', stop);

  return { stop, intervalMs };
}

/**
 * Maintain an active-SSE-connection counter on `app.locals.sseCount`.
 * The metrics endpoint (see app.js) reads this counter to surface
 * "active streams" in its /api/_internal/metrics payload.
 *
 * Pass +1 when an SSE route begins streaming, -1 when it closes.
 * Idempotent if you forget the closing delta — the server process
 * exiting will just leak a single number that resets next boot.
 */
export function trackSseConnection(app: Application, delta: unknown) {
  if (!app || !app.locals) return;
  const cur = Number.isFinite(app.locals.sseCount) ? app.locals.sseCount : 0;
  app.locals.sseCount = Math.max(0, cur + (delta as number));
}
