import { useSyncExternalStore } from 'react';
import { getPromptTemplatesSnapshot, subscribeToPromptTemplates } from './promptTemplatesStore';
import type { PromptTemplatesSnapshot } from './types';
import { getLegacyActions } from '../legacy/gateway';

export function usePromptTemplatesSnapshot(): PromptTemplatesSnapshot {
  return useSyncExternalStore(subscribeToPromptTemplates, getPromptTemplatesSnapshot, getPromptTemplatesSnapshot);
}

export function usePromptTemplatesDispatch() {
  return {
    close: () => getLegacyActions().navigation.closePromptTemplatesModal(),
  };
}
