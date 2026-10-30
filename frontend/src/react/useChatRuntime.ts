import { useBridge, useBridgeSelector } from '../lib/bridge/useBridge';
import {
  chatRuntimeStore,
  getChatRuntimeSnapshot,
  subscribeToChatRuntime,
} from '../ui/chatRuntimeStore';
import type { ChatRuntimeSnapshot, ChatStreamStatus } from './types/domain';

const chatRuntimeImmutableBridge = chatRuntimeStore;

export function useChatRuntimeSnapshot(): ChatRuntimeSnapshot {
  return useBridge(chatRuntimeImmutableBridge);
}

/**
 * The compatibility root only needs the stream activity bit. Returning the
 * derived primitive keeps delta publications from re-rendering the root.
 */
export function useIsChatStreaming(): boolean {
  return useBridgeSelector(
    chatRuntimeImmutableBridge,
    (snapshot) => snapshot.isStreaming,
  );
}

export function useChatStreamStatus(): ChatStreamStatus {
  return useBridgeSelector(
    chatRuntimeImmutableBridge,
    (snapshot) => snapshot.stream.status,
  );
}

export { getChatRuntimeSnapshot, subscribeToChatRuntime };
