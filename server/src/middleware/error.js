import { ApiError } from '../lib/errors.js';

/**
 * Global error-handling middleware.
 * Must have 4 parameters (err, req, res, next) for Express to treat it
 * as an error handler rather than normal middleware.
 */
export function errorHandler(err, req, res, _next) {
  // Always log errors with their route so an INTERNAL_ERROR in
  // production shows up in journalctl. The previous behaviour
  // (silent in production) made session-save failures invisible
  // until the client logged "[sessions] save failed: HTTP 500",
  // which is too late to diagnose. Stack traces are trimmed to
  // 1200 chars so the systemd journal does not balloon.
  const meta = req ? `${req.method} ${req.originalUrl}` : '';
  console.error('[error]', meta, err.stack ? err.stack.slice(0, 1200) : err);

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
