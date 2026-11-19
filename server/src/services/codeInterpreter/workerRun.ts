/**
 * One execution on one worker: boot wait, timeout/interrupt, progress and
 * result parsing.
 */
import crypto from 'node:crypto';
import {
  DEFAULT_TIMEOUT_MS,
  MAX_OUTPUT_BYTES,
  WORKER_WAIT_TIMEOUT_MS,
  WORKER_INTERRUPT_GRACE_MS,
} from './config.js';
import { getPool, type PyodidePool } from './pool.js';
import { emitProgress, type ProgressListener } from './progress.js';
import { isRecord } from './values.js';

interface WorkerArtifact {
  name: string;
  absPath: string;
  size: number;
  [key: string]: unknown;
}

interface WorkerExecutionResult {
  status: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  durationMs?: number;
  queueMs?: number;
  packageMs?: number;
  errorCode?: string;
  errorMessage?: string;
  artifacts?: WorkerArtifact[];
  [key: string]: unknown;
}

function parseWorkerExecutionResult(value: unknown): WorkerExecutionResult | null {
  if (!isRecord(value) || typeof value.status !== 'string') return null;
  const artifacts = Array.isArray(value.artifacts)
    ? value.artifacts.flatMap((artifact): WorkerArtifact[] =>
        isRecord(artifact) &&
        typeof artifact.name === 'string' &&
        typeof artifact.absPath === 'string' &&
        typeof artifact.size === 'number'
          ? [{ name: artifact.name, absPath: artifact.absPath, size: artifact.size }]
          : [],
      )
    : undefined;
  return {
    status: value.status,
    stdout: typeof value.stdout === 'string' ? value.stdout : undefined,
    stderr: typeof value.stderr === 'string' ? value.stderr : undefined,
    exitCode: typeof value.exitCode === 'number' ? value.exitCode : undefined,
    durationMs: typeof value.durationMs === 'number' ? value.durationMs : undefined,
    packageMs: typeof value.packageMs === 'number' ? value.packageMs : undefined,
    errorCode: typeof value.errorCode === 'string' ? value.errorCode : undefined,
    errorMessage: typeof value.errorMessage === 'string' ? value.errorMessage : undefined,
    artifacts,
  };
}

/* ─── Single execution through one worker ─── */
export interface Artifact {
  name: string;
  size: number;
  absPath: string;
  [k: string]: unknown;
}
export interface WorkerResult {
  status?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  durationMs?: number;
  queueMs?: number;
  packageMs?: number;
  errorMessage?: string;
  errorCode?: string;
  artifacts?: Artifact[];
  [k: string]: unknown;
}
export function executionWaitError(
  signal?: AbortSignal | null,
): Error & { code: string; status?: 'cancelled' } {
  return signal?.aborted
    ? Object.assign(new Error('cancelled_by_caller'), {
        code: 'execution_cancelled',
        status: 'cancelled' as const,
      })
    : Object.assign(new Error('execution_queue_timeout'), { code: 'execution_queue_timeout' });
}

export async function runOnWorker(
  {
    executionId,
    code,
    timeoutMs,
    signal,
    waitSignal,
    scratchDir,
    maxOutputBytes,
    onProgress,
  }: {
    executionId: string;
    code: string;
    timeoutMs?: number;
    signal?: AbortSignal | null;
    waitSignal?: AbortSignal;
    scratchDir: string;
    maxOutputBytes?: number;
    onProgress?: ProgressListener | null;
  },
  pool: PyodidePool | null = getPool(),
) {
  if (!pool) throw Error('code_interpreter_disabled');
  const queuedAt = Date.now();
  const deadline = waitSignal ?? AbortSignal.timeout(WORKER_WAIT_TIMEOUT_MS);
  const queueSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  emitProgress(executionId, { phase: 'queued', executionId }, onProgress);
  const slot = await pool.acquireSlot(queueSignal).catch((error: unknown) => {
    throw Object.assign(queueSignal.aborted ? executionWaitError(signal) : (error as Error), {
      queueMs: Date.now() - queuedAt,
    });
  });
  const queueMs = Date.now() - queuedAt;
  const worker = slot.worker!;
  const id = crypto.randomUUID();
  const interruptBuffer = new SharedArrayBuffer(8);
  const startedAt = Date.now();
  const requestedTimeout = timeoutMs || DEFAULT_TIMEOUT_MS;
  const timeout = Number.isFinite(requestedTimeout)
    ? Math.min(2_147_482_647, Math.max(100, requestedTimeout))
    : 120_000;
  let dependencyStartedAt: number | undefined;
  let packageMs: number | undefined;
  let stopReason: 'timeout' | 'cancelled' | undefined;
  let killTimer: NodeJS.Timeout | undefined;
  const stop = (reason: typeof stopReason) => {
    if (stopReason) return;
    stopReason = reason;
    Atomics.store(new Uint8Array(interruptBuffer), 0, 0x02);
    killTimer = setTimeout(() => slot.terminate(), WORKER_INTERRUPT_GRACE_MS);
  };
  const onAbort = () => stop('cancelled');
  const timeoutTimer = setTimeout(() => stop('timeout'), timeout);
  const warnings = [0.5, 0.8, 0.95].map((fraction) =>
    setTimeout(
      () => {
        if (stopReason) return;
        emitProgress(
          executionId,
          {
            phase: 'timeout_warning',
            stream: null,
            chunk: `Execution at ${Math.round(fraction * 100)}% of timeout (${(timeout / 1000).toFixed(0)}s)`,
            executionId,
            elapsedMs: Math.round(timeout * fraction),
          },
          onProgress,
        );
      },
      Math.round(timeout * fraction),
    ),
  );

  let onMessage: (message: unknown) => void = () => undefined;
  try {
    if (signal?.aborted) throw executionWaitError(signal);
    emitProgress(executionId, { phase: 'ready', executionId, elapsedMs: queueMs }, onProgress);
    const result = await new Promise<WorkerExecutionResult>((resolve, reject) => {
      slot.onRunFailure = reject;
      onMessage = (msg) => {
        if (!isRecord(msg) || msg.id !== id) return;
        if (msg.type === 'phase' && typeof msg.elapsedMs === 'number') {
          if (msg.phase === 'preparing') dependencyStartedAt = msg.elapsedMs;
          if (msg.phase === 'running' && dependencyStartedAt !== undefined) {
            packageMs = msg.elapsedMs - dependencyStartedAt;
            dependencyStartedAt = undefined;
          }
        }
        if (msg.type === 'stdout' || msg.type === 'stderr' || msg.type === 'phase') {
          emitProgress(
            executionId,
            {
              phase: typeof msg.phase === 'string' ? msg.phase : msg.type,
              stream: msg.type,
              chunk: typeof msg.chunk === 'string' ? msg.chunk : String(msg.chunk ?? ''),
              executionId,
              elapsedMs: typeof msg.elapsedMs === 'number' ? msg.elapsedMs : undefined,
            },
            onProgress,
          );
          return;
        }
        if (msg.type === 'result' || typeof msg.status === 'string') {
          const parsed = parseWorkerExecutionResult(msg);
          if (parsed) resolve(parsed);
          else reject(new Error('pyodide_worker_invalid_result'));
        }
      };
      worker.on('message', onMessage);
      if (signal?.aborted) {
        reject(executionWaitError(signal));
        return;
      }
      signal?.addEventListener('abort', onAbort, { once: true });
      worker.postMessage({
        id,
        type: 'run',
        executionId,
        code,
        scratchDir,
        interruptBuffer,
        maxOutputBytes: maxOutputBytes || MAX_OUTPUT_BYTES,
      });
    });
    if (stopReason === 'cancelled') {
      return {
        ...result,
        queueMs,
        status: 'cancelled',
        errorCode: 'execution_cancelled',
        errorMessage: 'cancelled_by_caller',
        exitCode: 130,
      };
    }
    if (stopReason === 'timeout') {
      return {
        ...result,
        queueMs,
        status: 'timeout',
        errorCode: 'execution_timeout',
        errorMessage: 'execution_timeout',
        exitCode: 124,
      };
    }
    if (result.status === 'timeout') {
      return {
        ...result,
        queueMs,
        status: 'failed',
        errorMessage: 'worker_interrupt',
        exitCode: 130,
      };
    }
    return { ...result, queueMs };
  } catch (err) {
    const incoming = err as Error & { code?: string; status?: string };
    const durationMs = Date.now() - startedAt;
    const timing = {
      queueMs,
      durationMs,
      packageMs:
        packageMs ??
        (dependencyStartedAt === undefined ? undefined : durationMs - dependencyStartedAt),
    };
    if (stopReason === 'cancelled') {
      throw Object.assign(executionWaitError(signal), timing);
    }
    if (stopReason === 'timeout') {
      throw Object.assign(new Error('execution_timeout'), {
        code: 'execution_timeout',
        status: 'timeout',
        ...timing,
      });
    }
    const code =
      incoming.code ??
      (/pyodide_worker_exited|Worker/i.test(incoming.message)
        ? 'pyodide_worker_failed'
        : 'code_execution_failed');
    throw Object.assign(incoming, { code, ...timing });
  } finally {
    worker.off('message', onMessage);
    signal?.removeEventListener('abort', onAbort);
    slot.onRunFailure = null;
    clearTimeout(timeoutTimer);
    clearTimeout(killTimer);
    for (const warning of warnings) clearTimeout(warning);
    slot.release();
  }
}
