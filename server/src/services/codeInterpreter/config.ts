/**
 * Environment-driven execution configuration and scratch paths.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import { resolveInsideRoot } from '../../lib/pathSafety.js';
import { MAX_TOOL_STRING_FIELD_CHARS } from '../tools/toolCallSafety.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const EXEC_RUNNER = process.env.EXEC_RUNNER || 'pyodide';
export const POOL_SIZE = parseInt(process.env.EXEC_WORKER_POOL_SIZE || '1', 10);
export const PYODIDE_VERSION = process.env.EXEC_PYODIDE_VERSION || '0.26.4';
export const DEFAULT_TIMEOUT_MS = parseInt(process.env.EXEC_TIMEOUT_MS_DEFAULT || '120000', 10);
export const MAX_OUTPUT_BYTES = parseInt(process.env.EXEC_MAX_OUTPUT_BYTES || '65536', 10);
export const MAX_ARTIFACT_BYTES = parseInt(process.env.EXEC_MAX_ARTIFACT_BYTES || '10485760', 10);
export const MAX_CODE_CHARS = parseInt(process.env.EXEC_MAX_CODE_CHARS || '200000', 10);
export const ADVERTISED_MAX_CODE_CHARS = Math.min(MAX_CODE_CHARS, MAX_TOOL_STRING_FIELD_CHARS);
export const SCRATCH_DIR =
  process.env.EXEC_SCRATCH_DIR ||
  (process.env.NODE_ENV === 'production'
    ? '/var/lib/socrates/exec'
    : path.join(os.tmpdir(), 'socrates-exec'));

export function sessionScratchPath(userId: string, sessionId: string) {
  return resolveInsideRoot(SCRATCH_DIR, path.join(userId, sessionId));
}

export function executionScratchPath(userId: string, executionId: string) {
  return resolveInsideRoot(SCRATCH_DIR, path.join(userId, 'executions', executionId));
}

export interface PyodideWorkerEntry {
  file: string;
  execArgv?: string[];
}

/** Resolve the worker for both source-mode and compiled production runs. */
export function resolvePyodideWorkerEntry(): PyodideWorkerEntry {
  /* This module is one directory below the worker source/compiled sibling. */
  const compiled = path.join(__dirname, '..', 'pyodideWorker.js');
  if (existsSync(compiled)) return { file: compiled };

  const source = path.join(__dirname, '..', 'pyodideWorker.ts');
  if (existsSync(source)) {
    return {
      file: source,
      execArgv: [...process.execArgv, '--import', 'tsx'],
    };
  }

  throw new Error(`pyodide_worker_entry_missing: neither ${compiled} nor ${source} exists`);
}

/* Make sure the scratch root exists before any worker is spawned. */
await fs.mkdir(SCRATCH_DIR, { recursive: true }).catch(() => {});

function timeoutSetting(raw: string | undefined, fallback: number) {
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 100 && value <= 2_147_483_647 ? value : fallback;
}

export const WORKER_WAIT_TIMEOUT_MS = timeoutSetting(
  process.env.EXEC_WORKER_WAIT_TIMEOUT_MS,
  30_000,
);
export const WORKER_BOOT_TIMEOUT_MS = timeoutSetting(
  process.env.EXEC_WORKER_BOOT_TIMEOUT_MS,
  45_000,
);
export const WORKER_INTERRUPT_GRACE_MS = 1_000;
