// frontend/src/extensions/modules/deepResearch.ts

import type { ExtensionDefinition } from '../types';

export const DEEP_RESEARCH_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21l6-3 6 3 6-3V3l-6 3-6-3-6 3z"/><path d="M9 3v15"/><path d="M15 6v15"/></svg>';

export const deepResearchExtension: ExtensionDefinition = {
  key: 'deepResearch',
  kind: 'toggle',
  nameKey: 'composer.deepResearch',
  nameFallback: 'Deep research',
  descriptionKey: 'composer.deepResearchHint',
  descriptionFallback: 'Plan, search, read, report',
  hintKey: 'composer.deepResearchHint',
  hintFallback: 'Plan, search, read, report',
  icon: DEEP_RESEARCH_ICON,
  shortcut: '/deep-research',
  systemPrompt: '',
  body: '',
  autoFocus: true,
  autoLaunch: true,
  placement: { tools: 5, picker: 2 },
  onActivate(ctx) {
    ctx.setTemplate({
      key: 'deepResearch',
      title: ctx.t('composer.deepResearch', 'Deep research'),
      shortcut: '/deep-research',
      icon: DEEP_RESEARCH_ICON,
      hint: ctx.t('composer.deepResearchHint', 'Plan, search, read, report'),
      systemPrompt: '',
      body: '',
    });
    ctx.syncQuickChips?.();
    if (ctx.getMarkdown().trim() && ctx.launchDeepResearch) {
      ctx.launchDeepResearch();
    } else {
      ctx.focusComposer();
      ctx.toast(ctx.t('composer.deepResearch.hint', 'Enter a research topic above, then press send.'));
    }
  },
  onDeactivate(ctx) {
    ctx.syncQuickChips?.();
  },
};
