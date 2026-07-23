import { useSyncExternalStore } from 'react';

import {
  getChatRuntimeSnapshot,
  subscribeToChatRuntime,
} from './chatRuntimeStore';
import type { ChatRuntimeSnapshot } from './types/domain';
import type { ChatStreamStatus } from './types/domain';

export function useChatRuntimeSnapshot(): ChatRuntimeSnapshot {
  return useSyncExternalStore(
    subscribeToChatRuntime,
    getChatRuntimeSnapshot,
    getChatRuntimeSnapshot,
  );
}

/**
 * The compatibility root only needs the stream activity bit. Returning the
 * derived primitive keeps delta publications from re-rendering the root.
 */
export function useIsChatStreaming(): boolean {
  return useSyncExternalStore(
    subscribeToChatRuntime,
    () => getChatRuntimeSnapshot().isStreaming,
    () => false,
  );
}

export function useChatStreamStatus(): ChatStreamStatus {
  return useSyncExternalStore(
    subscribeToChatRuntime,
    () => getChatRuntimeSnapshot().stream.status,
    () => 'idle',
  );
}
