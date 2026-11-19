import { Router, type RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { rateLimitIpKey } from '../../lib/rateLimitKey.js';
import { requireAuth } from '../../middleware/auth.js';
import * as favicons from '../../services/favicons.js';
import { ApiError } from '../../lib/errors.js';

export function createFaviconRouter(
  authenticate: RequestHandler = requireAuth,
  services = favicons,
) {
  const router = Router();
  router.use(authenticate);
  router.use(
    rateLimit({
      windowMs: 60_000,
      max: 120,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => req.userId || rateLimitIpKey(req),
    }),
  );
  router.get('/', async (req, res, next) => {
    try {
      const { bytes, type } = await services.getFavicon(req.query.url);
      res
        .set({
          'Content-Type': type,
          'Content-Length': String(bytes.length),
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'private, max-age=86400',
          'Cross-Origin-Resource-Policy': 'same-origin',
        })
        .send(bytes);
    } catch (error) {
      if (!res.headersSent) res.set('Cache-Control', 'no-store');
      next(
        error instanceof ApiError
          ? error
          : new ApiError(502, 'FAVICON_UNAVAILABLE', 'The site icon could not be loaded'),
      );
    }
  });
  return router;
}

export default createFaviconRouter();
