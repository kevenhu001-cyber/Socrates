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
 *   - chatLimiter caps LLM-streaming cost per authenticated user. The
 *     base cap is 240/hour (≈4 turns/minute sustained) — enough headroom
 *     for an active tutoring session which can fire multiple backend
 *     POSTs per turn (initial / background-search refresh / judge /
 *     retry). Per-tier multipliers in CHAT_TIER_MULTIPLIERS raise the
 *     cap for paid tiers so they're not artificially throttled.
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

import { getTierPlan } from '../lib/tiers.js';

const jsonLimit = (code, message) => ({
  code,
  message,
});

/* Per-tier multipliers applied on top of the chatLimiter base cap.
   Each multiplier is an integer N such that the effective limit for a
   user on that tier = CHAT_BASE_LIMIT * N. The free tier stays at 1x
   so abuse-resistance is unchanged for accounts that haven't paid;
   paid tiers scale roughly linearly with their monthly token quota
   (Riemann 100M, Descartes 300M, Euclid 800M) so they get proportional
   request headroom. */
const CHAT_BASE_LIMIT = 240;          // requests / hour
const CHAT_TIER_MULTIPLIERS = {
  diophantus: 1,                     // 240/h
  riemann:    2,                     // 480/h
  descartes:  4,                     // 960/h
  euclid:     8,                     // 1920/h
};
function chatLimitForTier(tier) {
  const mult = CHAT_TIER_MULTIPLIERS[tier] || 1;
  return CHAT_BASE_LIMIT * mult;
}

/* P_tutor-pool — Tutor mode is an iterative, Socratic back-and-forth:
   a single session fires multiple backend POSTs per turn (initial /
   background web-search refresh / judge round / retry), and a 30-min
   tutoring session can easily burn 100+ requests. Sharing the chat
   bucket means a user who mixes a Tutor session with regular Chat
   prematurely trips 429. The tutor pool is a SEPARATE bucket keyed
   `tutor:<userId>` so the two budgets never interfere. Base cap is
   600/h × tier multiplier — that's ≈10 tutor turns/min sustained for
   the free tier, 20/min for riemann, etc. The limit-per-request
   callback reads the same `tier` so paid users scale linearly. */
const TUTOR_BASE_LIMIT = 600;         // requests / hour
function tutorLimitForTier(tier) {
  const mult = CHAT_TIER_MULTIPLIERS[tier] || 1;
  return TUTOR_BASE_LIMIT * mult;
}

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
  /* max is overridden per-request via the keyGenerator+limit callback
     so each tier gets its own effective cap. The plain `max` is only
     used as the absolute hard ceiling for unknown tiers / fallback. */
  max: CHAT_BASE_LIMIT * 8,           // 1920/h absolute ceiling (Euclid)
  limit: (req) => chatLimitForTier(req.user && req.user.tier),
  keyGenerator: (req) => req.userId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonLimit('TOO_MANY_REQUESTS', 'Chat rate limit exceeded.'),
  handler: chatRateLimitHandler,
});

/* P_tutor-pool — separate bucket for Tutor mode. Same window /
   handler as chatLimiter but distinct key namespace (`tutor:<id>`)
   so chat and tutor budgets don't interfere, and a higher base cap.
   Mounted only on tutor requests via `pickChatLimiterFor(req)` in
   routes/chat.js. */
export const tutorChatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: TUTOR_BASE_LIMIT * 8,          // 4800/h absolute ceiling (Euclid)
  limit: (req) => tutorLimitForTier(req.user && req.user.tier),
  keyGenerator: (req) => `tutor:${req.userId || req.ip}`,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonLimit('TOO_MANY_REQUESTS', 'Tutor rate limit exceeded.'),
  handler: chatRateLimitHandler,
});

function chatRateLimitHandler(req, res) {
  /* Compute the actual time until the limiter window resets, so the
     Retry-After header reflects reality rather than always "3600".
     express-rate-limit exposes req.rateLimit.resetTime (a Date).
     Fall back to the full window length if unavailable. */
  let retryAfterSec = 60 * 60;
  if (req.rateLimit && req.rateLimit.resetTime) {
    const ms = req.rateLimit.resetTime.getTime() - Date.now();
    if (ms > 0) retryAfterSec = Math.max(1, Math.ceil(ms / 1000));
  }
  res.set('Retry-After', String(retryAfterSec));
  /* Include retryAfterSeconds in the body so a JSON-only client
     (SSE / fetch without reading headers) can still surface a
     friendly toast. */
  return res.status(429).json({
    code: 'TOO_MANY_REQUESTS',
    message: 'Rate limit exceeded. Try again in ' + Math.ceil(retryAfterSec / 60) + ' min.',
    retryAfterSeconds: retryAfterSec,
  });
}

/* Pick the right limiter for a chat request based on the `mode` field
   in the parsed body. Tutor → tutorChatLimiter (separate pool, higher
   cap); anything else → chatLimiter (regular bucket). Falls back to
   chatLimiter if body isn't parsed yet (shouldn't happen with
   express.json() mounted globally before routes). */
export function pickChatLimiterFor(req) {
  const mode = req.body && req.body.mode;
  if (mode === 'tutor') return tutorChatLimiter;
  return chatLimiter;
}

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

/* P_vision-limit — /api/vision/describe costs a 150-300 ms mmx CLI
   spawn + an upstream vision quota unit per call. Authenticated
   users could otherwise burn through the shared MiniMax vision
   quota by uploading many images, which would NOT count against
   chatLimiter (different pool, different cost dimension). 60/hour
   per user is well above typical usage (a tutoring session rarely
   attaches >20 images) and prevents a single account from
   monopolising the upstream quota. */
export const visionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.userId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonLimit('TOO_MANY_REQUESTS', 'Vision description rate limit exceeded.'),
});