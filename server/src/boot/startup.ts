/**
 * boot/startup — ordered startup sequence for the Socrates API.
 *
 * M2 of the LobeHub-alignment plan extracted the `main()` body of
 * `index.runtime.ts` into named stages so the boot order is explicit and
 * each stage can be tested/reordered without touching the entry file.
 *
 * Stage order matters:
 *   1. validateEnvironment  — fail fast on production misconfiguration.
 *   2. connectDatabase      — everything below needs the pool.
 *   3. seedBuiltInProvider  — the built-in Beagle key must exist before
 *                             the LLM warmup reads it.
 *   4. validateApiKeys      — detect corrupted ciphertext at boot.
 *   5. startBackgroundTasks — fire-and-forget warmers/sweeps/daemons
 *                             (workspaces, Pyodide, scratch TTL, LLM
 *                             warmup, scheduler, recovery, monitor).
 *   6. listen               — returns the HTTP server.
 */

import { initDb } from '../db/index.js';

/** ── 1. Production-only secret validation ──
 * Without SESSION_SECRET the api_keys table is encrypted with a public
 * default key (`'dev-secret'`), letting anyone with the source code
 * decrypt every user's LLM provider key. Fail fast in production. */
export function validateEnvironment(): void {
  if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
    console.error('FATAL: SESSION_SECRET is required in production (used to encrypt api_keys)');
    process.exit(1);
  }
}

/** ── 2. Initialise database ── */
export function connectDatabase(): void {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('FATAL: DATABASE_URL is not set');
    process.exit(1);
  }

  try {
    initDb(DATABASE_URL);
    console.log('[db] Connected to PostgreSQL');
  } catch (err) {
    console.error('[db] Failed to connect:', (err as Error).message);
    process.exit(1);
  }
}

/** ── 3. Seed built-in Beagle provider if BEAGLE_SYSTEM_KEY is set ── */
export async function seedBuiltInBeagleProvider(): Promise<void> {
  try {
    const { seedBuiltInProvider } = await import('../services/apiKey.js');
    await seedBuiltInProvider();
  } catch (err) {
    console.warn('[seed] Beagle provider skipped:', (err as Error).message);
  }
}

/** ── 4. Validate all API keys (detect corrupted ciphertext) ── */
export async function validateApiKeysAtBoot(): Promise<void> {
  try {
    const { validateApiKeys } = await import('../services/apiKey.js');
    await validateApiKeys();
  } catch (err) {
    console.warn('[validate] API key validation skipped:', (err as Error).message);
  }
}

/** ── 5. Fire-and-forget background tasks ── */

/** Reconcile one private Codex directory per existing conversation.
 * New sessions are initialized by POST /api/sessions; this startup pass
 * backfills older sessions and repairs rows left behind by an interrupted
 * deploy without starting a Codex thread for any of them. */
function reconcileSessionWorkspaces(): void {
  (async () => {
    try {
      const { ensureSessionWorkspacesOnStartup } = await import('../services/agentRuntime.js');
      const result = await ensureSessionWorkspacesOnStartup();
      if (result.checked > 0) {
        console.log(`[agent-runtime] session workspace reconciliation checked ${result.checked}: ${result.created} new, ${result.failed} failed`);
      }
    } catch (err) {
      console.warn('[agent-runtime] session workspace reconciliation skipped:', (err as Error).message);
    }
  })();
}

/** Warm up Pyodide code-interpreter pool.
 * Pay the ~3-5 s cold-start cost at boot so the first user request
 * doesn't block on loading the WASM interpreter. Non-blocking —
 * the server accepts requests while this runs; the first few calls
 * will be queued until the pool is ready. */
function warmPyodidePool(): void {
  (async () => {
    try {
      const { codeInterpreter } = await import('../services/codeInterpreter.js');
      await codeInterpreter.warm();
      console.log('[code-interpreter] Pyodide pool warmed');
    } catch (err) {
      console.warn('[code-interpreter] warmup skipped:', (err as Error).message);
    }
  })();
}

/** TTL sweep for stale session scratch dirs.
 * P_session-scoped-scratch — every code execution in a
 * conversation reuses the same on-disk scratch dir so files
 * (matplotlib PNGs, CSVs) persist between turns. When a session
 * is deleted, the DELETE handler reaps the dir; this sweep
 * catches the orphaned sessions whose tabs were closed or whose
 * server crashed before the delete. TTL defaults to 7 days. */
function sweepStaleScratchDirs(): void {
  (async () => {
    try {
      const ttlDays = parseInt(process.env.EXEC_SCRATCH_TTL_DAYS || '7', 10);
      const { codeInterpreter } = await import('../services/codeInterpreter.js');
      const r = await codeInterpreter._reapStaleSessionScratches(ttlDays);
      if (r && r.removed > 0) console.log(`[code-interpreter] startup TTL sweep removed ${r.removed} stale session scratch dir(s)`);
    } catch (err) {
      console.warn('[code-interpreter] TTL sweep skipped:', (err as Error).message);
    }
  })();
}

/** Warm up LLM provider connection (MiniMax).
 * Send a minimal chat completion request to the upstream provider
 * so the model is loaded into memory and the HTTP/2 connection pool
 * is established before any user request arrives. Without this, the
 * first user of every server restart pays the cold-start penalty
 * (5-15s for model loading), which the frontend can't distinguish
 * from a stuck connection.
 * Uses the built-in provider key from the DB (seeded on a previous
 * deploy with BEAGLE_SYSTEM_KEY set), not the env var directly. */
function warmLlmProvider(): void {
  (async () => {
    try {
      const { getActiveApiKey } = await import('../services/apiKey.js');
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
        console.warn(`[llm-warmup] Skipped (${(err as Error).message || err}) — first request may be slow`);
      }
    } catch (err) {
      console.warn(`[llm-warmup] Skipped (import error: ${(err as Error).message})`);
    }
  })();
}

/** Start scheduled-task daemon (polls scheduled_tasks for due rows,
 * runs their prompts through the user's LLM provider, and saves
 * the results as sessions so they appear in Recents). */
function startSchedulerDaemon(): void {
  (async () => {
    try {
      const { startScheduler } = await import('../services/scheduler.js');
      startScheduler();
    } catch (err) {
      console.warn('[scheduler] not started:', (err as Error).message);
    }
  })();
}

/** Reconnect persisted Codex threads after a process restart.
 * A failed reconnect is recorded as `disconnected`; the run and event
 * history remain available for an explicit resume and are never discarded. */
function recoverAgentRuns(): void {
  (async () => {
    try {
      const { recoverAgentRunsOnStartup } = await import('../services/agentRuntime.js');
      const result = await recoverAgentRunsOnStartup();
      if (result.checked > 0) console.log(`[agent-runtime] restart recovery checked ${result.checked}: ${result.recovered} reconnected, ${result.disconnected} disconnected`);
    } catch (err) {
      console.warn('[agent-runtime] restart recovery skipped:', (err as Error).message);
    }
  })();
}

/** Start self-hosted status monitor (records component state
 * transitions to status_monitor_events for real uptime history). */
function startMonitor(): void {
  (async () => {
    try {
      const { startStatusMonitor } = await import('../services/statusMonitor.js');
      startStatusMonitor();
    } catch (err) {
      console.warn('[status-monitor] not started:', (err as Error).message);
    }
  })();
}

/** Start every fire-and-forget boot task, in the historical order. */
export function startBackgroundTasks(): void {
  reconcileSessionWorkspaces();
  warmPyodidePool();
  sweepStaleScratchDirs();
  warmLlmProvider();
  startSchedulerDaemon();
  recoverAgentRuns();
  startMonitor();
}
