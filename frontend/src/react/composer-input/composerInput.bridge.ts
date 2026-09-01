/**
 * Composer input bridge — M2 single-bridge migration.
 *
 * Legacy `main.js` and `ui/topicSetup.js` publish composer state through
 * `window.__socratesComposerInputBridge.publish(...)`. The factory owns
 * the snapshot/reducer loop; this module wraps it with the legacy alias
 * and React hooks.
 */

import { createImmutableBridge, useBridge, useBridgeSelector } from '../../lib/bridge';
import type {
  ComposerInputBridge,
  ComposerInputSnapshot,
} from './types';

declare global {
  interface Window {
    __socratesComposerInputBridge?: ComposerInputBridge;
  }
}

const INITIAL: ComposerInputSnapshot = Object.freeze({
  topicInput: '',
  chatInput: '',
  hasAttachments: false,
  isStreaming: false,
  isTopicSetup: true,
  reasoningEffort: 'medium',
  revision: 0,
});

type Action = Omit<ComposerInputSnapshot, 'revision'>;

const factoryBridge = createImmutableBridge<ComposerInputSnapshot, Action>({
  initial: INITIAL,
  reducer: (_state, action) => action,
});

const bridge: ComposerInputBridge = Object.assign(factoryBridge, {
  publish: factoryBridge.dispatch,
}) as ComposerInputBridge;

export function installComposerInputBridge(): ComposerInputBridge {
  if (typeof window !== 'undefined') {
    if (!window.__socratesComposerInputBridge) {
      window.__socratesComposerInputBridge = bridge;
    }
    return window.__socratesComposerInputBridge;
  }
  return bridge;
}

export function getComposerInputSnapshot(): ComposerInputSnapshot {
  return installComposerInputBridge().getSnapshot();
}

export function subscribeToComposerInput(listener: () => void): () => void {
  return installComposerInputBridge().subscribe(listener);
}

export function useComposerInputSnapshot(): ComposerInputSnapshot {
  return useBridge(factoryBridge);
}

export function useIsStreaming(): boolean {
  return useBridgeSelector(factoryBridge, (snapshot) => snapshot.isStreaming);
}

export function useIsTopicSetup(): boolean {
  return useBridgeSelector(factoryBridge, (snapshot) => snapshot.isTopicSetup);
}
