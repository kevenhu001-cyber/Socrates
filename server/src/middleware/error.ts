import type { Request, Response, NextFunction } from 'express';
import { ApiError } from '../lib/errors.js';
import { safeUrl } from '../lib/log.js';
import { wwwAuthenticateChallenge, OAUTH_AUTHORIZATION_ENDPOINT } from '../lib/oauthMeta.js';

/**
 * Global request timeout middleware.
 * Mounted early in the middleware chain so every route has a maximum
 * execution time. When a request times out, the middleware sends a
 * 504 response and aborts the downstream pipeline (no more middleware
 * or route handlers run).
 *
 * Two categories opt out of the deadline entirely, because their
 * responses are legitimately long-lived and the client applies no
 * deadline of its own:
 *   - SSE routes (/api/chat/stream, execution progress, …), detected by
 *     Content-Type once the response has started.
 *   - Routes that set `res.locals.timeoutMs = 0` (non-streaming LLM
 *     responses, e.g. POST /api/chat).
 * The remaining routes (DB, file I/O, web fetches, …) keep the default
 * REQUEST_TIMEOUT_MS budget as a safety net.
 */
export function timeoutMiddleware(req: Request, res: Response, next: NextFunction) {
  const DEFAULT_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '120000', 10);
  /* Cap route overrides so a misconfigured handler cannot pin a worker
   * forever; only server code (never the client) can set res.locals. */
  const MAX_TIMEOUT_MS = 600_000;
  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const fire = () => {
    timer = null;
    if (res.headersSent) {
      /* P_sse_timeout_exempt — SSE responses (chat stream, execution
       * progress, status subscribe, …) are legitimately long-lived and
       * manage their own lifecycle (optional env-gated LLM budgets in
       * llm.ts, heartbeats in lib/sse.ts). Destroying the socket at
       * 120s cut every reply longer than the global budget mid-stream;
       * the frontend's stall-retry then masked it as a flaky reconnect.
       * Detect by Content-Type instead of a path allow-list so every
       * present and future SSE route is covered automatically. */
      const ct = String(res.getHeader('Content-Type') || '');
      if (ct.includes('text/event-stream')) return;
      /* Headers already sent — we can't change the status code, but
       * destroying the socket still stops the downstream handler from
       * consuming resources indefinitely. */
      try { res.destroy(); } catch (err) { console.warn('[timeout] socket destroy failed:', (err as Error).message); }
      return;
    }
    /* P_long-llm-override — non-streaming LLM routes (POST /api/chat,
     * minimax proxy, suggestions) await the upstream for as long as the
     * model thinks, so they opt out with `res.locals.timeoutMs = 0`
     * (no deadline) or extend it with a larger value. A route sets the
     * value after this middleware has already armed the default timer,
     * so the decision is made here when the default fires. */
    const custom = Number((res.locals as Record<string, unknown>)?.timeoutMs);
    if (Number.isFinite(custom) && custom === 0) return;
    if (Number.isFinite(custom) && custom > DEFAULT_TIMEOUT_MS) {
      const allowed = Math.min(custom, MAX_TIMEOUT_MS);
      const remaining = allowed - (Date.now() - startedAt);
      if (remaining > 0) {
        timer = setTimeout(fire, remaining);
        return;
      }
    }
    res.status(504).json({
      code: 'REQUEST_TIMEOUT',
      message: 'Request timed out',
    });
  };
  timer = setTimeout(fire, DEFAULT_TIMEOUT_MS);
  res.on('finish', () => { if (timer) clearTimeout(timer); });
  res.on('close', () => { if (timer) clearTimeout(timer); });
  next();
}

/**
 * Global error-handling middleware.
 * Must have 4 parameters (err, req, res, next) for Express to treat it
 * as an error handler rather than normal middleware.
 */
export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  // P6.x — `req.id` is set by the requestId middleware mounted
  // early in app.js. Including it in the log line lets an operator
  // grep one ID and find the matching client-side console error.
  const rid = req && req.id ? req.id : 'no-id';
  // Strip tokens from the logged URL — share / verify / reset links
  // carry long-lived credentials in the query string and we don't
  // want those landing in operator log streams.
  const meta = req ? `${req.method} ${safeUrl(req.originalUrl)}` : '';
  // In production we MUST NOT print full stack traces: they leak
  // internal paths, file layout, and (occasionally) secrets embedded
  // in error messages. Operators can still find the matching request
  // id and look up the structured fields in the database.
  if (process.env.NODE_ENV === 'production') {
    console.error('[error]', `req=${rid}`, meta, err && err.message ? err.message : err);
  } else {
    console.error('[error]', `req=${rid}`, meta, err.stack ? err.stack.slice(0, 1200) : err);
  }

  // Echo the request id back so the browser can correlate too —
  // the SPA's apiFetch wrapper surfaces this header in error toasts.
  if (req && req.id) res.setHeader('X-Request-Id', req.id);

  // Known ApiError — serialise consistently
  if (err instanceof ApiError) {
    // RFC 6750 — every 401 from a protected resource carries a challenge so
    // agents can discover the authorization endpoint. Handlers that already
    // set a more specific challenge (requireScope's insufficient_scope) win.
    if (err.status === 401 && !res.getHeader('WWW-Authenticate')) {
      res.setHeader(
        'WWW-Authenticate',
        wwwAuthenticateChallenge(
          req && req.headers.authorization === undefined
            ? { authorizationUri: OAUTH_AUTHORIZATION_ENDPOINT }
            : { error: 'invalid_token' },
        ),
      );
    }
    return res.status(err.status).json({
      code: err.code,
      message: err.message,
      detail: err.detail || undefined,
    });
  }

  // Zod validation errors — strip issues in production to avoid
  // leaking schema details or user input through error messages.
  if (err.name === 'ZodError') {
    const detail = process.env.NODE_ENV === 'production'
      ? undefined
      : (err.issues || err.errors);
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      detail,
    });
  }

  // Multer / file-upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      code: 'FILE_TOO_LARGE',
      message: 'File exceeds the 25 MB size limit',
    });
  }

  // Catch-all — don't leak internals
  return res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
  });
}

/**
 * 404 catch-all — for unknown routes.
 *
 * Agents probe paths before reading docs; the body doubles as a recovery
 * map (markdown when the client asks for it, JSON otherwise) pointing at
 * the discovery surfaces that DO exist.
 */
export function notFoundHandler(req: Request, res: Response) {
  const accept = req && req.headers && req.headers.accept
    ? String(req.headers.accept)
    : '';
  const wantsMarkdown = accept.includes('text/markdown')
    || (req && typeof req.path === 'string' && req.path.endsWith('.md'));
  if (wantsMarkdown) {
    res.status(404).type('text/markdown; charset=utf-8');
    return res.send([
      '# 404 — Not found',
      '',
      'This path does not exist on the Socrates API. Start from one of these instead:',
      '',
      '- OpenAPI specification: `/openapi.json`',
      '- Developer portal: `https://topodrive.top/developers`',
      '- Auth reference: `https://topodrive.top/auth.md`',
      '- Navigation index: `https://topodrive.top/llms.txt`',
      '- Sitemap: `https://topodrive.top/sitemap.xml`',
      '',
      '_Request id: see the `X-Request-Id` response header._',
    ].join('\n'));
  }
  return res.status(404).json({
    code: 'NOT_FOUND',
    message: 'Endpoint not found',
    hint: {
      openapi: '/openapi.json',
      developers: 'https://topodrive.top/developers',
      llms_txt: 'https://topodrive.top/llms.txt',
    },
  });
}
