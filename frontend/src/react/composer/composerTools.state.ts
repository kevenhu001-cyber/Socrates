import { create } from 'zustand';
import type { ComposerToolsSnapshot } from './types';

type ComposerToolsUpdate = Omit<ComposerToolsSnapshot, 'revision'>;

export const useComposerToolsState = create<ComposerToolsSnapshot>(() => ({
  isOpen: false,
  mode: null,
  triggerId: null,
  revision: 0,
}));

export function getComposerToolsSnapshot(): ComposerToolsSnapshot {
  return useComposerToolsState.getState();
}

export function publishComposerToolsState(update: ComposerToolsUpdate): void {
  useComposerToolsState.setState((state) => ({ ...update, revision: state.revision + 1 }));
}
