// @ts-check
/**
 * Unit tests for the input-shape guard rails in
 * services/codeInterpreter.js. We intentionally avoid spinning up
 * the Pyodide worker pool — that path requires a 30+ MB WASM
 * download and is exercised by the live deployment, not the test
 * runner. The guard-rail tests verify the public surface and the
 * tool schema without touching the network or the DB.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { codeInterpreter, CODE_INTERPRETER_TOOL } from '../src/services/codeInterpreter.js';

describe('codeInterpreter.execute — input guard rails', () => {
  test('rejects sources larger than MAX_CODE_CHARS without touching the pool', async () => {
    const huge = 'x'.repeat(400_000);
    const res = await codeInterpreter.execute({ code: huge, language: 'python' });
    assert.equal(res.status, 'failed');
    assert.match(res.errorMessage, /code_too_large/);
    assert.equal(res.exitCode, 1);
    assert.equal(res.artifactCount, 0);
  });

  test('CODE_INTERPRETER_TOOL schema exposes the same code length cap', () => {
    const params = CODE_INTERPRETER_TOOL.function.parameters;
    assert.equal(params.properties.code.maxLength, 200000);
    assert.deepEqual(params.required, ['code']);
  });
});
