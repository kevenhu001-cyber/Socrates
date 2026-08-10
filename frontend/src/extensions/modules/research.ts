// frontend/src/extensions/modules/research.ts

import type { ExtensionDefinition } from '../types';

const SEARCH_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>';

export const SOURCE_RESEARCH_SYSTEM_PROMPT =
  "You are in source-research mode. Turn the user's question into a focused evidence task.\n\n" +
  'Workflow:\n' +
  '1. Identify the exact claim, date range, geography, and decision the user needs.\n' +
  '2. When native web_search is supplied, use it for current or externally verifiable facts. Prefer primary sources and independent corroboration. If it is unavailable, say that live verification was not performed.\n' +
  '3. Compare sources, call out disagreements, and separate verified facts from inference.\n' +
  "4. Return a concise synthesis with linked sources and a short 'What remains uncertain' note when material gaps remain.\n\n" +
  'Never invent citations or imitate tool-call JSON. If the request actually needs a broad multi-stage review, recommend Deep research rather than pretending one search is exhaustive.';

export const researchExtension: ExtensionDefinition = {
  key: 'research',
  kind: 'template',
  nameKey: 'composer.research',
  nameFallback: 'Find sources',
  descriptionKey: 'composer.researchHint',
  descriptionFallback: 'Search and compare evidence',
  hintKey: 'composer.researchHint',
  hintFallback: 'Search and compare evidence',
  icon: SEARCH_ICON,
  shortcut: '/research',
  systemPrompt: SOURCE_RESEARCH_SYSTEM_PROMPT,
  body: '',
  autoFocus: true,
  placement: { tools: 3 },
  onActivate(ctx) {
    const runId = `research-${Date.now().toString(36)}`;
    ctx.setTemplate({
      key: 'research',
      title: ctx.t('composer.research', 'Find sources'),
      shortcut: '/research',
      icon: SEARCH_ICON,
      hint: ctx.t('composer.researchHint', 'Search and compare evidence'),
      systemPrompt: SOURCE_RESEARCH_SYSTEM_PROMPT,
      body: '',
      runId,
      workflow: 'research',
    });
    ctx.syncQuickChips?.();
    ctx.publishAgentRun({
      runId,
      workflow: 'research',
      stage: 'planning',
      status: 'running',
      message: ctx.t('composer.research.planning', 'Preparing the search strategy…'),
    });
    ctx.focusComposer();
  },
};
