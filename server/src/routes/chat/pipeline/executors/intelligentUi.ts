import { validateIntelligentUi } from '../../../../services/intelligentUi.js';
import { normalizeIntelligentUiArgs } from '../../../../services/intelligentUiNormalize.js';
import { intelligentUiFeedback } from '../../../../services/intelligentUiFeedback.js';
import { VISUALIZATION_TEMPLATES } from '../../../../services/visualization.js';
import { recordVisualizationValidation } from '../../../../lib/telemetry.js';
import type { ToolExecutor } from './types.js';

const KNOWN_TEMPLATES = new Set<string>(VISUALIZATION_TEMPLATES);

/** Bounded label for metrics: a known template id, `none` or `other`. */
function templateLabel(template: unknown): string {
  if (typeof template !== 'string' || !template) return 'none';
  return KNOWN_TEMPLATES.has(template) ? template : 'other';
}

export const executeIntelligentUi: ToolExecutor = async (rawArgs, call, { emitter, toolPolicy }) => {
  const startedAt = Date.now();
  /* The pipeline already normalizes through repairToolArguments; repeat it
     here so direct callers and retries see the same document. */
  const args = normalizeIntelligentUiArgs(rawArgs) as Record<string, unknown>;
  const validation = validateIntelligentUi(args);
  const nodes = Array.isArray(args.nodes) ? args.nodes as Array<Record<string, unknown>> : [];
  const sourceChars = nodes.reduce((total, node) => total + (typeof node?.source === 'string' ? node.source.length : 0), 0);
  let toolResult: Record<string, unknown>;
  if (validation.ok) {
    toolResult = {
      status: 'completed',
      output: `Rendered ${nodes.length} UI nodes`,
      visualizations: validation.visualizations,
      ...(validation.warnings.length ? { warnings: validation.warnings } : {}),
    };
    const templates = validation.visualizations.map((spec) => templateLabel(spec.template));
    for (const template of templates.length ? templates : ['none']) {
      recordVisualizationValidation({ tool: 'render_intelligent_ui', outcome: 'accepted', stage: 'accepted', template });
    }
    console.info('[intelligent_ui]', JSON.stringify({
      id: call.id, outcome: 'accepted', stage: 'accepted', nodes: nodes.length, sourceChars,
      templates, warnings: validation.warnings, durationMs: Date.now() - startedAt,
    }));
  } else {
    const feedback = intelligentUiFeedback(validation.error, validation.failure);
    toolResult = {
      status: 'failed',
      errorCode: validation.failure.stage === 'openui_truncated' ? 'arguments_truncated' : 'invalid_tool_arguments',
      error: validation.error,
      correction: feedback.correction,
      userMessage: feedback.userMessage,
      detail: feedback.detail,
      /* The pipeline records this failure after we return, so more than one
         remaining slot means the model still gets another attempt. */
      retryable: typeof toolPolicy?.remainingRetries === 'function'
        ? toolPolicy.remainingRetries('render_intelligent_ui') > 1
        : true,
      output: '',
    };
    const templates = validation.failure.failures.map((item) => templateLabel(item.template));
    for (const template of templates.length ? templates : ['none']) {
      recordVisualizationValidation({ tool: 'render_intelligent_ui', outcome: 'rejected', stage: validation.failure.stage, template });
    }
    console.warn('[intelligent_ui]', JSON.stringify({
      id: call.id, outcome: 'rejected', stage: validation.failure.stage, nodeId: validation.failure.nodeId,
      nodes: nodes.length, sourceChars, templates,
      vizStages: validation.failure.failures.map((item) => item.stage),
      issuePaths: validation.failure.failures.flatMap((item) => item.issues.map((issue) => issue.path)).slice(0, 12),
      error: validation.error.slice(0, 300), durationMs: Date.now() - startedAt,
    }));
  }
  emitter.event('tool_result', { id: call.id, name: 'render_intelligent_ui', ok: validation.ok, ...toolResult });
  return { result: toolResult };
};
