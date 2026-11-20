import type { ToolResult } from './types.js';
import type { ToolTurnPolicy } from '../../../services/tools/toolTurnPolicy.js';

/**
 * Make retryability explicit on every executor result. Successful calls
 * cannot be retried; failures default to non-retryable unless the executor
 * has enough information to classify them as transient.
 */
export function normalizeToolResultRetryability(result: ToolResult): ToolResult {
  const retryable = result.status !== 'completed' && result.retryable === true;
  return result.retryable === retryable ? result : { ...result, retryable };
}

/** Record an executor outcome and expose retryability only while retries remain. */
export function recordToolResultAndBoundRetryability(
  toolName: string,
  result: ToolResult,
  toolPolicy: ToolTurnPolicy,
): ToolResult {
  const normalized = normalizeToolResultRetryability(result);
  const succeeded = normalized.status === 'completed';
  toolPolicy.recordResult(
    toolName,
    succeeded,
    String(normalized.errorCode || normalized.error || 'tool_failed'),
  );
  if (succeeded) return normalized;
  return {
    ...normalized,
    retryable: normalized.retryable === true && toolPolicy.remainingRetries(toolName) > 0,
  };
}

/** Identical calls can only help after a transient failure of a pure tool.
 * Validation failures need changed arguments; side effects need their own idempotency contract. */
export function canRetryIdenticalToolCall(result: ToolResult, pure: boolean): boolean {
  const code = String(result.errorCode || result.error || '');
  return (
    pure &&
    result.status === 'failed' &&
    result.retryable === true &&
    ![
      'invalid_tool_arguments',
      'arguments_parse_failed',
      'arguments_schema_failed',
      'arguments_too_large',
      'arguments_truncated',
      'plan_spec_invalid',
      'visual_spec_invalid',
    ].includes(code)
  );
}

/**
 * A corrected Python program can recover from user-code failures, but a new
 * LLM hop cannot repair missing authentication, a dead worker or an exhausted
 * execution queue. Distinguish these deterministic/runtime conditions instead
 * of treating every failed code execution as retryable.
 *
 * "retryable" here means the model may send DIFFERENT code, never repeat the
 * same side-effecting invocation (the duplicate-call guard remains active).
 */
const NON_RETRYABLE_CODE_ERRORS = new Set([
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
]);

export function canRetryCorrectedCodeExecution(
  result: ToolResult,
  remainingRetries: number,
): boolean {
  return (
    result.status === 'failed' &&
    remainingRetries > 0 &&
    !NON_RETRYABLE_CODE_ERRORS.has(String(result.errorCode || ''))
  );
}
