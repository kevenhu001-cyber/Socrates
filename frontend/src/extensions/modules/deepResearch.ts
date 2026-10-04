// frontend/src/extensions/modules/deepResearch.ts

import type { ExtensionDefinition } from '../types';

export const DEEP_RESEARCH_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/><path d="M8 11a3 3 0 0 1 6 0"/></svg>';

interface DeepResearchWindow {
  deepResearchOn?: boolean;
  _activeTemplate?: { extensionKey?: string } | null;
}

function dw(): DeepResearchWindow {
  return window as unknown as DeepResearchWindow;
}

/* Deep Research is a mode toggle, not a prompt template: when armed, the
 * next send routes through agent/researchAgent.js (plan → search → read →
 * report) instead of a normal chat turn. The template chip carries
 * extensionKey 'deepResearch', and chat/templateSlash.js's
 * EXTENSION_SIDE_EFFECTS flips window.deepResearchOn on set/clear — the
 * same contract webSearch and extensiveThinking already use. */
export const deepResearchExtension: ExtensionDefinition = {
  key: 'deepResearch',
  kind: 'toggle',
  nameKey: 'composer.deepResearch',
  nameFallback: 'Deep Research',
  descriptionKey: 'composer.deepResearchHint',
  descriptionFallback: 'Plan, search, read and report',
  hintKey: 'composer.deepResearch.hint',
  hintFallback: 'Enter a research topic above, then press send.',
  icon: DEEP_RESEARCH_ICON,
  placement: { tools: 3 },
  onActivate(ctx) {
    ctx.setTemplate({
      key: 'deepResearch',
      title: ctx.t('composer.deepResearch', 'Deep Research'),
      icon: DEEP_RESEARCH_ICON,
      hint: ctx.t('composer.deepResearch.hint', 'Enter a research topic above, then press send.'),
      systemPrompt: '',
      body: '',
    });
    ctx.syncQuickChips?.();
    ctx.focusComposer();
  },
  onDeactivate(ctx) {
    dw().deepResearchOn = false;
    const active = dw()._activeTemplate;
    if (active && active.extensionKey === 'deepResearch') {
      ctx.clearTemplate();
    }
    ctx.syncQuickChips?.();
  },
};
