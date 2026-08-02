// frontend/src/extensions/modules/extensiveThinking.ts

import type { ExtensionDefinition } from '../types';

export const EXTENSIVE_THINKING_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v1H7a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2h1v1a3 3 0 0 0 3 3"/><path d="M12 22a3 3 0 0 0 3-3v-1h2a2 2 0 0 0 2-2v-1a2 2 0 0 0-2-2h-1v-1a3 3 0 0 0-3-3"/><circle cx="12" cy="12" r="1.5" opacity="0.5"/></svg>';

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
    } catch (_) {}
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
    } catch (_) {}
    const active = ew()._activeTemplate;
    if (active && active.extensionKey === 'extensiveThinking') {
      ctx.clearTemplate();
    }
  },
};
