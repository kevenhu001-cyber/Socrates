import { interfaceIcon } from '../../ui/icons/interfaceIcons';
// frontend/src/extensions/modules/explore.ts

import type { ExtensionDefinition } from '../types';

export const EXPLORE_ICON = interfaceIcon('compass', 18);

export const EXPLORE_SYSTEM_PROMPT =
  'You are running the Explore workflow — a staged research system that turns an open question into a polished deliverable.\n\n' +
  'Stage 1 — Scope. In one short paragraph, restate the question precisely, list the 3-6 sub-questions that must be answered to cover it, and name the deliverable you will produce.\n\n' +
  'Stage 2 — Search. When native web_search is supplied, use targeted queries for each sub-question, vary keywords, and include the current year for anything time-sensitive. Do not use one broad query for everything. Prefer primary sources and seek independent corroboration for each load-bearing claim. If the tool is unavailable, state that live verification was not performed.\n\n' +
  'Stage 3 — Integrate. Reconcile the evidence: note where sources disagree, separate verified fact from inference, and discard anything that cannot be attributed to a source.\n\n' +
  'Stage 4 — Deliver. Produce a structured report with a title, short executive summary, one section per sub-question, a \'What remains uncertain\' section, and a sources list. If the user asked for a downloadable document and code_interpreter is supplied, use it to render the report and expose the artifact. Otherwise deliver the report directly in the chat and do not claim that a file was created.\n\n' +
  'Rules: never invent citations. If the topic genuinely needs more than about 10 searches, say so and propose splitting it. Keep intermediate commentary minimal — the report is the product.';

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
    ctx.syncQuickChips?.();
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
