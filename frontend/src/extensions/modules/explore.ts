import { interfaceIcon } from '../../legacy/icons/interfaceIcons';
// frontend/src/extensions/modules/explore.ts

import type { ExtensionDefinition } from '../types';

export const EXPLORE_ICON = interfaceIcon('compass', 18);

export const EXPLORE_SYSTEM_PROMPT =
  'You are running the Explore workflow — a staged research system that turns an open question into a polished deliverable.\n\n' +
  'Stage 1 — Scope. Identify the question, the necessary sub-questions and the intended deliverable. Share a brief plan only when it helps the user.\n\n' +
  'Stage 2 — Search. When native web_search is supplied, use targeted queries for each sub-question, vary keywords, and use dates or freshness filters when relevant. Do not use one broad query for everything. Prefer primary sources and seek independent corroboration for each load-bearing claim. If the tool is unavailable, state that live verification was not performed, without quoting the tool error.\n\n' +
  'Stage 3 — Integrate. Reconcile the evidence: note where sources disagree, separate verified fact from inference, and label unsupported hypotheses as such and omit unsupported factual claims.\n\n' +
  'Stage 4 — Deliver. Answer the question directly. For substantial research, organize findings into meaningful sections, cite supporting sources near claims, and identify material uncertainties. If the user asked for a downloadable document and code_interpreter is supplied, use it to render the report and expose the artifact. Otherwise deliver the report directly in the chat and do not claim that a file was created.\n\n' +
  'Rules: never invent citations. Use the live tool budget; if evidence remains incomplete, deliver the supported findings and identify the gap. Keep intermediate commentary minimal — the report is the product.';

export const exploreExtension: ExtensionDefinition = {
  key: 'explore',
  kind: 'template',
  nameKey: 'composer.explore',
  nameFallback: 'Explore',
  descriptionKey: 'composer.exploreHint',
  descriptionFallback: 'Scope, batch search, report',
  hintKey: 'composer.exploreHint',
  hintFallback: 'Scope, batch search, report',
  icon: EXPLORE_ICON,
  shortcut: '/explore',
  systemPrompt: EXPLORE_SYSTEM_PROMPT,
  body: '',
  autoFocus: true,
  placement: { tools: 4 },
  onActivate(ctx) {
    const runId = `explore-${Date.now().toString(36)}`;
    ctx.setTemplate({
      key: 'explore',
      title: ctx.t('composer.explore', 'Explore'),
      shortcut: '/explore',
      icon: EXPLORE_ICON,
      hint: ctx.t('composer.exploreHint', 'Scope, batch search, report'),
      systemPrompt: EXPLORE_SYSTEM_PROMPT,
      body: '',
      runId,
      workflow: 'explore',
    });
    ctx.publishAgentRun({
      runId,
      workflow: 'explore',
      stage: 'planning',
      status: 'running',
      message: ctx.t('composer.explore.planning', 'Scoping the question…'),
    });
    ctx.focusComposer();
  },
};
