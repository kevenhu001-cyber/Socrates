import type { ToolExecutor } from './types.js';

function executor(name: 'cite_sources' | 'patch_intelligent_ui', method: 'citeSources' | 'patchUi'): ToolExecutor {
  return async (args, call, ctx) => {
    const outcome = ctx.abortSignal.aborted ? { ok: false, error: 'Turn stopped' }
      : ctx.publicRuntime?.[method](args) || { ok: false, error: 'Public turn runtime unavailable' };
    const result = outcome.ok
      ? { status: 'completed', output: outcome.output || '' }
      : { status: 'failed', errorCode: 'invalid_tool_arguments', error: outcome.error, output: '', retryable: false };
    ctx.emitter.event('tool_result', { id: call.id, name, ok: outcome.ok, ...result });
    return { result };
  };
}
export const executeCiteSources = executor('cite_sources', 'citeSources');
export const executePatchIntelligentUi = executor('patch_intelligent_ui', 'patchUi');
