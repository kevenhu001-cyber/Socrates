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
