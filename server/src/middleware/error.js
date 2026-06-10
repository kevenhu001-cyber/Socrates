import { ApiError } from '../lib/errors.js';

/**
 * Global error-handling middleware.
 * Must have 4 parameters (err, req, res, next) for Express to treat it
 * as an error handler rather than normal middleware.
 */
export function errorHandler(err, _req, res, _next) {
  // Log all errors in development
  if (process.env.NODE_ENV !== 'production') {
    console.error('[error]', err);
  }

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
