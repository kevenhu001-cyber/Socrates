import { useStore } from 'zustand';
import { composerLifecycleStore } from '../../composer/lifecycle.store.ts';
import type { ComposerSurface } from '../../composer/types.ts';

export function useComposerSurface(): ComposerSurface {
  return useStore(composerLifecycleStore, (state) => state.surface);
}
