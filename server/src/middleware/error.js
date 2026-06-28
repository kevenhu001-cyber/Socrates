import { ApiError } from '../lib/errors.js';

/**
 * Global error-handling middleware.
 * Must have 4 parameters (err, req, res, next) for Express to treat it
 * as an error handler rather than normal middleware.
 */
export function errorHandler(err, req, res, _next) {
  // P6.x — `req.id` is set by the requestId middleware mounted
  // early in app.js. Including it in the log line lets an operator
  // grep one ID and find the matching client-side console error.
  const rid = req && req.id ? req.id : 'no-id';
  const meta = req ? `${req.method} ${req.originalUrl}` : '';
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

  // Zod validation errors
  if (err.name === 'ZodError') {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      detail: err.issues || err.errors,
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
export function notFoundHandler(_req, res) {
  return res.status(404).json({
    code: 'NOT_FOUND',
    message: 'Endpoint not found',
  });
}
