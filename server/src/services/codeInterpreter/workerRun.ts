/**
 * One execution on one worker: boot wait, timeout/interrupt, progress and
 * result parsing.
 */
import crypto from 'node:crypto';
import { DEFAULT_TIMEOUT_MS, MAX_OUTPUT_BYTES } from './config.js';
import { getPool } from './pool.js';
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
  errorMessage?: string;
  errorCode?: string;
  artifacts?: Artifact[];
  [k: string]: unknown;
}
export async function runOnWorker({
  executionId,
  code,
  timeoutMs,
  signal,
  scratchDir,
  maxOutputBytes,
  onProgress,
}: {
  executionId: string;
  code: string;
  timeoutMs?: number;
  signal?: AbortSignal | null;
  scratchDir: string;
  maxOutputBytes?: number;
  onProgress?: ProgressListener | null;
}) {
  const startedAt = Date.now();
  const pool = await getPool();
  /* surface the wait while a worker is busy/booting. */
  emitProgress(executionId, { phase: 'queued', executionId }, onProgress);
  const slot = await pool!.acquireSlot();
  emitProgress(executionId, { phase: 'ready', executionId }, onProgress);
  // slot.tryClaim()/claim() already returned a fully-claimed slot with
  // a booted worker, so slot.worker is ready — no second await needed.
  const worker = slot.worker!;
  const id = crypto.randomUUID();
  const interruptBuffer = new SharedArrayBuffer(8);

  const timeout = Math.max(100, timeoutMs || DEFAULT_TIMEOUT_MS);
  let timedOut = false;
  let cancelledByCaller = false;

  // SIGINT path: works for I/O-bound code (time.sleep, file reads, etc).
  // Doesn't work for CPU-bound pure-Python loops — those need termination.
  // Progressive timeout warnings — notify listeners at 50%, 80%, and 95%
  // of the budget so the UI can show "still running…" instead of silence.
  const timeoutCheckpoints = [
    { at: 0.5, label: '50%' },
    { at: 0.8, label: '80%' },
    { at: 0.95, label: '95%' },
  ];
  const timeoutWarnings: NodeJS.Timeout[] = [];
  for (const cp of timeoutCheckpoints) {
    const t = setTimeout(
      () => {
        emitProgress(
          executionId,
          {
            phase: 'timeout_warning',
            stream: null,
            chunk: `Execution at ${cp.label} of timeout (${(timeout / 1000).toFixed(0)}s)`,
            executionId,
            elapsedMs: Math.round(timeout * cp.at),
          },
          onProgress,
        );
      },
      Math.round(timeout * cp.at),
    );
    timeoutWarnings.push(t);
  }

  const sigintTimer = setTimeout(() => {
    timedOut = true;
    try {
      new Uint8Array(interruptBuffer)[0] = 0x02;
    } catch (_) {}
  }, timeout);

  // Hard termination fallback: if SIGINT hasn't returned within timeout + 1s,
  // terminate the worker. The slot's exit handler rejects the in-flight
  // promise and respawns on next acquire.
  const terminateTimer = setTimeout(() => {
    slot.terminate();
  }, timeout + 1000);

  try {
    const result = await new Promise<WorkerExecutionResult>((resolve, reject) => {
      slot._inflightReject = reject; // per-slot, not pool._inflightReject
      const onAbort = () => {
        cancelledByCaller = true;
        try {
          new Uint8Array(interruptBuffer)[0] = 0x02;
        } catch (_) {}
      };
      if (signal) {
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
      }
      const onMessage = (msg: unknown) => {
        if (!isRecord(msg) || msg.id !== id) return;
        if (msg.type === 'stdout' || msg.type === 'stderr' || msg.type === 'phase') {
          emitProgress(
            executionId,
            {
              phase: msg.type,
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
          worker.off('message', onMessage);
          if (signal) signal.removeEventListener('abort', onAbort);
          slot._inflightReject = null;
          // Clear termination timers immediately so a concurrent
          // terminateTimer fire doesn't kill the worker after a
          // normal completion (race between resolve and finally).
          clearTimeout(sigintTimer);
          clearTimeout(terminateTimer);
          for (const t of timeoutWarnings) clearTimeout(t);
          const result = parseWorkerExecutionResult(msg);
          if (result) resolve(result);
          else reject(new Error('pyodide_worker_invalid_result'));
        }
      };
      worker.on('message', onMessage);
      try {
        worker.postMessage({
          id,
          type: 'run',
          executionId,
          code,
          scratchDir,
          maxOutputBytes: maxOutputBytes || MAX_OUTPUT_BYTES,
          interruptBuffer,
        });
      } catch (err) {
        worker.off('message', onMessage);
        if (signal) signal.removeEventListener('abort', onAbort);
        slot._inflightReject = null;
        reject(err);
      }
    });
    if (cancelledByCaller && result && result.status === 'timeout') {
      result.status = 'cancelled';
      result.errorMessage = 'cancelled_by_caller';
      result.exitCode = 130;
    } else if (!timedOut && result && result.status === 'timeout') {
      // A user-raised KeyboardInterrupt is not a tool timeout.
      result.status = 'failed';
      result.errorMessage = 'worker_interrupt';
      result.exitCode = 130;
    }
    return result;
  } catch (err) {
    const incoming = err as Error & { code?: string; status?: string; durationMs?: number };
    const message = String((incoming && incoming.message) || err);
    const incomingStatus = incoming.status;
    const incomingCode = incoming.code;
    const mappedStatus =
      incomingStatus || (cancelledByCaller ? 'cancelled' : timedOut ? 'timeout' : 'failed');
    const mapped = new Error(
      cancelledByCaller ? 'cancelled_by_caller' : timedOut ? 'execution_timeout' : message,
    ) as Error & { code?: string; status?: string; durationMs?: number };
    mapped.code =
      incomingCode ||
      (cancelledByCaller
        ? 'execution_cancelled'
        : timedOut
          ? 'execution_timeout'
          : /pyodide_worker_exited|pyodide_worker_entry_missing|Worker/i.test(message)
            ? 'pyodide_worker_failed'
            : 'code_execution_failed');
    mapped.status = mappedStatus;
    mapped.durationMs = incoming.durationMs ?? Date.now() - startedAt;
    throw mapped;
  } finally {
    clearTimeout(sigintTimer);
    clearTimeout(terminateTimer);
    for (const t of timeoutWarnings) clearTimeout(t);
    slot.release();
  }
}
