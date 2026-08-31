/**
 * Prompt templates bridge — M2 single-bridge migration.
 *
 * `ui/promptTemplates.js` publishes through
 * `window.__socratesPromptTemplatesBridge.publish(...)`.
 */

import { createImmutableBridge, useBridge } from '../../lib/bridge';
import { getLegacyActions } from '../legacy/gateway';
import type {
  PromptTemplatesBridge,
  PromptTemplatesSnapshot,
} from './types';

declare global {
  interface Window {
    __socratesPromptTemplatesBridge?: PromptTemplatesBridge;
  }
}

type Action = Omit<PromptTemplatesSnapshot, 'revision'>;

const factoryBridge = createImmutableBridge<PromptTemplatesSnapshot, Action>({
  initial: { open: false, bodyHTML: '', revision: 0 },
  reducer: (state, action) => ({ ...action, revision: state.revision + 1 }),
});

const bridge: PromptTemplatesBridge = Object.assign(factoryBridge, {
  publish: factoryBridge.dispatch,
}) as PromptTemplatesBridge;

export function installPromptTemplatesBridge(): PromptTemplatesBridge {
  if (typeof window !== 'undefined') {
    if (!window.__socratesPromptTemplatesBridge) {
      window.__socratesPromptTemplatesBridge = bridge;
    }
    return window.__socratesPromptTemplatesBridge;
  }
  return bridge;
}

export function getPromptTemplatesSnapshot(): PromptTemplatesSnapshot {
  return installPromptTemplatesBridge().getSnapshot();
}

export function subscribeToPromptTemplates(listener: () => void): () => void {
  return installPromptTemplatesBridge().subscribe(listener);
}

export function usePromptTemplatesSnapshot(): PromptTemplatesSnapshot {
  return useBridge(factoryBridge);
}

export function usePromptTemplatesDispatch(): { close: () => void } {
  return {
    close: () => getLegacyActions().navigation.closePromptTemplatesModal(),
  };
}
