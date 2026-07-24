import { useSyncExternalStore } from 'react';
import { getPromptTemplatesSnapshot, subscribeToPromptTemplates } from './promptTemplatesStore';
import type { PromptTemplatesSnapshot } from './types';

export function usePromptTemplatesSnapshot(): PromptTemplatesSnapshot {
  return useSyncExternalStore(subscribeToPromptTemplates, getPromptTemplatesSnapshot, getPromptTemplatesSnapshot);
}

export function usePromptTemplatesDispatch() {
  return {
    close: () => { if (typeof window.closePromptTemplatesModal === 'function') window.closePromptTemplatesModal(); },
  };
}
