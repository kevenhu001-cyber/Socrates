/**
 * OpenConnector chat tool executor.
 *
 * Runs the curated OpenConnector allow-list from openConnectorChatTools.ts
 * against the vendored sidecar, using the calling user's namespaced
 * connection. Mirrors executeProjectConnector's result envelope so the
 * pipeline treats both connector families identically.
 */

import { executeOpenConnectorTool, getOpenConnectorChatTool } from '../../../../services/openConnectorChatTools.js';
import type { ToolExecutor, ToolExecutionResult } from './types.js';
import type { ToolResult } from '../types.js';

export const executeOpenConnector: ToolExecutor = async (
  args,
  call,
  ctx,
): Promise<ToolExecutionResult> => {
  const { emitter, req, projectConnectorConnectionsByProvider } = ctx;
  const toolName = call.function?.name || '';
  const spec = getOpenConnectorChatTool(toolName);
  const connection = spec
    ? (projectConnectorConnectionsByProvider?.[`oc_${spec.service}`] as { status?: string; connectionName?: string | null } | null) || null
    : null;
  const toolResult = await executeOpenConnectorTool(toolName, args, req.userId!, connection) as ToolResult;
  const ok = toolResult.status === 'completed';
  emitter.event('tool_result', {
    id: call.id, ok, status: toolResult.status,
    output: toolResult.output || '',
    error: toolResult.error || null,
    errorCode: toolResult.errorCode || null,
    retryable: false,
    userMessage: toolResult.userMessage || null,
    detail: toolResult.error || null,
  });
  return { result: toolResult };
};
