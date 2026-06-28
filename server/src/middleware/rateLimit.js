import rateLimit from 'express-rate-limit';

/**
 * Per-endpoint rate limiters.
 *
 * Each limiter is mounted as Express middleware on a specific route. The
 * defaults below were chosen for a single-operator tutoring app:
 *   - authLimiter is tight (10 / 15min) to deter brute force on login,
 *     password reset, and verification code endpoints. The tight ceiling
 *     prevents email-bombing from a single source.
 *   - chatLimiter caps LLM-streaming cost per authenticated user (60 / hr).
 *   - searchLimiter caps web-search calls (Bing may charge per call).
 *   - fetchLimiter protects the unauthenticated /api/fetch-batch from
 *     being used as an SSRF reflection target or bandwidth sink.
 *   - writeLimiter caps session/message writes (defends against accidental
 *     flooding from a buggy client).
 *
 * Default keyGenerator uses req.ip, which works in production behind the
 * nginx reverse proxy (app.set('trust proxy', true) in app.js). For
 * authenticated endpoints we key on userId when available so a single
 * corporate NAT IP doesn't aggregate many users into one bucket.
 */

const jsonLimit = (code, message) => ({
  code,
  message,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonLimit('TOO_MANY_REQUESTS', 'Too many auth attempts; try again later.'),
});

export const chatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.userId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonLimit('TOO_MANY_REQUESTS', 'Chat rate limit exceeded.'),
  handler: (req, res) => {
    res.set('Retry-After', String(Math.ceil(60 * 60 * 1000 / 1000)));
    res.status(429).json(jsonLimit('TOO_MANY_REQUESTS', 'Chat rate limit exceeded.'));
  },
});

export const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) => req.userId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonLimit('TOO_MANY_REQUESTS', 'Search rate limit exceeded.'),
});

export const fetchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonLimit('TOO_MANY_REQUESTS', 'Fetch rate limit exceeded.'),
});

export const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: (req) => req.userId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonLimit('TOO_MANY_REQUESTS', 'Write rate limit exceeded.'),
});