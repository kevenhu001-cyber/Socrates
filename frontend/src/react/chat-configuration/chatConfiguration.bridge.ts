import { createImmutableBridge, useBridge } from '../../lib/bridge/index.ts';
import { getLegacyGlobalValue } from '../legacy/gateway.ts';
import { getStoredReasoningEffort, getStoredResponseSpeed } from '../../config/chatPreferences.ts';
import { restingRect } from '../../ui/pressFeedback.js';
import type { ChatConfigurationBridge, ChatConfigurationSnapshot, ChatProviderOption } from './types';

declare global {
  interface Window {
    __socratesChatConfigurationBridge?: ChatConfigurationBridge;
    apiConfig?: { activeId?: string; providers?: ChatProviderOption[] };
    syncEffortUI?: () => void;
    openSettings?: () => void;
  }
}

type Action = Omit<ChatConfigurationSnapshot, 'revision'>;
let returnFocus: HTMLElement | null = null;
let openTrigger: HTMLElement | null = null;

const factoryBridge = createImmutableBridge<ChatConfigurationSnapshot, Action>({
  initial: {
    open: false,
    providers: [],
    activeId: '',
    effort: 'medium',
    speed: 'standard',
    anchorRect: null,
    revision: 0,
  },
  reducer: (_state, action) => action,
});

export function installChatConfigurationBridge(): ChatConfigurationBridge {
  if (!window.__socratesChatConfigurationBridge) {
    window.__socratesChatConfigurationBridge = Object.assign(factoryBridge, {
      publish: factoryBridge.dispatch,
    }) as ChatConfigurationBridge;
  }
  return window.__socratesChatConfigurationBridge;
}

export function openChatConfiguration(trigger?: HTMLElement | null): void {
  const bridge = installChatConfigurationBridge();
  /* The pill toggles: a second tap on the same control dismisses instead of
     re-publishing an already-open popover. */
  if (bridge.getSnapshot().open) {
    closeChatConfiguration();
    return;
  }
  const config = getLegacyGlobalValue('apiConfig', {} as { activeId?: string; providers?: ChatProviderOption[] });
  returnFocus = trigger || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  /* The trigger is still mid-press when its click opens the popover. */
  const rect = trigger ? restingRect(trigger) : null;
  openTrigger = trigger || null;
  openTrigger?.setAttribute('aria-expanded', 'true');
  installChatConfigurationBridge().publish({
    open: true,
    providers: Array.isArray(config.providers) ? config.providers.map((provider) => ({ ...provider })) : [],
    activeId: String(config.activeId || ''),
    effort: getStoredReasoningEffort(),
    speed: getStoredResponseSpeed(),
    anchorRect: rect
      ? { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }
      : null,
  });
}

export function closeChatConfiguration(restoreFocus = true): void {
  const current = installChatConfigurationBridge().getSnapshot();
  installChatConfigurationBridge().publish({
    open: false,
    providers: current.providers,
    activeId: current.activeId,
    effort: current.effort,
    speed: current.speed,
    anchorRect: current.anchorRect,
  });
  openTrigger?.setAttribute('aria-expanded', 'false');
  openTrigger = null;
  if (restoreFocus && returnFocus) {
    const target = returnFocus;
    window.setTimeout(() => target.focus({ preventScroll: true }), 0);
  }
  returnFocus = null;
}

export function useChatConfigurationSnapshot(): ChatConfigurationSnapshot {
  return useBridge(factoryBridge);
}
