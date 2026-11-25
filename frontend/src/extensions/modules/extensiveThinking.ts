import { interfaceIcon } from '../../legacy/icons/interfaceIcons';
// frontend/src/extensions/modules/extensiveThinking.ts

import type { ExtensionDefinition } from '../types';
import { reportSwallow } from '../../util/reportSwallow.ts';
import { setExtensiveThinkingOn } from '../../config/providers.ts';
import { getActiveTemplate } from '../../chat/templateSystemPrompt.ts';

export const EXTENSIVE_THINKING_ICON = interfaceIcon('thinking', 18);

const STORAGE_KEY = 'socrates-extensive-thinking';

export const extensiveThinkingExtension: ExtensionDefinition = {
  key: 'extensiveThinking',
  kind: 'toggle',
  nameKey: 'effort.high.note',
  nameFallback: 'Extensive thinking',
  hintKey: 'effort.high.note',
  hintFallback: 'More deliberate reasoning',
  icon: EXTENSIVE_THINKING_ICON,
  systemPrompt: '',
  body: '',
  placement: { picker: 1 },
  onActivate(ctx) {
    setExtensiveThinkingOn(true);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(true));
    } catch (error) {
      reportSwallow(error, 'extensions/modules/extensiveThinking.ts:34', 'expected');
    }
    ctx.setTemplate({
      key: 'extensiveThinking',
      title: ctx.t('effort.high.note', 'Extensive thinking'),
      icon: EXTENSIVE_THINKING_ICON,
      hint: ctx.t('effort.high.note', 'More deliberate reasoning'),
      systemPrompt: '',
      body: '',
    });
  },
  onDeactivate(ctx) {
    setExtensiveThinkingOn(false);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(false));
    } catch (error) {
      reportSwallow(error, 'extensions/modules/extensiveThinking.ts:48', 'expected');
    }
    const active = getActiveTemplate();
    if (active && active.extensionKey === 'extensiveThinking') {
      ctx.clearTemplate();
    }
  },
};
