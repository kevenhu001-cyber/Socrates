// @ts-check
/**
 * Unit tests for the input-shape guard rails in
 * services/codeInterpreter.js. We intentionally avoid spinning up
 * the Pyodide worker pool — that path requires a 30+ MB WASM
 * download and is exercised by the live deployment, not the test
 * runner. The guard-rail tests verify the public surface and the
 * tool schema without touching the network or the DB.
 */
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { codeInterpreter, CODE_INTERPRETER_TOOL, resolvePyodideWorkerEntry } from '../src/services/codeInterpreter.js';
import { MAX_TOOL_ARGUMENT_CHARS } from '../src/services/toolCallSafety.js';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* codeInterpreter imports lib/pubsub, which opens a long-lived pg.Client
   at import time (lazy-init). That handle keeps the event loop alive, so
   without this teardown the suite passes and then hangs until the
   runner's timeout kills it. */
after(async () => {
  const { shutdownPubsub } = await import('../src/lib/pubsub.js');
  await shutdownPubsub();
});

describe('codeInterpreter.execute — input guard rails', () => {
  test('resolves the compiled worker or the TypeScript worker in source mode', () => {
    const entry = resolvePyodideWorkerEntry();
    assert.equal(fs.existsSync(entry.file), true);
    assert.match(entry.file, /pyodideWorker\.(js|ts)$/);
    if (entry.file.endsWith('.ts')) {
      assert.ok(entry.execArgv?.includes('tsx'));
    }
  });

  test('the TypeScript worker remains valid ESM without CommonJS require()', async () => {
    const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/services/pyodideWorker.ts');
    const workerSource = await fsPromises.readFile(source, 'utf8');
    assert.doesNotMatch(workerSource, /require\s*\(/);
    assert.match(workerSource, /import os from 'node:os'/);
    assert.equal(typeof os.tmpdir(), 'string');
  });

  test('rejects sources larger than MAX_CODE_CHARS without touching the pool', async () => {
    const huge = 'x'.repeat(400_000);
    const res = await codeInterpreter.execute({ userId: '00000000-0000-4000-8000-000000000001', sessionId: null, code: huge, language: 'python' });
    assert.equal(res.status, 'failed');
    assert.match(res.errorMessage, /code_too_large/);
    assert.equal(res.exitCode, 1);
    assert.equal(res.artifactCount, 0);
  });

  /* P_exec-missing-user — the `executions.user_id` column is
   * NOT NULL and references users(id). Without an explicit guard,
   * the previous behaviour coerced a null userId to null and let
   * the INSERT fail at the DB layer with a confusing error
   * (`Failed query: insert into executions … params: ,,…`). The
   * chat route would surface that verbatim, which the model
   * couldn't pivot from. Reject the call at the boundary with a
   * structured error so the model and the operator both get an
   * actionable message. */
  test('rejects calls without an authenticated user without touching the pool', async () => {
    const res = await codeInterpreter.execute({ userId: null, sessionId: null, code: 'print(1)', language: 'python' });
    assert.equal(res.status, 'failed');
    assert.match(res.errorMessage, /missing_user/);
    assert.equal(res.exitCode, 1);
    assert.equal(res.artifactCount, 0);
  });

  test('CODE_INTERPRETER_TOOL schema stays within the transport argument cap', () => {
    const params = CODE_INTERPRETER_TOOL.function.parameters;
    assert.equal(params.properties.code.maxLength, MAX_TOOL_ARGUMENT_CHARS - 8192);
    assert.deepEqual(params.required, ['code']);
  });
});
