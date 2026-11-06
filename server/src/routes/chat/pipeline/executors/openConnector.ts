/**
 * OpenConnector chat tool executor.
 *
 * Runs the curated OpenConnector allow-list from openConnectorChatTools.ts
 * against the OOMOL-hosted runtime, using the calling user's connected
 * account. Mirrors executeProjectConnector's result envelope so the
 * pipeline treats both connector families identically.
 */

import { executeOpenConnectorTool, getOpenConnectorChatTool } from '../../../../services/integrations/openConnectorChatTools.js';
import type { ToolExecutor, ToolExecutionResult } from './types.js';
import type { ToolResult } from '../types.js';
import { normalizeToolResultRetryability, recordToolResultAndBoundRetryability } from '../toolResultPolicy.js';

export const executeOpenConnector: ToolExecutor = async (
  args,
  call,
  ctx,
): Promise<ToolExecutionResult> => {
  const { emitter, req, projectConnectorConnectionsByProvider, toolPolicy } = ctx;
  const toolName = call.function?.name || '';
  const spec = getOpenConnectorChatTool(toolName);
  const connection = spec
    ? (projectConnectorConnectionsByProvider?.[`oc_${spec.service}`] as { status?: string; connectionName?: string | null } | null) || null
    : null;
  const rawResult = await executeOpenConnectorTool(toolName, args, req.userId!, connection) as ToolResult;
  const result = toolPolicy
    ? recordToolResultAndBoundRetryability(toolName, rawResult, toolPolicy)
    : normalizeToolResultRetryability(rawResult);
  const ok = result.status === 'completed';
  emitter.event('tool_result', {
    id: call.id, ok, status: result.status,
    output: result.output || '',
    error: result.error || null,
    errorCode: result.errorCode || null,
    retryable: result.retryable,
    userMessage: result.userMessage || null,
    detail: result.error || null,
  });
  return { result, outcomeRecorded: Boolean(toolPolicy) };
};
