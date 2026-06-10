import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';

import { csrfProtection } from './middleware/csrf.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
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
import importRouter from './routes/import.js';
import agentRouter from './routes/agent.js';
import classroomRouter from './routes/classroom.js';
import { generateCaptcha } from './services/captcha.js';
import { searchContent } from './services/search.js';
import { fetchBatch } from './services/fetchBatch.js';

const app = express();

// Trust nginx reverse proxy (so req.protocol reflects X-Forwarded-Proto)
app.set('trust proxy', true);

/* ────────────────────────────
   Global middleware
   ──────────────────────────── */

// Body parsing
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Cookie parsing (required for auth / CSRF)
app.use(cookieParser());

// CORS — allow same-origin (app behind same-domain nginx) + dev
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://app.topodrive.top', 'https://topodrive.top']
    : ['http://localhost:8080', 'http://localhost:3000'],
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

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// Captcha
app.get('/api/captcha/generate', (_req, res) => {
  res.json(generateCaptcha());
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

// Search (Phase 3)
app.post('/api/search', async (req, res, next) => {
  try {
    const { q, scope, limit } = req.body;
    const userId = req.userId || req.user?.id;
    if (!userId) return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
    const result = await searchContent(userId, { q, scope, limit });
    return res.json(result);
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

// Fetch-batch (Phase 4)
app.post('/api/fetch-batch', async (req, res, next) => {
  try {
    const { urls } = req.body;
    if (!Array.isArray(urls)) return res.status(400).json({ code: 'BAD_REQUEST', message: 'urls must be an array' });
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

// Import (Phase 5)
app.use('/api/import', importRouter);

// Agent (Phase 6)
app.use('/api/agent', agentRouter);

// Classroom (Phase 6)
app.use('/api/classroom', classroomRouter);

/* ────────────────────────────
   Error handling (must be LAST)
   ──────────────────────────── */
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
