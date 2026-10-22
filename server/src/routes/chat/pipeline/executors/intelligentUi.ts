import { validateIntelligentUi } from '../../../../services/intelligentUi.js';
import type { ToolExecutor } from './types.js';

export const executeIntelligentUi: ToolExecutor = async (args, call, { emitter }) => {
  const validation = validateIntelligentUi(args);
  const result = validation.ok
    ? { status: 'completed', output: `Rendered ${args.nodes.length} UI nodes` }
    : { status: 'failed', errorCode: 'invalid_tool_arguments', error: validation.error, correction: `Fix the UI and call render_intelligent_ui again: ${validation.error}`, output: '' };
  const toolResult = validation.ok ? { ...result, visualizations: validation.visualizations } : result;
  emitter.event('tool_result', { id: call.id, name: 'render_intelligent_ui', ok: validation.ok, ...toolResult });
  return { result: toolResult };
};
