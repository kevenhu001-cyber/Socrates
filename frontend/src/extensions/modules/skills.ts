import { interfaceIcon } from '../../ui/icons/interfaceIcons';
// frontend/src/extensions/modules/skills.ts

import type { ExtensionDefinition } from '../types';

export const SKILLS_ICON = interfaceIcon('skills', 18);

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
