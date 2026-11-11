/**
 * create_document executor — structured card tools.
 */

import { executeDocument } from '../../../../services/core/planning.js';
import { buildToolErrorFeedback } from '../../../../services/tools/toolErrorFeedback.js';
import type { ToolExecutor, ToolExecutionResult } from './types.js';
import type { ToolResult } from '../types.js';

export const executeDocumentTool: ToolExecutor = async (
  args,
  call,
  ctx,
): Promise<ToolExecutionResult> => {
  const { emitter, toolPolicy, schemaForTool } = ctx;
  const toolName = call.function?.name || '';
  const result: ToolResult = executeDocument(args);
  if (result.status !== 'completed') {
    toolPolicy.recordResult(toolName, false, result.errorCode || 'plan_spec_invalid');
    result.retryable = toolPolicy.remainingRetries(toolName) > 0;
    const feedback = buildToolErrorFeedback({
      toolName,
      schema: schemaForTool(toolName),
      errorCode: result.errorCode || 'plan_spec_invalid',
      fieldErrors: JSON.stringify(result.detail || []),
      retryable: Boolean(result.retryable),
    });
    result.detail = feedback.detail;
    result.correction = feedback.modelMessage;
    if (!result.retryable) {
      result.userMessage = '结构化字段连续多次无效，本次不再自动重试。';
    }
  } else {
    toolPolicy.recordResult(toolName, true);
  }
  emitter.event('tool_result', {
    id: call.id,
    name: toolName,
    ok: result.status === 'completed',
    status: result.status,
    output: result.output || '',
    plan: result.plan || null,
    spec: result.spec || null,
    error: result.errorCode || null,
    errorCode: result.errorCode || null,
    retryable: result.retryable,
    userMessage: result.userMessage,
    detail: result.detail,
    durationMs: result.durationMs,
  });
  return { result, outcomeRecorded: true };
};
