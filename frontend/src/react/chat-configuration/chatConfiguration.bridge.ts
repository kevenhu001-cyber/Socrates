import { createImmutableBridge, useBridge } from '../../lib/bridge/index.ts';
import { getProviderConfigSnapshot } from '../../config/providerConfig.store.ts';
import { getStoredReasoningEffort, getStoredResponseSpeed } from '../../config/chatPreferences.ts';
import { restingRect } from '../../ui/pressFeedback.ts';
import type { ChatConfigurationBridge, ChatConfigurationSnapshot, ChatProviderOption } from './types';

declare global {
  interface Window { openSettings?: () => void }
}

type Action = Omit<ChatConfigurationSnapshot, 'revision'>;
let returnFocus: HTMLElement | null = null;

const factoryBridge = createImmutableBridge<ChatConfigurationSnapshot, Action>({
  initial: {
    open: false,
    providers: [],
    activeId: '',
    effort: 'medium',
    speed: 'standard',
    anchorRect: null,
    triggerId: null,
    revision: 0,
  },
  reducer: (_state, action) => action,
});

const bridge = Object.assign(factoryBridge, {
  publish: factoryBridge.dispatch,
}) as ChatConfigurationBridge;

export function installChatConfigurationBridge(): ChatConfigurationBridge {
  return bridge;
}

export function openChatConfiguration(trigger?: HTMLElement | null): void {
  const bridge = installChatConfigurationBridge();
  /* The pill toggles: a second tap on the same control dismisses instead of
     re-publishing an already-open popover. */
  if (bridge.getSnapshot().open) {
    closeChatConfiguration();
    return;
  }
  returnFocus = trigger || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  /* The trigger is still mid-press when its click opens the popover. */
  const rect = trigger ? restingRect(trigger) : null;
  const providerConfig = getProviderConfigSnapshot();
  const providers: ChatProviderOption[] = providerConfig.providers.map((provider) => ({
    id: provider.id,
    label: provider.label,
    model: provider.model,
    url: provider.url,
    isBuiltIn: provider.isBuiltIn,
    capabilities: provider.capabilities,
  }));
  installChatConfigurationBridge().publish({
    open: true,
    providers,
    activeId: String(providerConfig.activeId || ''),
    effort: getStoredReasoningEffort(),
    speed: getStoredResponseSpeed(),
    triggerId: trigger?.id || null,
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
    triggerId: null,
  });
  if (restoreFocus && returnFocus) {
    const target = returnFocus;
    window.setTimeout(() => target.focus({ preventScroll: true }), 0);
  }
  returnFocus = null;
}

export function useChatConfigurationSnapshot(): ChatConfigurationSnapshot {
  return useBridge(factoryBridge);
}
