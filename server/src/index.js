/**
 * Socrates API — Entry Point
 *
 * Loads environment, initialises database, and starts the HTTP server.
 */
import 'dotenv/config';
import { initDb, closeDb } from './db/index.js';
import { startExpiredCleanup, stopExpiredCleanup } from './services/cleanupDb.js';
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

  // ── Validate all API keys (detect corrupted ciphertext) ──
  try {
    const { validateApiKeys } = await import('./services/apiKey.js');
    await validateApiKeys();
  } catch (err) {
    console.warn('[validate] API key validation skipped:', err.message);
  }

  // ── Warm up Pyodide code-interpreter pool ──
  // Pay the ~3-5 s cold-start cost at boot so the first user request
  // doesn't block on loading the WASM interpreter. Non-blocking —
  // the server accepts requests while this runs; the first few calls
  // will be queued until the pool is ready.
  (async () => {
    try {
      const { codeInterpreter } = await import('./services/codeInterpreter.js');
      await codeInterpreter.warm();
      console.log('[code-interpreter] Pyodide pool warmed');
    } catch (err) {
      console.warn('[code-interpreter] warmup skipped:', err.message);
    }
  })();

  // ── Warm up LLM provider connection (MiniMax) ──
  // Send a minimal chat completion request to the upstream provider
  // so the model is loaded into memory and the HTTP/2 connection pool
  // is established before any user request arrives. Without this, the
  // first user of every server restart pays the cold-start penalty
  // (5-15s for model loading), which the frontend can't distinguish
  // from a stuck connection.
  // Uses the built-in provider key from the DB (seeded on a previous
  // deploy with MINIMAX_API_KEY set), not the env var directly.
  (async () => {
    try {
      const { getActiveApiKey } = await import('./services/apiKey.js');
      const provider = await getActiveApiKey(null); // null = global built-in
      if (!provider || !provider.keyPlaintext) {
        console.log('[llm-warmup] No built-in provider key available — skipping');
        return;
      }
      const baseUrl = (provider.url || '').replace(/\/+$/, '');
      const model = provider.model || 'MiniMax-M3';
      try {
        const start = Date.now();
        const resp = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.keyPlaintext}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: '.' }],
            max_tokens: 1,
            temperature: 0,
            stream: false,
          }),
          signal: AbortSignal.timeout(60000),
        });
        if (resp.ok) {
          console.log(`[llm-warmup] Provider warmed in ${Date.now() - start}ms`);
        } else {
          const text = await resp.text().catch(() => '');
          console.warn(`[llm-warmup] Warmup returned ${resp.status}: ${text.slice(0, 100)}`);
        }
      } catch (err) {
        console.warn(`[llm-warmup] Skipped (${err.message || err}) — first request may be slow`);
      }
    } catch (err) {
      console.warn(`[llm-warmup] Skipped (import error: ${err.message})`);
    }
  })();

  // ── Start periodic DB cleanup ──
  startExpiredCleanup();

  // ── Start HTTP server ──
  const server = app.listen(PORT, () => {
    console.log(`[server] Listening on http://0.0.0.0:${PORT} (${process.env.NODE_ENV || 'development'})`);
  });

  // ── Graceful shutdown ──
  const shutdown = async (signal) => {
    console.log(`[server] Received ${signal}, shutting down…`);
    // Stop accepting new connections immediately. Active SSE streams
    // and in-flight LLM calls get a 30s grace period to finish before
    // the process force-exits.
    server.close(async () => {
      console.log('[server] HTTP server closed — draining connections');
      stopExpiredCleanup();
      await closeDb().catch(() => {});
      console.log('[db] Pool closed');
      process.exit(0);
    });
    // Grace period for active streams before force exit
    setTimeout(() => {
      console.error('[server] Graceful shutdown timeout — force exiting');
      process.exit(1);
    }, 30000);
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
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[fatal] unhandledRejection:', reason && reason.stack || reason);
    // Promise rejections are not always fatal — route-level error
    // handlers may have already caught and logged the rejection.
    // Only crash if the rejection is truly fatal:
    //   - ERR_SOCKET_BAD_PORT or ERR_INVALID_ARG_TYPE → bad config
    //   - ERR_MEMORY_ALLOCATION_FAILED → OOM
    // Otherwise log, let the process continue, and rely on the
    // uncaughtException handler for truly terminal states.
    const errMsg = reason && (reason.message || String(reason));
    if (errMsg && (
      errMsg.includes('ERR_SOCKET_BAD_PORT') ||
      errMsg.includes('ERR_INVALID_ARG_TYPE') ||
      errMsg.includes('ERR_MEMORY_ALLOCATION_FAILED')
    )) {
      console.error('[fatal] Non-recoverable unhandled rejection — terminating');
      process.exit(1);
    }
  });
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
