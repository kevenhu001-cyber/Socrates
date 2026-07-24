import { useSyncExternalStore } from 'react';

import {
  getComposerInputSnapshot,
  subscribeToComposerInput,
} from './composerInputStore';
import type { ComposerInputSnapshot } from './types';

export function useComposerInputSnapshot(): ComposerInputSnapshot {
  return useSyncExternalStore(
    subscribeToComposerInput,
    getComposerInputSnapshot,
    getComposerInputSnapshot,
  );
}

export function useIsStreaming(): boolean {
  return useSyncExternalStore(
    subscribeToComposerInput,
    () => getComposerInputSnapshot().isStreaming,
    () => getComposerInputSnapshot().isStreaming,
  );
}

export function useIsTopicSetup(): boolean {
  return useSyncExternalStore(
    subscribeToComposerInput,
    () => getComposerInputSnapshot().isTopicSetup,
    () => getComposerInputSnapshot().isTopicSetup,
  );
}
