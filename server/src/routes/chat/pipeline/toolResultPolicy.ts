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
  return pure && result.status === 'failed' && result.retryable === true
    && !['invalid_tool_arguments', 'arguments_parse_failed', 'arguments_schema_failed', 'arguments_too_large', 'arguments_truncated', 'plan_spec_invalid', 'visual_spec_invalid'].includes(code);
}
