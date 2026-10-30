import { useBridge } from '../../lib/bridge/useBridge.ts';
import { promptTemplatesState } from '../../ui/promptTemplatesState.ts';
import { getLegacyActions } from '../legacy/gateway.ts';
import type { PromptTemplatesSnapshot } from '../../ui/promptTemplatesState.ts';

export function getPromptTemplatesSnapshot(): PromptTemplatesSnapshot {
  return promptTemplatesState.getSnapshot();
}

export function subscribeToPromptTemplates(listener: () => void): () => void {
  return promptTemplatesState.subscribe(listener);
}

export function usePromptTemplatesSnapshot(): PromptTemplatesSnapshot {
  return useBridge(promptTemplatesState);
}

export function usePromptTemplatesDispatch(): { close: () => void } {
  return {
    close: () => getLegacyActions().navigation.closePromptTemplatesModal(),
  };
}
