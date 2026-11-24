/**
 * The execution transaction: validate caller/session/code, borrow a worker,
 * persist artifacts, update the execution row and audit.
 */
import fs from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import { executions } from '../../db/schema/index.js';
import { publish } from '../../lib/pubsub.js';
import { parseChatSessionId, requireOwnedSession } from '../../lib/sessionOwnership.js';
import { recordAudit } from '../core/audit.js';
import { persistArtifact } from '../util/fileArtifacts.js';
import {
  DEFAULT_TIMEOUT_MS,
  EXEC_RUNNER,
  MAX_ARTIFACT_BYTES,
  MAX_CODE_CHARS,
  MAX_OUTPUT_BYTES,
  SLOW_EXECUTION_LOG_MS,
  executionScratchPath,
  sessionScratchPath,
} from './config.js';
import { getPool, type PyodidePool } from './pool.js';
import { runOnWorker, type WorkerResult } from './workerRun.js';
import type { ProgressListener } from './progress.js';

/* ─── Public execute() — the surface the chat route calls ─── */
export interface ExecuteOpts {
  userId?: string | null;
  sessionId?: string | null;
  language?: string;
  code?: string;
  timeoutMs?: number;
  signal?: AbortSignal | null;
  onProgress?: ProgressListener | null;
}

export type ExecutionResponse = {
  executionId?: string;
  status: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string | null;
  artifacts?: unknown[];
  artifactFileIds: Array<{ id?: string; name?: string; mimeType?: string | null }>;
  artifactCount: number;
};

export async function executeCode(
  opts: ExecuteOpts,
  waitSignal?: AbortSignal,
  sessionLockQueueMs = 0,
): Promise<ExecutionResponse> {
  const requestStartedAt = Date.now();
  if (EXEC_RUNNER === 'disabled') {
    /* still emit a terminal so the chat route can
       clear its "queued" spinner even on the disabled path. */
    if (typeof opts.onProgress === 'function') {
      try {
        opts.onProgress({ phase: 'skipped', reason: 'runner_disabled' });
      } catch (_) {
        /* empty-catch: intentional — progress is best-effort; the skipped result is still returned */
      }
    }
    return {
      status: 'skipped',
      errorCode: 'code_interpreter_disabled',
      errorMessage: 'code_interpreter_disabled',
      durationMs: Math.max(1, Date.now() - requestStartedAt),
      artifactFileIds: [],
      artifactCount: 0,
    };
  }
  const userId = opts.userId || null;
  const sessionId = opts.sessionId || null;
  const code = String(opts.code || '');
  const language = opts.language || 'python';
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  const signal = opts.signal || null;
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null;

  /* the `executions.user_id` column is
   * NOT NULL and references users(id). When a caller (currently
   * the chat SSE route) hands us `opts.userId` of null/undefined,
   * the previous code coerced it to null and let the INSERT fail
   * at the DB layer with a confusing "Failed query: insert into
   * executions… params: ,,…" that the model surfaced verbatim.
   * Fail fast here with a structured error so the chat route can
   * log it cleanly and tell the user that the request was not
   * authenticated. Catching this at the boundary also makes the
   * tool behave predictably if it is ever called from a context
   * without an authenticated user (background job, test, etc). */
  if (!userId) {
    if (typeof onProgress === 'function') {
      try {
        onProgress({ phase: 'skipped', reason: 'missing_user' });
      } catch (_) {
        /* empty-catch: intentional — progress is best-effort; the failed result is still returned */
      }
    }
    return {
      status: 'failed',
      errorCode: 'missing_user',
      errorMessage:
        'missing_user: code_interpreter requires an authenticated user (req.userId was not set on the call)',
      stdout: '',
      stderr: '',
      exitCode: 1,
      durationMs: Math.max(1, Date.now() - requestStartedAt),
      artifacts: [],
      artifactFileIds: [],
      artifactCount: 0,
    };
  }

  /* A direct service caller must meet the same session contract as the SSE
     route. This is critical defense in depth: otherwise a future route could
     accidentally reintroduce cross-user scratch access by calling execute()
     with an arbitrary sessionId. */
  let validatedSessionId: string | null;
  try {
    validatedSessionId = parseChatSessionId(sessionId);
    if (validatedSessionId) {
      await requireOwnedSession(getDb(), validatedSessionId, userId);
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'invalid_session';
    if (typeof onProgress === 'function') {
      try {
        onProgress({ phase: 'skipped', reason: 'invalid_session' });
      } catch (_) {
        /* empty-catch: intentional — progress is best-effort; the failed result is still returned */
      }
    }
    return {
      status: 'failed',
      errorCode: 'session_not_owned',
      errorMessage,
      stdout: '',
      stderr: '',
      exitCode: 1,
      durationMs: Math.max(1, Date.now() - requestStartedAt),
      artifacts: [],
      artifactFileIds: [],
      artifactCount: 0,
    };
  }

  /* reject oversized sources BEFORE we touch
     the database, the scratch dir, or the worker pool. The user
     sees a stable 'failed/code_too_large' status and we never
     persist a 10 MB `executions.code` row. */
  if (code.length > MAX_CODE_CHARS) {
    const maxKb = Math.round(MAX_CODE_CHARS / 1024);
    return {
      status: 'failed',
      errorCode: 'code_too_large',
      errorMessage: `code_too_large: source exceeds ${maxKb} KB limit`,
      stdout: '',
      stderr: '',
      exitCode: 1,
      durationMs: Math.max(1, Date.now() - requestStartedAt),
      artifacts: [],
      artifactFileIds: [],
      artifactCount: 0,
    };
  }

  const executionStartedAt = Date.now();
  let pool: PyodidePool | null;
  try {
    pool = getPool();
  } catch (err) {
    const errorMessage = String((err && (err as Error).message) || err);
    return {
      status: 'failed',
      errorCode: 'pyodide_worker_boot_failed',
      errorMessage,
      stdout: '',
      stderr: '',
      exitCode: 1,
      durationMs: Math.max(1, Date.now() - executionStartedAt),
      artifacts: [],
      artifactFileIds: [],
      artifactCount: 0,
    };
  }
  if (!pool) {
    return {
      status: 'skipped',
      errorCode: 'code_interpreter_disabled',
      errorMessage: 'code_interpreter_disabled',
      artifactFileIds: [],
      artifactCount: 0,
    };
  }

  const db = getDb();

  // Insert the running row up front so we have an ID for foreign keys
  // and so the row exists even if the worker crashes mid-run.
  const [inserted] = await db
    .insert(executions)
    .values({
      userId,
      sessionId: validatedSessionId,
      language,
      code,
      status: 'running',
      startedAt: new Date(),
    })
    .returning();
  const executionId = inserted.id;

  /* files written by an earlier execution
     in the same conversation remain available in the next run's
     cwd. Without this, the model would write transcendental.png in
     run N, then FileNotFoundError on the same path in run N+1.
     The session-scoped dir lives under SCRATCH_DIR/<sessionId> and
     is reused across every execution in the conversation. Reaping
     is deferred to session-delete (deleteSession routes) plus a
     boot-time TTL sweep for orphaned sessions. */
  const sessionScratchDir = validatedSessionId
    ? sessionScratchPath(userId, validatedSessionId)
    : executionScratchPath(userId, executionId);
  let result: WorkerResult;
  try {
    await fs.mkdir(sessionScratchDir, { recursive: true });
    // The worker prints the scratch header separately. Preserve source bytes
    // so future imports and traceback line numbers keep their Python meaning.
    result = await runOnWorker(
      {
        executionId,
        code,
        timeoutMs,
        signal,
        waitSignal,
        scratchDir: sessionScratchDir,
        maxOutputBytes: MAX_OUTPUT_BYTES,
        onProgress,
      },
      pool,
    );
  } catch (err) {
    const typed = err as Error & {
      code?: string;
      status?: string;
      durationMs?: number;
      queueMs?: number;
      packageMs?: number;
    };
    const msg = String((typed && typed.message) || err);
    const status = typed.status || 'failed';
    const errorCode =
      typed.code || (status === 'timeout' ? 'execution_timeout' : 'code_execution_failed');
    result = {
      status,
      errorCode,
      errorMessage:
        status === 'timeout'
          ? 'execution_timeout'
          : status === 'cancelled'
            ? 'cancelled_by_caller'
            : msg,
      stdout: '',
      stderr: '',
      exitCode: status === 'timeout' ? 124 : status === 'cancelled' ? 130 : 1,
      queueMs: typed.queueMs,
      packageMs: typed.packageMs,
      durationMs: Math.max(1, typed.durationMs ?? Date.now() - executionStartedAt),
      artifacts: [],
    };
    // Emit failure result to pubsub subscribers (SSE clients).
    publish(`exec_result:${executionId}`, {
      phase: 'failed',
      executionId,
      status: result.status,
      errorMessage: result.errorMessage,
      stdout: '',
      stderr: '',
      durationMs: result.durationMs,
      errorCode: result.errorCode,
    }).catch(() => {
      /* logged in pubsub */
    });
  }

  // Persist artifacts. Each file in result.artifacts is something the
  // user's Python wrote into the artifacts/ subdir.
  const artifactPersistenceStartedAt = Date.now();
  const artifactFileIds: Array<{ id?: string; name?: string; mimeType?: string | null }> = [];
  const droppedArtifacts: string[] = [];
  for (const art of result.artifacts || []) {
    if (art.size > MAX_ARTIFACT_BYTES) {
      // Too big — drop it (still count as a failed artifact so the
      // user can see why their PNG didn't show).
      droppedArtifacts.push(`${art.name}: too_large (${art.size} > ${MAX_ARTIFACT_BYTES} bytes)`);
      continue;
    }
    try {
      const { id: fileId, mimeType } = await persistArtifact({
        userId,
        sessionId: validatedSessionId,
        executionId,
        sourcePath: art.absPath,
        originalName: art.name,
        size: art.size,
      });
      artifactFileIds.push({ id: fileId, name: art.name, mimeType });
    } catch (err) {
      droppedArtifacts.push(`${art.name}: ${String((err && (err as Error).message) || err)}`);
    }
  }
  if (droppedArtifacts.length) {
    console.log(
      `[code-interpreter] execution ${executionId} dropped ${droppedArtifacts.length} artifact(s): ${droppedArtifacts.join('; ')}`,
    );
  }

  const artifactPersistenceMs = Date.now() - artifactPersistenceStartedAt;
  const finalStatus = result.status || 'failed';
  const finalArtifactCount = artifactFileIds.length;

  // Attempts that never ran the user's code stay in history without
  // consuming the daily execution quota.
  const rejected = ['syntax_error', 'execution_queue_timeout', 'pyodide_worker_boot_failed'];
  const persistedStatus =
    result.errorCode && rejected.includes(result.errorCode) ? 'rejected' : finalStatus;

  // Update the execution row.
  await db
    .update(executions)
    .set({
      status: persistedStatus,
      exitCode: result.exitCode ?? null,
      durationMs: result.durationMs ?? null,
      stdout: (result.stdout || '').slice(0, MAX_OUTPUT_BYTES),
      stderr: (result.stderr || '').slice(0, MAX_OUTPUT_BYTES),
      artifactCount: finalArtifactCount,
      completedAt: new Date(),
    })
    .where(eq(executions.id, executionId));

  // Audit. Best-effort — never throw out of execute() on audit failure.
  recordAudit(userId, 'code_execution', {
    executionId,
    language,
    status: finalStatus,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    sessionLockQueueMs,
    queueMs: result.queueMs,
    workerBootMs: result.workerBootMs,
    dependencyMs: result.dependencyMs,
    fontMs: result.fontMs,
    packageMs: result.packageMs,
    artifactPersistenceMs,
    executionWallMs: Date.now() - requestStartedAt,
    wallMs: Date.now() - requestStartedAt + sessionLockQueueMs,
    errorCode: result.errorCode,
    artifactCount: finalArtifactCount,
    errorMessage: result.errorMessage || null,
  }).catch(() => {});

  // One line per slow execution, with the phases separated so a regression in
  // package downloads or font setup is visible without querying the audit log.
  const executionWallMs = Date.now() - requestStartedAt;
  if (SLOW_EXECUTION_LOG_MS > 0 && executionWallMs >= SLOW_EXECUTION_LOG_MS) {
    console.log(
      `[code-interpreter] slow execution ${executionId}: total=${executionWallMs}ms ` +
        `sessionLock=${sessionLockQueueMs}ms queue=${result.queueMs ?? 0}ms ` +
        `boot=${result.workerBootMs ?? 0}ms deps=${result.dependencyMs ?? 0}ms ` +
        `font=${result.fontMs ?? 0}ms packages=${result.packageMs ?? 0}ms ` +
        `artifacts=${artifactPersistenceMs}ms status=${finalStatus}`,
    );
  }

  // files in the session scratch dir
  // outlive this run; they're reaped only when the session is
  // deleted (see _reapSessionScratch below) or by the TTL sweep at
  // boot for orphaned sessions whose conversation was abandoned.
  // fs.rm(executionScratchDir, …) intentionally removed.

  // Emit final result to pubsub subscribers (SSE clients, possibly
  // on another process). Fire-and-forget — pubsub logs internally
  // on failure; we never let the emit block the resolve.
  publish(`exec_result:${executionId}`, {
    phase: 'completed',
    executionId,
    status: finalStatus,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    durationMs: result.durationMs || 0,
    exitCode: result.exitCode,
    errorMessage: result.errorMessage || null,
    errorCode: result.errorCode,
    artifactFileIds, // [{id, name, mimeType}] — was missing!
  }).catch(() => {
    /* logged in pubsub */
  });

  return {
    executionId,
    status: finalStatus,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    errorCode: result.errorCode,
    errorMessage: result.errorMessage || null,
    artifactFileIds, // [{id, name, mimeType}]
    artifactCount: finalArtifactCount,
  };
}
