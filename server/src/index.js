/**
 * Socrates API — Entry Point
 *
 * Loads environment, initialises database, and starts the HTTP server.
 */
import 'dotenv/config';
import { initDb, closeDb } from './db/index.js';
import app from './app.js';

const PORT = parseInt(process.env.PORT || '8080', 10);
const DATABASE_URL = process.env.DATABASE_URL;

async function main() {
  // ── Production-only secret validation ──
  // Without SESSION_SECRET the api_keys table is encrypted with a public
  // default key (`'dev-secret'`), letting anyone with the source code
  // decrypt every user's LLM provider key. Fail fast in production.
  if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
    console.error('FATAL: SESSION_SECRET is required in production (used to encrypt api_keys)');
    process.exit(1);
  }

  // ── Initialise database ──
  if (!DATABASE_URL) {
    console.error('FATAL: DATABASE_URL is not set');
    process.exit(1);
  }

  try {
    initDb(DATABASE_URL);
    console.log('[db] Connected to PostgreSQL');
  } catch (err) {
    console.error('[db] Failed to connect:', err.message);
    process.exit(1);
  }

  // ── Seed built-in Beagle provider if MINIMAX_API_KEY is set ──
  try {
    const { seedBuiltInProvider } = await import('./services/apiKey.js');
    await seedBuiltInProvider();
  } catch (err) {
    console.warn('[seed] Beagle provider skipped:', err.message);
  }

  // ── Start HTTP server ──
  const server = app.listen(PORT, () => {
    console.log(`[server] Listening on http://0.0.0.0:${PORT} (${process.env.NODE_ENV || 'development'})`);
  });

  // ── Graceful shutdown ──
  const shutdown = async (signal) => {
    console.log(`[server] Received ${signal}, shutting down…`);
    server.close(async () => {
      console.log('[server] HTTP server closed');
      await closeDb().catch(() => {});
      console.log('[db] Pool closed');
      process.exit(0);
    });
    // Force exit after 8s if cleanup hangs
    setTimeout(() => process.exit(1), 8000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // P6.x — last-resort safety nets so a stray async exception doesn't
  // crash the process and drop every active SSE chat stream.
  process.on('uncaughtException', (err) => {
    console.error('[fatal] uncaughtException:', err && err.stack || err);
    // V8 heap may be inconsistent — exit so the process supervisor
    // (systemd/pm2) starts a clean process.
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[fatal] unhandledRejection:', reason && reason.stack || reason);
    // Promise rejections are recoverable; let route-level handlers
    // surface them and only crash if the bug is truly systemic.
  });
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
