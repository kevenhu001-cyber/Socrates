import type { Request, Response, NextFunction } from 'express';
import { ApiError } from '../lib/errors.js';
import { safeUrl } from '../lib/log.js';

/**
 * Global request timeout middleware.
 * Mounted early in the middleware chain so every route has a maximum
 * execution time. When a request times out, the middleware sends a
 * 504 response and aborts the downstream pipeline (no more middleware
 * or route handlers run).
 *
 * The chat SSE endpoint (/api/chat/stream) has its own per-LLM-call
 * AbortController with a longer timeout; this is a safety net for
 * everything else (DB queries, file I/O, web fetches, etc.).
 */
export function timeoutMiddleware(req: Request, res: Response, next: NextFunction) {
  const TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '120000', 10);
  const timer = setTimeout(() => {
    if (res.headersSent) {
      /* Headers already sent — we can't change the status code, but
       * destroying the socket still stops the downstream handler from
       * consuming resources indefinitely. */
      try { res.destroy(); } catch (err) { console.warn('[timeout] socket destroy failed:', (err as Error).message); }
      return;
    }
    res.status(504).json({
      code: 'REQUEST_TIMEOUT',
      message: 'Request timed out',
    });
  }, TIMEOUT_MS);
  res.on('finish', () => { clearTimeout(timer); });
  res.on('close', () => { clearTimeout(timer); });
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
 */
export function notFoundHandler(_req: Request, res: Response) {
  return res.status(404).json({
    code: 'NOT_FOUND',
    message: 'Endpoint not found',
  });
}
