import { interfaceIcon } from '../../ui/icons/interfaceIcons';
import type { ExtensionDefinition } from '../types';

export const WEB_SEARCH_ICON = interfaceIcon('globe', 18);

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
  },
  onDeactivate(ctx) {
    ctx.toggleWebSearch?.();
  },
};
