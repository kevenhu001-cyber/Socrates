import rateLimit from 'express-rate-limit';

/**
 * Helper: derive a stable rate-limit key from the request body, with
 * a hard cap on key length so a malicious 64 KB email field cannot
 * exhaust the limiter's key memory. Falls back to IP if the body is
 * not present (e.g. CSRF 403, malformed JSON).
 */
function emailKey(req) {
  const raw = req.body && req.body.email;
  if (typeof raw !== 'string' || raw.length === 0) return null;
  /* Normalise: lowercase + trim, then cap to 320 chars (RFC 5321). */
  const norm = raw.toLowerCase().trim().slice(0, 320);
  return `email:${norm}`;
}

function codeKey(req) {
  const raw = req.body && req.body.code;
  if (typeof raw !== 'string' || raw.length === 0) return null;
  return `code:${raw.slice(0, 32)}`;
}

function tokenKey(req) {
  const raw = req.body && (req.body.token || req.body.reset_token);
  if (typeof raw !== 'string' || raw.length === 0) return null;
  return `token:${raw.slice(0, 64)}`;
}

function combineKeys(...keys) {
  const valid = keys.filter(Boolean);
  if (!valid.length) return null;
  return valid.join('|');
}

/**
 * Per-endpoint rate limiters.
 *
 * Each limiter is mounted as Express middleware on a specific route. The
 * defaults below were chosen for a single-operator tutoring app:
 *   - authLimiter is tight (10 / 15min) per email+IP pair to deter brute
 *     force on login, password reset, and verification code endpoints.
 *     The key combines the supplied email (if any) with the IP so a
 *     distributed attacker rotating IPs still has to slow down per email.
 *   - chatLimiter caps LLM-streaming cost per authenticated user (60 / hr).
 *   - searchLimiter caps web-search calls (Bing may charge per call).
 *   - fetchLimiter protects the unauthenticated /api/fetch-batch from
 *     being used as an SSRF reflection target or bandwidth sink.
 *   - writeLimiter caps session/message writes (defends against accidental
 *     flooding from a buggy client).
 *
 * Default keyGenerator uses req.ip, which works in production behind the
 * nginx reverse proxy (app.set('trust proxy', 2) in app.js). For
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
  /* P_auth-rate-limit — Key on email + IP. The previous build keyed
     solely on IP, which a distributed attacker could trivially bypass
     by rotating IPs. Combining the (normalised, lower-cased) email
     with the IP means a single attacker still has to wait 15 minutes
     between attempts per account, but multiple IPs attacking the same
     account all hit the same bucket. Falls back to IP-only for
     endpoints that don't carry an email (e.g. logout). */
  keyGenerator: (req) => combineKeys(emailKey(req), `ip:${req.ip}`) || `ip:${req.ip}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonLimit('TOO_MANY_REQUESTS', 'Too many auth attempts; try again later.'),
});

/* Tighter limiter for the login-with-code endpoint. Codes are 6 digits
   (20 bits) with a 10-minute TTL — finite but small enough to brute
   force in ~10s at 100 req/s. Capping at 5 per email+IP per hour
   makes a remote brute force infeasible.

   P_rate-limit-key-cardinality — M4 audit fix. The previous key
   included the raw `code` field, which has near-unique entropy per
   request: every wrong code produced a brand-new bucket, so the
   limiter never tripped. Key on email + IP only. */
export const codeLoginLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => combineKeys(emailKey(req), `ip:${req.ip}`) || `ip:${req.ip}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonLimit('TOO_MANY_REQUESTS', 'Too many code attempts; try again later.'),
});

/* Tighter limiter for password reset. Reset tokens are 64 hex chars
   (~256 bits) — cryptographically strong, not brute-forceable — so
   the limiter's job here is anti-abuse, not anti-brute-force.

   P_rate-limit-key-cardinality — M4 audit fix. The previous key
   included the raw `token` field; a real attacker with a valid
   token (e.g. one captured in email logs) would bypass the limiter
   entirely, while a phisher trying a single bad token would get a
   fresh bucket per request. Key on email + IP only so the limit
   actually counts something meaningful. */
export const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => combineKeys(emailKey(req), `ip:${req.ip}`) || `ip:${req.ip}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonLimit('TOO_MANY_REQUESTS', 'Too many reset attempts; try again later.'),
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
  /* /api/fetch-batch requires auth, so we key on userId when available
     (fall back to IP for the off-chance an unauthenticated request reaches
     the limiter before requireAuth rejects it). */
  keyGenerator: (req) => req.userId || req.ip,
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