import type { ExtensionDefinition } from '../types';

export const WEB_SEARCH_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>';

export const webSearchExtension: ExtensionDefinition = {
  key: 'webSearch',
  kind: 'toggle',
  nameKey: 'composer.tools.webSearch',
  nameFallback: 'Web search',
  descriptionKey: 'composer.tools.webSearchHint',
  descriptionFallback: 'Find current information on the web',
  icon: WEB_SEARCH_ICON,
  placement: { tools: 2 },
  onActivate(ctx) {
    ctx.toggleWebSearch?.();
    ctx.syncQuickChips?.();
  },
  onDeactivate(ctx) {
    ctx.toggleWebSearch?.();
    ctx.syncQuickChips?.();
  },
};
