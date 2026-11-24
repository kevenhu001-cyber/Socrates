/**
 * Public code-interpreter facade.
 *
 * The pool, worker protocol, progress transport and execution transaction
 * live in this directory. This file keeps the stable `codeInterpreter`
 * object plus the subscription/worker-entry exports the routes and tests use.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { isUuid } from '../../lib/validate.js';
import { resolveInsideRoot } from '../../lib/pathSafety.js';
import {
  DEFAULT_TIMEOUT_MS,
  EXEC_RUNNER,
  MAX_ARTIFACT_BYTES,
  MAX_OUTPUT_BYTES,
  POOL_SIZE,
  PYODIDE_VERSION,
  SCRATCH_DIR,
  WORKER_WAIT_TIMEOUT_MS,
  executionScratchPath,
  sessionScratchPath,
} from './config.js';
import { getPool, sessionExecutionLock } from './pool.js';
import { CODE_INTERPRETER_TOOL } from './tool.js';
import { executeCode, type ExecuteOpts, type ExecutionResponse } from './execute.js';
import { executionWaitError } from './workerRun.js';

export {
  subscribeExecution,
  unsubscribeExecution,
  subscribeExecutionResult,
  unsubscribeExecutionResult,
  type ProgressEvent,
} from './progress.js';
export { resolvePyodideWorkerEntry } from './config.js';
export { CODE_INTERPRETER_TOOL } from './tool.js';

export const codeInterpreter = {
  /**
   * Run code through the pool. Persists a row in `executions`, runs
   * the code, persists artifacts into `files`, updates the execution
   * row, and records an audit_event.
   *
   * opts: { userId, sessionId, language, code, timeoutMs, signal }
   * Returns: { executionId, status, stdout, stderr, exitCode, durationMs,
   *            errorMessage, artifactFileIds, artifactCount }
   */
  async execute(opts: ExecuteOpts): Promise<ExecutionResponse> {
    const rawSessionId = opts.sessionId || null;
    /* Serialize full execution lifecycles, including artifact persistence.
       Doing only runOnWorker() would still let a later call observe a file
       before its predecessor had copied/recorded the corresponding artifact. */
    const queuedAt = Date.now();
    const deadline = AbortSignal.timeout(WORKER_WAIT_TIMEOUT_MS);
    const wait = opts.signal ? AbortSignal.any([opts.signal, deadline]) : deadline;
    let entered = false;
    try {
      return await sessionExecutionLock.run(
        rawSessionId,
        () => {
          entered = true;
          const sessionLockQueueMs = Date.now() - queuedAt;
          return executeCode(opts, deadline, sessionLockQueueMs);
        },
        wait,
      );
    } catch (error) {
      if (entered || !wait.aborted) throw error;
      const failure = executionWaitError(opts.signal);
      return {
        status: failure.status ?? 'failed',
        errorCode: failure.code,
        errorMessage: failure.message,
        durationMs: Date.now() - queuedAt,
        artifactFileIds: [],
        artifactCount: 0,
      };
    }
  },

  /**
   * Returns the OpenAI-style tool definition for the chat route to attach
   * to upstream requests. If the runner is disabled, returns null.
   */
  getToolDefinition() {
    if (EXEC_RUNNER === 'disabled') return null;
    return CODE_INTERPRETER_TOOL;
  },

  /**
   * Test helper: force-init the pool so the first user request doesn't
   * pay the 3-5s warm-up cost. Optional; called automatically on first
   * execute().
   */
  async warm() {
    const p = getPool();
    // Wait for all workers in the pool to finish booting so the first
    // user request doesn't pay the 3-5s warm-up cost inline.
    if (p && p.slots) {
      await Promise.allSettled(p.slots.map((s) => s.ready));
    }
    return p;
  },

  /* ─── Internal hooks for tests / dev ─── */
  _config: {
    poolSize: POOL_SIZE,
    pyodideVersion: PYODIDE_VERSION,
    defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
    maxOutputBytes: MAX_OUTPUT_BYTES,
    maxArtifactBytes: MAX_ARTIFACT_BYTES,
    scratchDir: SCRATCH_DIR,
    runner: EXEC_RUNNER,
  },
  _internal: {
    sessionExecutionLock,
  },

  /* delete the session's scratch dir
     when the conversation is deleted. Best-effort: filesystem may
     already be gone (TTL sweep, server crash, etc.). Safe to call
     repeatedly. */
  async reapSessionScratch(sessionId?: string | null, userId?: string | null) {
    if (!sessionId || !isUuid(sessionId)) return;
    if (userId && isUuid(userId)) {
      await fs
        .rm(sessionScratchPath(userId, sessionId), { recursive: true, force: true })
        .catch(() => {});
      return;
    }

    /* Compatibility for callers that only know the session ID. We never use
       this path for execution; it merely clears legacy root-layout dirs and
       discovers the owner namespace during deletion/cleanup. UUID validation
       above keeps every joined path beneath SCRATCH_DIR. */
    await fs
      .rm(resolveInsideRoot(SCRATCH_DIR, sessionId), { recursive: true, force: true })
      .catch(() => {});
    let owners: import('node:fs').Dirent[] = [];
    try {
      owners = await fs.readdir(SCRATCH_DIR, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(
      owners
        .filter((entry) => entry.isDirectory() && isUuid(entry.name))
        .map((entry) =>
          fs
            .rm(resolveInsideRoot(SCRATCH_DIR, path.join(entry.name, sessionId)), {
              recursive: true,
              force: true,
            })
            .catch(() => {}),
        ),
    );
  },

  async reapExecutionScratch(executionId?: string | null, userId?: string | null) {
    if (!executionId || !userId || !isUuid(executionId) || !isUuid(userId)) return;
    await fs
      .rm(executionScratchPath(userId, executionId), { recursive: true, force: true })
      .catch(() => {});
  },

  /* TTL sweep — remove session dirs whose conversation hasn't run
     any code in EXEC_SCRATCH_TTL_DAYS days. Called once at server
     boot (index.js). Uses the session dir's mtime as the freshness
     signal: every run touches the dir, so an active session stays
     alive and a closed tab drops off after the TTL. */
  async _reapStaleSessionScratches(ttlDays?: number) {
    const days = Number.isFinite(ttlDays) && (ttlDays as number) > 0 ? (ttlDays as number) : 7;
    const ttlMs = days * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - ttlMs;
    let removed = 0;
    const reapIfStale = async (dir: string) => {
      try {
        const st = await fs.stat(dir);
        if (st.mtimeMs >= cutoff) return;
        await fs.rm(dir, { recursive: true, force: true });
        removed++;
      } catch (_) {
        /* empty-catch: intentional — a concurrent delete or transient ENOENT skips this dir */
      }
    };
    const visit = async (dir: string, depth: number): Promise<void> => {
      let entries: import('node:fs').Dirent[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch (_) {
        return;
      }
      // A scratch root always owns an artifacts child. Treat it as a leaf
      // rather than recursing into artifact files themselves.
      if (entries.some((entry) => entry.isDirectory() && entry.name === 'artifacts')) {
        await reapIfStale(dir);
        return;
      }
      /* Direct UUID children of SCRATCH_DIR are ambiguous during the
         migration: old installs used <root>/<session>, while the new layout
         uses <root>/<user>. A legacy session has an artifacts child and was
         handled above. Otherwise treat this level as an owner namespace so
         an active user's directory is never reaped merely because the parent
         mtime is older than its active session child. */
      if (depth >= 2 && isUuid(path.basename(dir))) {
        await reapIfStale(dir);
        return;
      }
      // New layout is <user>/<session> or <user>/executions/<execution>.
      // Keep a small finite walk so malformed filesystem contents cannot turn
      // a periodic cleanup into an unbounded recursive scan.
      if (depth >= 3) return;
      await Promise.all(
        entries
          .filter(
            (entry) => entry.isDirectory() && (isUuid(entry.name) || entry.name === 'executions'),
          )
          .map((entry) => visit(path.join(dir, entry.name), depth + 1)),
      );
    };
    try {
      await visit(SCRATCH_DIR, 0);
    } catch (e) {
      return { removed: 0, error: String((e && (e as Error).message) || e) };
    }
    if (removed > 0)
      console.log(
        `[code-interpreter] TTL sweep reaped ${removed} stale session scratch dir(s) (older than ${days}d)`,
      );
    return { removed };
  },
};
