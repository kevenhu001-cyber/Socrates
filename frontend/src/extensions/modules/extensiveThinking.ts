import { interfaceIcon } from '../../ui/icons/interfaceIcons';
// frontend/src/extensions/modules/extensiveThinking.ts

import type { ExtensionDefinition } from '../types';
import { reportSwallow } from '../../util/reportSwallow.ts';

export const EXTENSIVE_THINKING_ICON = interfaceIcon('thinking', 18);

const STORAGE_KEY = 'socrates-extensive-thinking';

interface ExtensiveThinkingWindow {
  extensiveThinkingOn?: boolean;
  _activeTemplate?: { extensionKey?: string } | null;
}

function ew(): ExtensiveThinkingWindow {
  return window as unknown as ExtensiveThinkingWindow;
}

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
    ew().extensiveThinkingOn = true;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(true));
    } catch (error) { reportSwallow(error, 'extensions/modules/extensiveThinking.ts:34', 'expected'); }
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
    ew().extensiveThinkingOn = false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(false));
    } catch (error) { reportSwallow(error, 'extensions/modules/extensiveThinking.ts:48', 'expected'); }
    const active = ew()._activeTemplate;
    if (active && active.extensionKey === 'extensiveThinking') {
      ctx.clearTemplate();
    }
  },
};
