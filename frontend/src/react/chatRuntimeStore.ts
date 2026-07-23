import type {
  ChatRuntimeEvent,
  ChatRuntimeSnapshot,
  ChatStreamSnapshot,
} from './types/domain';

type Listener = () => void;

interface LegacyChatMessage {
  clientId?: unknown;
  id?: unknown;
  role?: unknown;
  rawText?: unknown;
  type?: unknown;
}

interface LegacyChatState {
  phase?: unknown;
  currentSessionId?: unknown;
  messages?: unknown;
  session?: {
    phase?: unknown;
    currentSessionId?: unknown;
    messages?: unknown;
  };
}

export interface ChatRuntimeBridge {
  getSnapshot: () => ChatRuntimeSnapshot;
  publish: (event: ChatRuntimeEvent) => void;
  subscribe: (listener: Listener) => () => void;
}

declare global {
  interface Window {
    state?: LegacyChatState;
    __socratesReactChatBridge?: ChatRuntimeBridge;
  }
}

const listeners = new Set<Listener>();

const IDLE_STREAM: ChatStreamSnapshot = Object.freeze({
  messageId: null,
  status: 'idle',
  textLength: 0,
});

let snapshot: ChatRuntimeSnapshot = Object.freeze({
  revision: 0,
  currentSessionId: null,
  phase: 'topic',
  messageCount: 0,
  lastMessage: null,
  isStreaming: false,
  stream: IDLE_STREAM,
  lastEvent: 'state-synced',
});

let pendingDelta: Extract<ChatRuntimeEvent, { type: 'stream-delta' }> | null = null;
let pendingDeltaFrame = 0;

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readLegacyChatState(): {
  currentSessionId: string | null;
  phase: string;
  messages: LegacyChatMessage[];
} {
  const state = window.state;
  const session = state?.session;
  const messagesCandidate = session?.messages ?? state?.messages;

  return {
    currentSessionId: asString(session?.currentSessionId ?? state?.currentSessionId),
    phase: asString(session?.phase ?? state?.phase) ?? 'topic',
    messages: Array.isArray(messagesCandidate)
      ? (messagesCandidate as LegacyChatMessage[])
      : [],
  };
}

function streamFromEvent(
  event: ChatRuntimeEvent,
  messages: LegacyChatMessage[],
): ChatStreamSnapshot {
  switch (event.type) {
    case 'stream-started':
      return Object.freeze({
        messageId: event.messageId,
        status: 'streaming',
        textLength: 0,
      });
    case 'stream-delta':
      return Object.freeze({
        messageId: event.messageId,
        status: 'streaming',
        textLength: event.textLength,
      });
    case 'stream-finished':
      return Object.freeze({
        messageId: event.messageId,
        status: 'completed',
        textLength: event.textLength,
      });
    case 'stream-aborted':
      return Object.freeze({
        messageId: event.messageId,
        status: 'aborted',
        textLength: event.textLength,
      });
    case 'stream-failed':
      return Object.freeze({
        messageId: event.messageId,
        status: 'failed',
        textLength: event.textLength,
      });
    case 'message-added':
      return snapshot.stream;
    case 'state-synced': {
      let activeMessage: LegacyChatMessage | undefined;
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (messages[index].type === 'streaming') {
          activeMessage = messages[index];
          break;
        }
      }
      if (!activeMessage) {
        return IDLE_STREAM;
      }
      return Object.freeze({
        messageId: asString(activeMessage.clientId ?? activeMessage.id),
        status: 'streaming',
        textLength: typeof activeMessage.rawText === 'string'
          ? activeMessage.rawText.length
          : 0,
      });
    }
  }
}

function commit(event: ChatRuntimeEvent): void {
  const legacy = readLegacyChatState();
  const last = legacy.messages.length > 0
    ? legacy.messages[legacy.messages.length - 1]
    : undefined;
  const stream = streamFromEvent(event, legacy.messages);

  snapshot = Object.freeze({
    revision: snapshot.revision + 1,
    currentSessionId: legacy.currentSessionId,
    phase: legacy.phase,
    messageCount: legacy.messages.length,
    lastMessage: last
      ? Object.freeze({
          id: asString(last.clientId ?? last.id),
          role: asString(last.role),
        })
      : null,
    isStreaming: stream.status === 'streaming',
    stream,
    lastEvent: event.type,
  });

  listeners.forEach((listener) => listener());
}

function flushPendingDelta(): void {
  if (!pendingDelta) return;
  const event = pendingDelta;
  pendingDelta = null;
  if (pendingDeltaFrame) {
    window.cancelAnimationFrame(pendingDeltaFrame);
    pendingDeltaFrame = 0;
  }
  commit(event);
}

function publish(event: ChatRuntimeEvent): void {
  if (event.type === 'stream-delta') {
    pendingDelta = event;
    if (!pendingDeltaFrame) {
      pendingDeltaFrame = window.requestAnimationFrame(() => {
        pendingDeltaFrame = 0;
        flushPendingDelta();
      });
    }
    return;
  }

  // Preserve lifecycle ordering when a terminal event lands before the
  // animation frame scheduled for the final delta.
  flushPendingDelta();
  commit(event);
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const bridge: ChatRuntimeBridge = {
  getSnapshot: () => snapshot,
  publish,
  subscribe,
};

export function installChatRuntimeBridge(): ChatRuntimeBridge {
  const existing = window.__socratesReactChatBridge;
  if (existing) return existing;

  window.__socratesReactChatBridge = bridge;
  bridge.publish({ type: 'state-synced', reason: 'react-bootstrap' });
  return bridge;
}

export function getChatRuntimeSnapshot(): ChatRuntimeSnapshot {
  return installChatRuntimeBridge().getSnapshot();
}

export function subscribeToChatRuntime(listener: Listener): () => void {
  return installChatRuntimeBridge().subscribe(listener);
}
