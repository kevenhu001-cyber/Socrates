// frontend/src/extensions/modules/skills.ts

import type { ExtensionDefinition } from '../types';

export const SKILLS_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><path d="M17 14v6M14 17h6"/></svg>';

export const skillsExtension: ExtensionDefinition = {
  key: 'skills',
  kind: 'action',
  nameKey: 'composer.menu.skills',
  nameFallback: 'Your workflows',
  descriptionKey: 'composer.menu.skillsHint',
  descriptionFallback: 'Create your own',
  hintKey: 'composer.menu.skillsHint',
  hintFallback: 'Create your own',
  icon: SKILLS_ICON,
  placement: { tools: 8 },
  onActivate(ctx) {
    ctx.openPromptTemplatesModal?.();
  },
};
