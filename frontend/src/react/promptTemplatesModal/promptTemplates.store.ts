import { useBridge } from '../../store/useBridge.ts';
import { promptTemplatesState } from '../../legacy/promptTemplatesState.ts';
import { getLegacyActions } from '../legacy/gateway.ts';
import type { PromptTemplatesSnapshot } from '../../legacy/promptTemplatesState.ts';

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
