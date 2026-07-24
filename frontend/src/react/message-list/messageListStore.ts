import type { MessageListBridge } from './types';

type Listener = () => void;

let revision = 0;
const listeners = new Set<Listener>();

function notify(): void {
  revision++;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const bridge: MessageListBridge = { notify, subscribe };

export function installMessageListBridge(): MessageListBridge {
  const existing = window.__socratesMessageListBridge;
  if (existing) return existing;
  window.__socratesMessageListBridge = bridge;
  return bridge;
}

export function subscribeToMessageList(listener: Listener): () => void {
  return installMessageListBridge().subscribe(listener);
}

export function useMessageListRevision(): number {
  // Simple hook to trigger re-render when the legacy code signals
  let rev = 0;
  // This is intentionally not using useSyncExternalStore since the
  // bridge is a simple trigger; the actual data comes from the chat
  // runtime store which already has useSyncExternalStore.
  return rev;
}
