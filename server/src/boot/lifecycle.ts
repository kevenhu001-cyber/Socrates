/**
 * boot/lifecycle — graceful shutdown + process safety nets.
 *
 * Extracted from `index.runtime.ts` so the drain sequence is testable and
 * the entry file only wires signals.
 */

import { closeDb } from '../db/index.js';
import { stopExpiredCleanup } from '../services/cleanupDb.js';
import { stopRustFetchWorker } from '../services/rustFetchWorker.js';
import type { Server } from 'node:http';

/** Graceful shutdown — stop accepting connections, drain, close handles.
 * Active SSE streams and in-flight LLM calls get a 30s grace period to
 * finish before the process force-exits. */
export function installShutdown(server: Server): void {
  const shutdown = async (signal: string) => {
    console.log(`[server] Received ${signal}, shutting down…`);
    server.close(async () => {
      console.log('[server] HTTP server closed — draining connections');
      stopExpiredCleanup();
      try { const { stopScheduler } = await import('../services/scheduler.js'); stopScheduler(); } catch {}
      try { const { stopStatusMonitor } = await import('../services/statusMonitor.js'); stopStatusMonitor(); } catch {}
      await stopRustFetchWorker().catch(() => {});
      /* Pi agent runs are per-turn child processes; nothing to stop here. */
      // Pubsub holds its own long-lived LISTEN connection (not from the
      // pool), so closeDb() below does not reach it. Without this the
      // process can linger after every other handle is closed.
      try { const { shutdownPubsub } = await import('../lib/pubsub.js'); await shutdownPubsub(); } catch {}
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
}

/** P6.x — last-resort safety nets so a stray async exception doesn't
 * crash the process and drop every active SSE chat stream. */
export function installProcessSafetyNets(): void {
  process.on('uncaughtException', (err) => {
    console.error('[fatal] uncaughtException:', err && err.stack || err);
    // V8 heap may be inconsistent — exit so the process supervisor
    // (systemd/pm2) starts a clean process.
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[fatal] unhandledRejection:', reason && (reason as Error).stack || reason);
    // Promise rejections are not always fatal — route-level error
    // handlers may have already caught and logged the rejection.
    // Only crash if the rejection is truly fatal:
    //   - ERR_SOCKET_BAD_PORT or ERR_INVALID_ARG_TYPE → bad config
    //   - ERR_MEMORY_ALLOCATION_FAILED → OOM
    // Otherwise log, let the process continue, and rely on the
    // uncaughtException handler for truly terminal states.
    const errMsg = reason ? ((reason as Error).message || String(reason)) : '';
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
