import express from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';

import { csrfProtection } from './middleware/csrf.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { searchLimiter, fetchLimiter } from './middleware/rateLimit.js';
import crypto from 'node:crypto';
import authRouter from './routes/auth.js';
import sessionRouter from './routes/sessions.js';
import chatRouter from './routes/chat.js';
import apiKeyRouter from './routes/apiKeys.js';
import shareRouter from './routes/share.js';
import publicShareRouter from './routes/publicShares.js';
import messageRouter from './routes/messages.js';
import userRouter from './routes/users.js';
import projectRouter from './routes/projects.js';
import tagRouter from './routes/tags.js';
import fileRouter from './routes/files.js';
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
import { searchContent } from './services/search.js';
import { webSearch, imageSearch } from './services/webSearch.js';
import { fetchBatch } from './services/fetchBatch.js';
import { getActiveApiKey } from './services/apiKey.js';
import { getDb } from './db/index.js';
import { sql } from 'drizzle-orm';
import { startScheduledRefresh, refreshCache, getStatus } from './services/productContext.js';

const app = express();

/* Trust nginx (and any CDN hop in front of nginx). With Edgio +
 * nginx in front of us, the client IP arrives in X-Forwarded-For
 * after two hops — the left-most untrusted proxy entry is the real
 * client. Setting trust proxy to `2` (or a numeric count) instead of
 * the boolean `true` silences express-rate-limit's
 * ERR_ERL_PERMISSIVE_TRUST_PROXY warning while still letting
 * req.protocol / req.ip see the real client values. */
app.set('trust proxy', 2);

/* ────────────────────────────
   Global middleware
   ──────────────────────────── */

// Request id — set before anything else so downstream middleware
// (csrf, auth, error handler) can include it in logs / headers for
// log correlation across server + browser.
app.use(function requestId(req, res, next){
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
});

// Response compression (gzip/brotli) — before body parsing
app.use(compression({ level: 6 }));

// Body parsing
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Cookie parsing (required for auth / CSRF)
app.use(cookieParser());

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
  'app.topodrive.top', 'topodrive.top', 'www.topodrive.top',
  'localhost:8080', 'localhost:3000', 'localhost:5173', 'localhost:5174', 'localhost:5175',
  '127.0.0.1:8080', '127.0.0.1:3000', '127.0.0.1:5173', '127.0.0.1:5174', '127.0.0.1:5175',
];
const CORS_ALLOWED_HOSTS = (process.env.CORS_ALLOWED_HOSTS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const ALLOWED_HOSTS = new Set([...DEFAULT_CORS_HOSTS, ...CORS_ALLOWED_HOSTS]);

app.use(cors({
  origin(origin, cb) {
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

app.get('/api/health', async (_req, res) => {
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    res.json({ ok: true, db: 'connected', uptime: process.uptime() });
  } catch {
    res.status(503).json({ ok: false, db: 'disconnected', uptime: process.uptime() });
  }
});

/* ─── Product Context (topodrive.top knowledge) ─── */
/* GET  — status (auth required, admin only) */
/* POST — manual refresh (auth required, admin only) */
app.get('/api/product-context/status', requireAuth, (_req, res) => {
  res.json(getStatus());
});

app.post('/api/product-context/refresh', requireAuth, async (req, res) => {
  // Only admin users can trigger a manual refresh.
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  try {
    const result = await refreshCache({ force: true });
    res.json({
      ok: true,
      fetchedAt: result.fetchedAt,
      pageCount: Object.keys(result.pages).length,
      totalChars: Object.values(result.pages).reduce((sum, p) => sum + (p.length || 0), 0),
    });
  } catch (err) {
    console.error('[product-context] manual refresh failed:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Public configuration endpoint (no auth required).
// Tells the SPA whether the built-in Beagle provider is available.
// The raw key is NEVER sent to the client — the server proxies
// all Beagle requests via /api/minimax/v1/chat/completions.
app.get('/api/config', (_req, res) => {
  // hasBeagleKey reflects the env var at process start. The SPA
  // calls this on every boot to decide whether to surface the
  // built-in provider — disabling the cache headers ensures a
  // server restart (which can change MINIMAX_API_KEY) is visible
  // on the next page load.
  res.set('Cache-Control', 'no-store');
  res.json({
    hasBeagleKey: !!process.env.MINIMAX_API_KEY,
  });
});

// Auth (Phase 1)
app.use('/api/auth', authRouter);

// Sessions (Phase 2)
app.use('/api/sessions', sessionRouter);

// Chat (Phase 2)
app.use('/api/chat', chatRouter);

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
app.post('/api/search', requireAuth, async (req, res, next) => {
  try {
    const { q, scope, limit } = req.body;
    const result = await searchContent(req.userId, { q, scope, limit });
    return res.json(result);
  } catch (err) { next(err); }
});

// Web search — live internet results for the in-prompt research block
// (fetchWebContext in the SPA). Returns {results: [{title,url,snippet},…]},
// the shape the client already expects. Requires auth so we can rate-limit
// per user and surface 429 if needed in the future.
app.post('/api/web-search', requireAuth, searchLimiter, async (req, res, next) => {
  try {
    const { query, count, enrich } = req.body || {};
    // Resolve the user's active LLM key hint so the cross-request
    // result cache invalidates automatically when they switch providers.
    let apiKeyHint = 'no-key';
    try {
      const cfg = await getActiveApiKey(req.userId);
      if (cfg && cfg.keyHint) apiKeyHint = `${cfg.keyHint}:${cfg.url || ''}:${cfg.model || ''}`;
    } catch { /* leave placeholder hint */ }
    const locale = (req.headers['accept-language'] || '').split(',')[0].trim() || null;
    const results = await webSearch(query, count, {
      userId: req.userId, enrich, locale, apiKeyHint,
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

// Tags (Phase 4)
app.use('/api', tagRouter);

// Files (Phase 4)
app.use('/api/files', fileRouter);

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

/* ─── Product Context: boot-time refresh + 6h cycle ───
   Fire-and-forget: the first chat request after boot will either
   have a ready cache (most cases) or will block briefly on the
   first buildSystemContextBlock call while the initial refresh
   completes.  Subsequent refreshes are truly background. */
try { startScheduledRefresh(); } catch (e) {
  console.error('[product-context] startScheduledRefresh failed:', e.message);
}

export default app;
