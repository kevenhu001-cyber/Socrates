/**
 * Message-list bridge — M2 single-bridge migration.
 *
 * Historical dead-code path: the original `messageListStore.ts` exposed
 * `__socratesMessageListBridge` with a `notify()` trigger, but the
 * actual React message list subscribes to the chat runtime bridge
 * (`useChatRuntimeSnapshot`) — `messageListStore.ts` had no production
 * callers. The contract stays here for parity with M1 / module
 * symmetry; a future migration can simply delete it.
 *
 * M2 conventions
 *  - The factory owns the snapshot/reducer/listener loop.
 *  - `notify()` maps to `dispatch({ type: 'notify' })` so the reducer
 *    bumps the revision and subscribers re-render.
 */

import { createImmutableBridge, useBridgeSelector } from '../../lib/bridge';
import type { MessageListBridge } from './types';

declare global {
  interface Window {
    __socratesMessageListBridge?: MessageListBridge;
  }
}

interface MessageListState {
  revision: number;
}

const factoryBridge = createImmutableBridge<MessageListState, { type: 'notify' }>({
  initial: { revision: 0 },
  reducer: (state) => ({ ...state }),
});

const bridge: MessageListBridge = Object.assign(factoryBridge, {
  notify: () => factoryBridge.dispatch({ type: 'notify' }),
}) as MessageListBridge;

export function installMessageListBridge(): MessageListBridge {
  if (typeof window !== 'undefined') {
    if (!window.__socratesMessageListBridge) {
      window.__socratesMessageListBridge = bridge;
    }
    return window.__socratesMessageListBridge;
  }
  return bridge;
}

export function subscribeToMessageList(listener: () => void): () => void {
  return installMessageListBridge().subscribe(listener);
}

export function useMessageListRevision(): number {
  return useBridgeSelector(factoryBridge, (snapshot) => snapshot.revision);
}
