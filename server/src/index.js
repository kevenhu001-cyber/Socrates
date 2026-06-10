/**
 * Socrates API — Entry Point
 *
 * Loads environment, initialises database, and starts the HTTP server.
 */
import 'dotenv/config';
import { initDb } from './db/index.js';
import app from './app.js';

const PORT = parseInt(process.env.PORT || '8080', 10);
const DATABASE_URL = process.env.DATABASE_URL;

async function main() {
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

  // ── Start HTTP server ──
  const server = app.listen(PORT, () => {
    console.log(`[server] Listening on http://0.0.0.0:${PORT} (${process.env.NODE_ENV || 'development'})`);
  });

  // ── Graceful shutdown ──
  const shutdown = async (signal) => {
    console.log(`[server] Received ${signal}, shutting down…`);
    server.close(() => {
      console.log('[server] HTTP server closed');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
