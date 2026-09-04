/**
 * render_visualization executor. The correction text carries the schema
 * and a working example, which is what actually unblocks the model.
 */

import { executeVisualization } from '../../../../services/visualization.js';
import { buildToolErrorFeedback } from '../../../../services/toolErrorFeedback.js';
import type { ToolExecutor, ToolExecutionResult } from './types.js';
import type { ToolResult } from '../types.js';

export const executeRenderVisualization: ToolExecutor = async (
  args,
  call,
  ctx,
): Promise<ToolExecutionResult> => {
  const { emitter, toolPolicy, schemaForTool } = ctx;
  const result: ToolResult = executeVisualization(args);
  if (result.status !== 'completed') {
    toolPolicy.recordResult('render_visualization', false, result.errorCode || 'visual_spec_invalid');
    result.retryable = toolPolicy.remainingRetries('render_visualization') > 0;
    const feedback = buildToolErrorFeedback({
      toolName: 'render_visualization',
      schema: schemaForTool('render_visualization'),
      errorCode: result.errorCode || 'visual_spec_invalid',
      fieldErrors: JSON.stringify(result.detail || []),
      retryable: Boolean(result.retryable),
    });
    result.detail = feedback.detail;
    result.correction = feedback.modelMessage;
    if (!result.retryable) {
      result.userMessage = '可视化规格连续多次无效，本次不再自动重试。';
    }
  } else {
    toolPolicy.recordResult('render_visualization', true);
  }
  emitter.event('tool_result', {
    id: call.id,
    name: 'render_visualization',
    ok: result.status === 'completed',
    status: result.status,
    output: result.output || '',
    visualization: result.visualization || null,
    error: result.errorCode || null,
    errorCode: result.errorCode || null,
    retryable: result.retryable,
    userMessage: result.userMessage,
    detail: result.detail,
    durationMs: result.durationMs,
  });
  console.info('[visualization]', JSON.stringify({
    template: result.visualization && result.visualization.template || null,
    status: result.status,
    durationMs: result.durationMs,
    corrected: toolPolicy.remainingRetries('render_visualization') < toolPolicy.snapshot().perToolFailureLimit,
  }));
  return { result, outcomeRecorded: true };
};
