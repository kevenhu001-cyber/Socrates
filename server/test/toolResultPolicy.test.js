import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canRetryCorrectedCodeExecution,
  normalizeToolResultRetryability,
} from '../src/routes/chat/pipeline/toolResultPolicy.js';

test('corrected Python code can retry user syntax/runtime errors within budget', () => {
  for (const errorCode of [
    'syntax_error',
    'code_execution_failed',
    'code_too_large',
    'output_limit_exceeded',
  ]) {
    assert.equal(
      canRetryCorrectedCodeExecution({ status: 'failed', errorCode }, 2),
      true,
      errorCode,
    );
  }
  assert.equal(canRetryCorrectedCodeExecution({ status: 'failed', error: 'NameError' }, 1), true);
  assert.equal(
    canRetryCorrectedCodeExecution({ status: 'failed', errorCode: 'syntax_error' }, 0),
    false,
  );
});

test('unrecoverable sandbox, authorization and timeout errors never prompt same-turn re-execution', () => {
  for (const errorCode of [
    'missing_user',
    'session_not_owned',
    'code_interpreter_disabled',
    'code_interpreter_unavailable',
    'pyodide_worker_boot_failed',
    'pyodide_worker_failed',
    'pyodide_worker_invalid_result',
    'execution_queue_timeout',
    'execution_timeout',
    'execution_cancelled',
    'daily_execution_limit_reached',
    'illustration_not_supported',
  ]) {
    assert.equal(
      canRetryCorrectedCodeExecution({ status: 'failed', errorCode }, 2),
      false,
      errorCode,
    );
  }
  assert.equal(canRetryCorrectedCodeExecution({ status: 'completed' }, 2), false);
  assert.equal(canRetryCorrectedCodeExecution({ status: 'timeout' }, 2), false);
  assert.equal(canRetryCorrectedCodeExecution({ status: 'cancelled' }, 2), false);
});

test('successful tool results are never marked retryable in the provider policy', () => {
  assert.equal(normalizeToolResultRetryability({ status: 'completed' }).retryable, false);
  assert.equal(
    normalizeToolResultRetryability({ status: 'completed', retryable: true }).retryable,
    false,
  );
});
