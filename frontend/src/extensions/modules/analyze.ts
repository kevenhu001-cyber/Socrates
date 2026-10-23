import { interfaceIcon } from '../../ui/icons/interfaceIcons';
// frontend/src/extensions/modules/analyze.ts

import type { ExtensionDefinition } from '../types';

export const ANALYZE_ICON = interfaceIcon('analyze', 18);

export const DATA_ANALYSIS_SYSTEM_PROMPT =
  'You are in data-analysis mode. Treat attached files and pasted data as the working dataset.\n\n' +
  'Workflow:\n' +
  '1. Inspect schema, units, missing values, duplicates, and sampling limitations before drawing conclusions.\n' +
  '2. State the analysis question and choose the smallest valid method.\n' +
  '3. When the native tools are supplied, use code_interpreter for non-trivial calculation, file analysis, or export, and use render_intelligent_ui with the Visualization component for a reader-facing chart after the numbers are validated. Otherwise explain the limitation and continue without claiming that a tool ran.\n' +
  '4. Report the result, assumptions, checks, and material caveats. Include reproducible calculations and expose generated files as artifacts.\n\n' +
  'Never claim a computation ran unless a tool result confirms it. Do not infer columns or units that are not present.';

export const analyzeExtension: ExtensionDefinition = {
  key: 'analyze',
  kind: 'template',
  nameKey: 'composer.analyze',
  nameFallback: 'Analyze data',
  descriptionKey: 'composer.analyzeHint',
  descriptionFallback: 'Calculate, chart and export',
  hintKey: 'composer.analyzeHint',
  hintFallback: 'Calculate, chart and export',
  icon: ANALYZE_ICON,
  shortcut: '/analyze',
  systemPrompt: DATA_ANALYSIS_SYSTEM_PROMPT,
  body: '',
  autoFocus: true,
  placement: { tools: 6 },
  onActivate(ctx) {
    const runId = `analyze-${Date.now().toString(36)}`;
    ctx.setTemplate({
      key: 'analyze',
      title: ctx.t('composer.analyze', 'Analyze data'),
      shortcut: '/analyze',
      icon: ANALYZE_ICON,
      hint: ctx.t('composer.analyzeHint', 'Calculate, chart and export'),
      systemPrompt: DATA_ANALYSIS_SYSTEM_PROMPT,
      body: '',
      runId,
      workflow: 'analyze',
    });
    ctx.publishAgentRun({
      runId,
      workflow: 'analyze',
      stage: 'planning',
      status: 'running',
      message: ctx.t('composer.analyze.planning', 'Preparing the analysis…'),
    });
    ctx.focusComposer();
  },
};
