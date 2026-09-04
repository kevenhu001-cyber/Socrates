import express from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';

import { csrfProtection } from './middleware/csrf.js';
import { requireAuth, optionalAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler, timeoutMiddleware } from './middleware/error.js';
import { searchLimiter, fetchLimiter, clientErrorLimiter } from './middleware/rateLimit.js';
import crypto from 'node:crypto';
import authRouter from './routes/auth.js';
import sessionRouter from './routes/sessions.js';
/* P_suggestions-ai — landing-page starter prompts, derived from the
   user's recent sessions via the LLM. Mounted before /api/chat so its
   /api/suggestions/* paths are not claimed by the chat router. */
import suggestionsRouter from './routes/suggestions.js';
import chatRouter from './routes/chat.js';
import ttsRouter from './routes/tts.js';
import ragRouter from './routes/rag.js';
import apiKeyRouter from './routes/apiKeys.js';
import shareRouter from './routes/share.js';
import publicShareRouter from './routes/publicShares.js';
import messageRouter from './routes/messages.js';
import userRouter from './routes/users.js';
import projectRouter from './routes/projects.js';
import tagRouter from './routes/tags.js';
import fileRouter from './routes/files.js';
import fileExtractRouter from './routes/fileExtract.js';
import migrateRouter from './routes/migrate.js';
import artifactRouter from './routes/artifacts.js';
import memoryRouter from './routes/memory.js';
import promptRouter from './routes/prompts.js';
import notificationRouter from './routes/notifications.js';
import usageRouter from './routes/usage.js';
import accountRouter from './routes/account.js';
import importRouter from './routes/import.js';
import classroomRouter from './routes/classroom.js';
import minimaxRouter from './routes/minimaxProxy.js';
import mistakesRouter from './routes/mistakes.js';
import knowledgeBoundaryRouter from './routes/knowledgeBoundary.js';
import visionRouter from './routes/vision.js';
import codexRouter from './routes/codex.js';
import agentRunsRouter from './routes/agentRuns.js';
import agentMcpRouter from './routes/agentMcp.js';
import statusRouter from './routes/status.js';
import mobileRouter from './routes/mobile.js';
import mcpRouter from './routes/mcp.js';
import mcpDocsRouter from './routes/mcpDocs.js';
import nlwebRouter from './routes/nlweb.js';
import oauthRouter from './routes/oauth.js';
import { buildAuthorizationServerMetadata } from './lib/oauthMeta.js';
import { apiDefaultLimiter } from './middleware/rateLimit.js';
import { idempotencyMiddleware } from './middleware/idempotency.js';
import { recordRequestSample } from './services/statusMonitor.js';
import executionRouter from './routes/execution.js';
import scheduledTasksRouter from './routes/scheduledTasks.js';
import pluginsRouter from './routes/plugins.js';
import connectorRouter, { githubWebhookHandler } from './routes/connectors.js';
import projectConnectorRouter from './routes/projectConnectors.js';
import { searchContent } from './services/search.js';
import { webSearch, imageSearch } from './services/webSearch.js';
import { fetchBatch } from './services/fetchBatch.js';
import { getActiveApiKey } from './services/apiKey.js';
import { getDb } from './db/index.js';
import { apiKeys, files as filesTable, executions as executionsTable, shares as sharesTable, sessions as sessionsTable } from './db/schema.js';
import { sql, and, eq, isNotNull, isNull, inArray } from 'drizzle-orm';
import { getStatus as getPubsubStatus } from './lib/pubsub.js';

const app = express();

/* Trust nginx (and any CDN hop in front of nginx). With EdgeOne +
 * nginx in front of us, the client IP arrives in X-Forwarded-For
 * after two hops — the left-most untrusted proxy entry is the real
 * client.
 *
 * P_trust-proxy-subnets — previously `2` (a numeric hop count). A
 * numeric count is brittle: adding another CDN / WAF hop without
 * updating this number silently mis-attributes every IP, so all
 * rate-limits and audit lines start tracing back to a single
 * intermediary address. The subnet list below names the *known*
 * trusted hops explicitly; anything not on the list falls through
 * to socket.remoteAddress. The local subnet whitelisting
 * (127.0.0.1, ::1, link-local) is required for the apiFetch in
 * integration tests where the test runner hits Express directly
 * without a proxy. Update this list whenever the operator adds a
 * new tier of CDN / WAF / VPN in front of nginx. */
app.set('trust proxy', [
  'loopback',           // 127.0.0.1, ::1
  'linklocal',          // 169.254.0.0/16, fe80::/10
  'uniquelocal',        // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, fc00::/7
  // EdgeOne + Cloudflare + nginx hops arrive from these subnets in
  // practice. Add your exact upstream CIDRs here — DO NOT use a
  // numeric trust-proxy count because it will silently mis-attribute
  // IPs if the chain grows.
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
]);
// Don't advertise the framework in the X-Powered-By header.
app.disable('x-powered-by');

/* ────────────────────────────
   Global middleware
   ──────────────────────────── */

// CSP source list — keep this minimal and reviewed. Anything that
// appears here is a deliberate allow-list entry, not a wildcard.
//
//   cdn.jsdelivr.net    — third-party JS/CSS we ship with SRI:
//                          marked, katex (+ mhchem), mermaid, highlight.js,
//                          fuse.js. All pinned with `integrity=` so the
//                          browser still refuses a tampered file.
//   fonts.googleapis.com — Google Fonts CSS API.
//   fonts.gstatic.com    — Google Fonts woff2 binary CDN.
//   'sha256-FUWgNE60…'   — the inline pre-boot script in index.html that
//                          flips document.documentElement.dataset.bootState
//                          to "checking" before main.js loads. CSP3
//                          accepts hash-based per-script allow-listing in
//                          place of `'unsafe-inline'`, which is safer.
const CSP_SCRIPT_SOURCES = [
  "'self'",
  'https://cdn.jsdelivr.net',
];
const CSP_SCRIPT_HASHES = [
  // Pre-boot inline script in frontend/index.html (no <script> tags).
  // If you edit that script you MUST recompute the hash here or the
  // page will fail to load with "Refused to execute inline script".
  "'sha256-FUWgNE60lf0IIcMKXL3LpcSKKY9E3uXAiD7xZUcUuQo='",
];
const CSP_STYLE_SOURCES = [
  "'self'",
  "'unsafe-inline'",        // Vite emits a small inline style block
  'https://cdn.jsdelivr.net',
  'https://fonts.googleapis.com',
];
const CSP_FONT_SOURCES = [
  "'self'",
  'data:',
  'https://fonts.gstatic.com',
];
const CSP_IMG_SOURCES = [
  "'self'",
  'data:',
  'https:',
  'blob:',
];
const CSP_CONNECT_SOURCES = [
  "'self'",
  'https://www.geogebra.org',
  // SSE EventSource goes through connect-src. We allow only our own
  // origin; outbound LLM calls are server-side.
];

// Security headers (helmet) — applied first so every response carries
// the baseline headers. CSP is set to a strict policy that allows our
// own origins, the pinned CDN scripts, and the hash of the inline
// pre-boot script. HSTS is 2 years + preload + subdomains so the
// browser refuses to ever speak plain HTTP to *.topodrive.top.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      // Inline scripts are gated by hash; the dev-only 'unsafe-eval'
      // is required for Vite HMR. Production emits NO inline scripts
      // (Vite bundles to /assets/index-*.js).
      //
      // P_csp-dev-eval — previously this branch was gated on
      // `process.env.NODE_ENV === 'production'`, which had two
      // failure modes:
      //   1. NODE_ENV unset → defaults to 'development' → unsafe-eval
      //      silently allowed in production. (Node's default for an
      //      unset NODE_ENV is 'development'; pm2 / systemd / Docker
      //      setups that omit NODE_ENV would weaken CSP without any
      //      log warning.)
      //   2. NODE_ENV='staging' / 'preview' / 'qa' (any non-'production'
      //      value) → same silent weakening.
      // Replace with an explicit opt-in: an operator who wants Vite
      // HMR / dev tooling must set ALLOW_DEV_EVAL=1 deliberately.
      // Leaving it unset (the production default) keeps the strict
      // policy regardless of NODE_ENV.
      scriptSrc: [
        ...CSP_SCRIPT_SOURCES,
        'https://www.geogebra.org',
        ...CSP_SCRIPT_HASHES,
        ...(process.env.ALLOW_DEV_EVAL === '1' ? ["'unsafe-eval'"] : []),
      ],
      styleSrc: CSP_STYLE_SOURCES,
      fontSrc: CSP_FONT_SOURCES,
      imgSrc: CSP_IMG_SOURCES,
      // SSE streams from /api/chat/stream and web-search/image-search hit
      // our own origin. 'connect-src' covers fetch / XHR / EventSource.
      connectSrc: CSP_CONNECT_SOURCES,
      // SSE needs the worker/blob sources for streaming.
      workerSrc: ["'self'", "blob:"],
      frameSrc: ["'self'", 'https://www.geogebra.org'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      manifestSrc: ["'self'"],
    },
  },
  // 2 years, includeSubDomains, eligible for the HSTS preload list.
  // Once a browser sees this it refuses plain HTTP for the entire domain.
  strictTransportSecurity: {
    maxAge: 63072000,
    includeSubDomains: true,
    preload: true,
  },
  // API/SPA should never be framed.
  frameguard: { action: 'deny' },
  // Block MIME sniffing.
  noSniff: true,
  // Don't allow the browser to send the full URL as Referer; we don't
  // need that and it can leak query-string tokens.
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  // Restrict powerful APIs the SPA doesn't need.
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  // Cross-Origin-Embedder-Policy defaults to "require-corp" in helmet,
  // which would force every cross-origin script to opt-in via CORP
  // headers — including cdn.jsdelivr.net. Disable COEP entirely; we
  // don't need SharedArrayBuffer / cross-origin isolation for the SPA.
  crossOriginEmbedderPolicy: false,
  // CORP must be "cross-origin" so the SPA can still load SRI-pinned
  // scripts from cdn.jsdelivr.net (without this, the browser refuses
  // them under same-site policy).
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  // Same-origin opener — prevents window.opener leaks.
  crossOriginOpenerPolicy: { policy: 'same-origin' },
}));

// Request-timing sampler for the public status metrics. Records each
// completed request's duration + success into a rolling in-memory
// window (no persistence) consumed by GET /api/status. Mounted early
// so SSE/streaming responses are also timed from here.
app.use(function requestTiming(req, res, next) {
  const start = process.hrtime.bigint();
  res.once('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    // Success = a completed 2xx/3xx response. 4xx (incl. 429 rate-limit)
    // and 5xx count as failures so the rate reflects real error traffic
    // instead of pinning at 100% (only <500 would hide 429/404/400).
    const ok = res.statusCode >= 200 && res.statusCode < 400;
    recordRequestSample(ms, ok);
  });
  next();
});

// Request id — set before anything else so downstream middleware
// (csrf, auth, error handler) can include it in logs / headers for
// log correlation across server + browser.
app.use(function requestId(req, res, next){
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
});

// P_cdn-bypass parity — the SPA prefixes every API call with /api/v2/
// (frontend/src/util/api.js) to skip stale CDN cache entries; production
// nginx rewrites /api/v2/* → /api/* before proxying. Local dev (Vite
// proxy or direct Express) has no nginx, so mirror that rewrite here.
app.use(function apiV2Rewrite(req, _res, next) {
  if (req.url.startsWith('/api/v2/')) req.url = '/api' + req.url.slice('/api/v2'.length);
  next();
});

// Response compression (gzip/brotli) — before body parsing
// SSE (text/event-stream) must NOT be compressed — compression
// buffers small frames and prevents incremental delivery through
// nginx/proxies/CDNs, which breaks streaming output on mobile.
app.use(compression({
  level: 6,
  filter: (req, res) => {
    if (res.getHeader && res.getHeader('Content-Type') === 'text/event-stream') return false;
    return compression.filter(req, res);
  }
}));

// GitHub signatures cover the exact bytes. This must precede express.json
// and CSRF, otherwise the body is mutated before signature verification.
app.post('/api/connectors/github/webhook', express.raw({ type: 'application/json', limit: '2mb' }), githubWebhookHandler);

// Body parsing.
// P_image-payload-alignment — the limit must fit a full chat payload with
// multimodal content: up to 6 image attachments, each capped client-side to
// a ~2,000,000-char base64 dataUrl (matching the Zod image_url/attachment
// caps), plus conversation history. The previous 2mb limit rejected any
// request with a normal-sized image with an opaque 413, which surfaced to
// users as "no response after uploading an image".
app.use(express.json({ limit: '16mb' }));
app.use(express.urlencoded({ extended: true }));

// Cookie parsing (required for auth / CSRF)
app.use(cookieParser());

// Global request timeout — mounted after body parsing so slow requests
// have a hard cap. SSE and chat have their own per-stream timeout via
// AbortController; this catches everything else (DB, file I/O, etc.).
app.use(timeoutMiddleware);

// CORS — allow same-origin (app behind same-domain nginx) + dev.
// We key off the actual request's Host header (rather than NODE_ENV) so
// dev requests from 127.0.0.1 work even when the server is started with
// `NODE_ENV=production` (the default in .env).
//
// The dev hosts are hard-coded because they're the only origins
// Vite / `python3 -m http.server` will ever serve from. Production
// hosts are read from CORS_ALLOWED_HOSTS (comma-separated env var)
// so an operator can add / remove hosts without redeploying the
// server.
const DEFAULT_CORS_HOSTS = [
  'app.topodrive.top', 'topodrive.top', 'www.topodrive.top', 'status.topodrive.top',
  'localhost:8080', 'localhost:3000', 'localhost:5173', 'localhost:5174', 'localhost:5175',
  '127.0.0.1:8080', '127.0.0.1:3000', '127.0.0.1:5173', '127.0.0.1:5174', '127.0.0.1:5175',
];
const CORS_ALLOWED_HOSTS = (process.env.CORS_ALLOWED_HOSTS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const ALLOWED_HOSTS = new Set([...DEFAULT_CORS_HOSTS, ...CORS_ALLOWED_HOSTS]);

app.use(cors({
  origin(origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) {
    // Same-origin (no Origin header) is always allowed — covers direct
    // browser nav and same-origin fetches.
    if (!origin) return cb(null, true);
    try {
      const host = new URL(origin).host.toLowerCase();
      if (ALLOWED_HOSTS.has(host)) return cb(null, true);
    } catch (_) { /* fall through */ }
    cb(null, false);
  },
  credentials: true,
}));

app.post('/api/client-error', clientErrorLimiter, express.json({ limit: '10kb' }), (req, res) => {
  const { correl, msg, stack, href, ua } = req.body || {};
  console.error('[client-error]', String(correl ?? '').slice(0, 64), String(msg ?? '').slice(0, 500), String(href ?? '').slice(0, 300), String(ua ?? '').slice(0, 200));
  if (stack) console.error('[client-error-stack]', String(stack).slice(0, 4000));
  res.status(204).end();
});

// CSRF double-submit protection (on all non-GET routes except CSRF endpoint)
app.use(csrfProtection);

// Request logging (lightweight)
app.use((req, _res, next) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`${req.method} ${req.path}`);
  }
  next();
});

/* ────────────────────────────
   Routes
   ──────────────────────────── */

/* P_cache-invalidation — set Cache-Control headers on EVERY API
   response so CDN edge caches (e.g. Tencent EdgeOne) never serve
   stale user-specific data. Without this, a CDN may cache the
   response to /api/sessions and serve an empty "sessions:[]" to
   all subsequent requests, even after the backend has real data.
   The `private` directive prevents shared-cache storage; `no-cache`
   forces revalidation; `no-store` forbids any caching at all. */
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'private, no-cache, no-store, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

/* P_rate-limit-headers — default bucket so every /api response carries
   RateLimit-* headers. Mounted before ALL other /api middleware and
   routers so no surface can end up outside the limiter; endpoint
   limiters (client-error, auth, chat, …) compose on top. The
   Idempotency-Key middleware sits beside it: writes that carry a key
   get their JSON response replayed on retry (24 h). */
app.use('/api', apiDefaultLimiter, idempotencyMiddleware);

app.get('/api/health', async (_req, res) => {
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    res.json({
      ok: true,
      db: 'connected',
      uptime: process.uptime(),
      pubsub: {
        ...getPubsubStatus(),
        transport: 'pg_notify',
      },
    });
  } catch {
    res.status(503).json({ ok: false, db: 'disconnected', uptime: process.uptime() });
  }
});

/* ─── Hello (smoke-test / connectivity check) ─── */
/* Simple GET returning a static greeting. No auth, no DB, no state. */
app.get('/api/hello', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ message: 'hello' });
});

/* ─── Public system status feed (status.topodrive.top) ─── */
/* Unauthenticated, no secrets. Mounted before auth-gated routes. */
app.use('/api/status', statusRouter);

// Android shell bootstrap (public, secret-free). Mounted before auth routes
// so a fresh install can verify its same-origin API contract before login.
app.use('/api/mobile', mobileRouter);

// P_mcp-discovery — Model Context Protocol endpoint (Streamable HTTP).
// Public discovery surface; six read-only tools, no write capability. Mounted
// alongside the other public routers so the CSRF middleware doesn't block
// non-browser MCP clients. See server/src/middleware/csrf.ts#MCP_PATHS.
app.use('/api/mcp', mcpRouter);

// Phase D — OAuth 2.0 authorization server (authorization_code + PKCE S256,
// refresh rotation, RFC 7009 revocation). The token/revoke endpoints carry no
// ambient sid cookie, so csrf.ts#OAUTH_TOKEN_PATHS skips them; the consent
// screen enforces its own hidden-field double-submit inside the router.
app.use('/api/oauth', oauthRouter);

/* P_docs-mcp — the "learn" half of MCP coverage. Separate server instance
 * from the product surface at /api/mcp; tools answer documentation
 * questions only. */
app.use('/api/mcp/docs', mcpDocsRouter);

// P_nlweb — NLWeb-conformant natural-language query surface over Socrates'
// public corpus. /api/nlweb/ask + /stream, with the short /api/ask alias.
app.use('/api/nlweb', nlwebRouter);
app.use('/api', nlwebRouter);

/* Phase D discovery — RFC 8414 §2 authorization-server metadata plus the
 * RFC 8414 §5 path-inserted form for our pathed issuer
 * (https://app.topodrive.top/api/oauth → /.well-known/oauth-authorization-server/api/oauth),
 * and an OIDC-style alias. Mounted BEFORE the SPA fallback so these paths are
 * served as JSON on any host that proxies to Express. */
const oauthServerMetadata = buildAuthorizationServerMetadata();
function sendOauthMetadata(_req: express.Request, res: express.Response) {
  res.set('Cache-Control', 'public, max-age=300');
  return res.json(oauthServerMetadata);
}
app.get('/.well-known/oauth-authorization-server', sendOauthMetadata);
app.get('/.well-known/oauth-authorization-server/api/oauth', sendOauthMetadata);
app.get('/.well-known/openid-configuration', sendOauthMetadata);

// Public configuration endpoint (no auth required).
// Tells the SPA whether the built-in Beagle provider is available.
// The raw key is NEVER sent to the client — the server proxies
// all Beagle requests via /api/minimax/v1/chat/completions.
//
// P_privacy-leak — do NOT expose the real upstream model name
// (e.g. "deepseek-v4-flash") here. "Beagle" is an alias; surfacing
// the underlying model lets any unauthenticated visitor learn the
// operator's LLM choice. The actual model is selected server-side
// from the DB at chat time, so the SPA doesn't need to know.
app.get('/api/config', async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  let hasBeagleKey = false;
  try {
    const db = getDb();
    const [row] = await db.select({ id: apiKeys.id })
      .from(apiKeys)
      .where(and(eq(apiKeys.isBuiltIn, true), isNotNull(apiKeys.keyCiphertext)))
      .orderBy(apiKeys.createdAt)
      .limit(1);
    hasBeagleKey = !!row;
  } catch (_) { /* best-effort */ }
  res.json({
    hasBeagleKey,
    /* P_privacy-leak — expose only a boolean capability hint, never the
     * underlying model name. The SPA needs to know whether the built-in
     * provider is reasoning-capable so chat.js can set reasoning_effort
     * and pick longer stream timeouts; it doesn't need to know WHICH
     * model that is. Operator controls via BEAGLE_IS_REASONING env
     * (default true; set to "false" to disable for non-reasoning upstreams). */
    isReasoning: process.env.BEAGLE_IS_REASONING !== 'false',
  });
});

// Auth (Phase 1)
app.use('/api/auth', authRouter);

// Sessions (Phase 2)
app.use('/api/sessions', sessionRouter);

// P_suggestions-ai — landing-page starter prompts, derived from the
// user's recent sessions via the LLM. Mounted before /api/chat so its
// /api/suggestions/* paths are not claimed by the chat router.
app.use('/api/suggestions', suggestionsRouter);
app.use('/api/tts', ttsRouter);
// P_session-chunks — session-scoped BM25 retrieval over a session's
// own history. Used by the chat surface to surface related past
// messages; the search is in-memory over session_chunks and is
// owned-checked before any retrieval.
app.use('/api/rag', ragRouter);

// Chat (Phase 2) — includes execution SSE stream at /api/chat/executions/:id/stream
app.use('/api/chat', chatRouter);

// Execution SSE stream — standalone endpoint for real-time code execution progress
// Mounted at /api/executions/:id/stream for frontend EventSource consumption.
// Uses its own router (not chatRouter) to avoid exposing all chat routes
// under /api/executions/.
app.use('/api/executions', executionRouter);

// API keys (Phase 3)
app.use('/api/api-key', apiKeyRouter);

// Share — mounted as sub-route of sessions for :id parameter
app.use('/api/sessions/:id/share', shareRouter);

// Public share lookup by token (no auth — share token is the credential)
app.use('/api/shares', publicShareRouter);

// Messages (Phase 3)
app.use('/api/messages', messageRouter);

// Users (Phase 3)
app.use('/api/users', userRouter);

// Search (Phase 3) — local content (sessions + messages), used by Cmd-K.
app.post('/api/search', requireAuth, searchLimiter, async (req, res, next) => {
  try {
    const { q, scope, limit } = req.body;
    const result = await searchContent(req.userId!, { q, scope, limit });
    return res.json(result);
  } catch (err) { next(err); }
});

// Web search — live internet results for the in-prompt research block
// (fetchWebContext in the SPA). Returns {results: [{title,url,snippet},…]},
// the shape the client already expects. Requires auth so we can rate-limit
// per user and surface 429 if needed in the future.
app.post('/api/web-search', requireAuth, searchLimiter, async (req, res, next) => {
  try {
    const { query, count } = req.body || {};
    // Resolve the user's active LLM key hint so the cross-request
    // result cache invalidates automatically when they switch providers.
    let apiKeyHint = 'no-key';
    try {
      const cfg = await getActiveApiKey(req.userId);
      if (cfg && cfg.keyHint) apiKeyHint = `${cfg.keyHint}:${cfg.url || ''}:${cfg.model || ''}`;
    } catch { /* leave placeholder hint */ }
    const locale = (req.headers['accept-language'] || '').split(',')[0].trim() || undefined;
    const results = await webSearch(query, count, {
      userId: req.userId ?? undefined, locale, apiKeyHint,
    });
    return res.json({ results, query: String(query || '').slice(0, 200) });
  } catch (err) { next(err); }
});

// Image search — live image results from Bing Images. Returns
// { results: [{ title, url, thumbnailUrl, sourceUrl }] }.
app.post('/api/image-search', requireAuth, searchLimiter, async (req, res, next) => {
  try {
    const { query, count } = req.body || {};
    const results = await imageSearch(query, count);
    return res.json({ results, query: String(query || '').slice(0, 200) });
  } catch (err) { next(err); }
});

// Projects (Phase 4)
app.use('/api/projects', projectRouter);

/* ─── Scheduled Tasks ─── */
app.use('/api/scheduled-tasks', scheduledTasksRouter);

/* Unified Agent Runtime — native tools and Codex share durable runs,
 * approvals, events, workspaces, and recovery through this surface. */
app.use('/api/agent-runs', agentRunsRouter);
app.use('/api/agent-mcp', agentMcpRouter);

/* ─── Plugins ─── */
app.use('/api/plugins', pluginsRouter);
app.use('/api/connectors', connectorRouter);
app.use('/api/project-connectors', projectConnectorRouter);

// Files (Phase 4) — PDF text extraction is mounted FIRST so its
// `/extract` path doesn't get swallowed by fileRouter's `/:id` lookup.
// The /raw endpoint is mounted BEFORE the tagRouter (which mounts at
// /api with requireAuth) so unauthenticated share viewers can load
// artifact images without hitting the requireAuth middleware.
//
// Access control (audit follow-up — UUID unguessability alone is not
// authorization): the owner may always read; anyone else may read only
// when the file's session (direct, or via its code-interpreter
// execution) carries an active public/unlisted share on a non-archived
// session. Everything else gets 404 so the endpoint is not an
// existence oracle.
app.get('/api/files/:id/raw', optionalAuth, async (req, res, next) => {
  try {
    const db = getDb();
    const fileId = String(req.params.id);
    const [file] = await db.select().from(filesTable).where(eq(filesTable.id, fileId)).limit(1);
    if (!file) return next();
    let allowed = !!req.userId && file.userId === req.userId;
    if (!allowed) {
      let sessionId = file.sessionId;
      if (!sessionId && file.executionId) {
        const [exec] = await db.select({ sessionId: executionsTable.sessionId })
          .from(executionsTable)
          .where(eq(executionsTable.id, file.executionId))
          .limit(1);
        sessionId = exec?.sessionId ?? null;
      }
      if (sessionId) {
        const [share] = await db.select({ token: sharesTable.token })
          .from(sharesTable)
          .innerJoin(sessionsTable, eq(sessionsTable.id, sharesTable.sessionId))
          .where(and(
            eq(sharesTable.sessionId, sessionId),
            inArray(sharesTable.visibility, ['public', 'unlisted']),
            isNull(sessionsTable.archivedAt),
          ))
          .limit(1);
        allowed = !!share;
      }
    }
    if (!allowed) return res.status(404).json({ code: 'NOT_FOUND', message: 'File not found' });
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Content-Type', file.mimeType);
    const inlinePreview = req.query.inline === '1' && (
      file.mimeType.startsWith('audio/')
      || file.mimeType.startsWith('video/')
      || (file.mimeType.startsWith('text/') && file.mimeType !== 'text/html' && file.mimeType !== 'text/xhtml' && file.mimeType !== 'text/xhtml+xml')
      || file.mimeType === 'application/json'
    );
    if (!file.mimeType.startsWith('image/') && file.mimeType !== 'application/pdf' && !inlinePreview) {
      res.set('Content-Disposition', 'attachment');
    }
    return res.sendFile(file.storagePath);
  } catch (err) { next(err); }
});
app.use('/api/files', fileExtractRouter);
app.use('/api/files', fileRouter);

// Tags (Phase 4) — mounted at /api so it matches /api/sessions/:id/tags
// All routes in this router require auth.
app.use('/api', tagRouter);

// Migrate (Phase 4)
app.use('/api/migrate', migrateRouter);

// Fetch-batch (Phase 4) — requires auth to prevent use as SSRF proxy
app.post('/api/fetch-batch', requireAuth, fetchLimiter, async (req, res, next) => {
  try {
    const { urls } = req.body;
    if (!Array.isArray(urls)) return res.status(400).json({ code: 'BAD_REQUEST', message: 'urls must be an array' });
    // SSRF protection is handled by fetchBatch.js (DNS resolution,
    // private IP check, redirect validation). Allow http(s) here so
    // search results with http:// URLs are not blocked.
    for (const url of urls) {
      if (typeof url !== 'string' || (!url.startsWith('https://') && !url.startsWith('http://'))) {
        return res.status(400).json({ code: 'BAD_REQUEST', message: 'Only http(s):// URLs are allowed' });
      }
    }
    const result = await fetchBatch(urls);
    return res.json(result);
  } catch (err) { next(err); }
});

// Artifacts (Phase 5)
app.use('/api/artifacts', artifactRouter);

// Memory (Phase 5)
app.use('/api/memory', memoryRouter);

// Prompts (Phase 5)
app.use('/api/prompts', promptRouter);

// Notifications (Phase 5)
app.use('/api/notifications', notificationRouter);

// Usage (Phase 5)
app.use('/api/usage', usageRouter);

// Account dashboard (Phase 3)
app.use('/api/account', accountRouter);

// Import (Phase 5)
app.use('/api/import', importRouter);

// Classroom (Phase 6)
app.use('/api/classroom', classroomRouter);

app.use('/api/minimax', minimaxRouter);

// Mistakes (错题本) — first-class CRUD
app.use('/api/mistakes', mistakesRouter);

// Knowledge boundary — aggregate kbNodes across sessions
app.use('/api/knowledge-boundary', knowledgeBoundaryRouter);

/* Vision — mmx CLI-backed image recognition. Used by the frontend
   when the user attaches an image so the LLM gets image context
   even on non-vision upstreams (the description is prepended to
   the user message; image_url parts are still sent to vision-capable
   models for accuracy). Auth required so unauthenticated visitors
   can't run arbitrary mmx invocations. */
app.use('/api/vision', visionRouter);

/* ─── Codex agent runtime (embedded harness) ───
 * Mounted before the SPA fallback. All routes require auth; the client
 * never supplies config/policy — the server builds the per-thread
 * provider + workspace + approval/sandbox overrides from the DB. */
app.use('/api/codex', codexRouter);

/* ────────────────────────────
   Static SPA — serve the built frontend from frontend/dist/
   ------------------------------------------------------------
   Production runs behind nginx that serves /var/www/app.topodrive.top
   and proxies /api/* to this process. For a self-contained "本机
   部署" the backend also serves the SPA so a single port (PORT)
   can host the whole app. Mounted AFTER all /api routes so the
   static handler never wins over an API match.
   ──────────────────────────── */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIST = path.resolve(__dirname, '../../frontend/dist');
app.use(express.static(FRONTEND_DIST, {
  // index.html is the SPA shell — let the route below handle
  // history-mode navigations. Static assets (JS / CSS / images)
  // still go through the default file lookup.
  index: false,
  fallthrough: true,
  maxAge: '1h',
}));
// SPA fallback: any non-/api GET that didn't match a static file
// returns index.html so client-side routing keeps working.
app.get(/^\/(?!api\/).*/, (_req, res, next) => {
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'), (err) => {
    if (err) next(err);
  });
});

/* ────────────────────────────
   Error handling (must be LAST)
   ──────────────────────────── */
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
