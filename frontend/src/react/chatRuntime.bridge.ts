/**
 * Chat runtime bridge — M2 single-bridge migration.
 *
 * Carries the runtime snapshot that the React message list, the chat
 * composer, and the send-button indicator all subscribe to. The legacy
 * pipeline mutates `window.stateStore.read("messages")` in place; this bridge
 * re-reads it on every commit so React sees the latest text, tool
 * results, and streaming bubble.
 *
 * Why this bridge does not use `createImmutableBridge` directly
 *  - The factory coalesces dispatches per animation frame, but only
 *    keeps the LAST pending action. The chat runtime needs two parallel
 *    coalescing queues (stream deltas and tool-run updates), both of
 *    which must commit each frame even when interleaved.
 *  - Terminal events (stream-finished / aborted / failed) must flush
 *    any pending delta/tool-run updates BEFORE they commit, otherwise
 *    a fast final frame would lose the last visible character or tool
 *    row.
 *  - The legacy chatRuntimeStore contract — and the existing
 *    `chatRuntimeStore.test.mjs` — assert exactly this two-queue
 *    behaviour. We preserve the custom RAF loop here and still expose
 *    the factory-shaped bridge interface (`getSnapshot`, `dispatch`,
 *    `subscribe`) so React hooks can use `useBridge(bridge)`.
 *
 * M2 conventions
 *  - `dispatch` and `publish` both route through the same RAF loop;
 *    `publish` is the legacy alias `main.js` and friends still call.
 *  - React subscribers use `useBridge(bridge)` directly.
 *  - The window-published bridge exposes `publish` for legacy callers
 *    (`window.__socratesReactChatBridge.publish(event)`).
 */

import type { ImmutableBridge } from '../lib/bridge/createImmutableBridge.ts';
import { useBridge } from '../lib/bridge/useBridge.ts';
import { stateStore } from '../state/store.js';
import type {
  ChatRuntimeEvent,
  ChatRuntimeSnapshot,
  ChatStreamSnapshot,
  LegacyChatMessage,
} from './types/domain';

type Listener = () => void;

declare global {
  interface Window {
    __socratesReactChatBridge?: ChatRuntimeBridge;
  }
}

/**
 * Legacy bridge interface — `main.js` and `chatRuntimeStore.test.mjs`
 * both call `.publish(event)` on `window.__socratesReactChatBridge`.
 * The shape mirrors the pre-M2 contract so legacy code stays
 * untouched.
 */
export interface ChatRuntimeBridge {
  getSnapshot: () => ChatRuntimeSnapshot;
  publish: (event: ChatRuntimeEvent) => void;
  subscribe: (listener: Listener) => () => void;
}

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
  messages: Object.freeze([] as ReadonlyArray<LegacyChatMessage>),
  lastMessage: null,
  isStreaming: false,
  stream: IDLE_STREAM,
  lastEvent: 'state-synced',
});

const listeners = new Set<Listener>();

let pendingDelta: Extract<ChatRuntimeEvent, { type: 'stream-delta' }> | null = null;
/* Tool state can change on more than one message at a time (a retry while a
   new turn streams), so the coalesced set is keyed by message id. */
let pendingToolRuns: Set<string> | null = null;
let pendingDeltaFrame = 0;

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readChatState(): {
  currentSessionId: string | null;
  phase: string;
  messages: LegacyChatMessage[];
} {
  const messagesCandidate = stateStore.read('messages');

  return {
    currentSessionId: asString(stateStore.read('currentSessionId')),
    phase: asString(stateStore.read('phase')) ?? 'topic',
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
    case 'tool-run-updated':
      /* A tool lifecycle change is not a text-streaming change: the stream
         keeps whatever status the last stream-* event gave it. */
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
  const legacy = readChatState();
  const last = legacy.messages.length > 0
    ? legacy.messages[legacy.messages.length - 1]
    : undefined;
  const stream = streamFromEvent(event, legacy.messages);

  snapshot = Object.freeze({
    revision: snapshot.revision + 1,
    currentSessionId: legacy.currentSessionId,
    phase: legacy.phase,
    messageCount: legacy.messages.length,
    messages: Object.freeze(
      [...legacy.messages] as ReadonlyArray<LegacyChatMessage>,
    ),
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

function cancelFrame(handle: number): void {
  if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(handle);
  }
}

function requestFrame(cb: () => void): number {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    return window.requestAnimationFrame(cb);
  }
  // JSDOM / Node test fallback — commit on next macrotask.
  return setTimeout(cb, 0) as unknown as number;
}

function flushPendingDelta(): void {
  if (!pendingDelta) return;
  const event = pendingDelta;
  pendingDelta = null;
  if (pendingDeltaFrame) {
    cancelFrame(pendingDeltaFrame);
    pendingDeltaFrame = 0;
  }
  commit(event);
}

function scheduleFrame(): void {
  if (pendingDeltaFrame) return;
  pendingDeltaFrame = requestFrame(() => {
    pendingDeltaFrame = 0;
    flushPendingDelta();
    flushPendingToolRuns();
  });
}

/**
 * Tool lifecycle events arrive faster than a person can read them (a code run
 * emits progress on every output flush). Both the text tail and the row state
 * are re-read from `state.messages` at commit time, so one repaint per frame
 * is enough for the whole turn — same trick `stream-delta` uses.
 */
function flushPendingToolRuns(): void {
  if (!pendingToolRuns || pendingToolRuns.size === 0) {
    pendingToolRuns = null;
    return;
  }
  const ids = [...pendingToolRuns];
  pendingToolRuns = null;
  for (const messageId of ids) {
    commit({ type: 'tool-run-updated', messageId });
  }
}

function publish(event: ChatRuntimeEvent): void {
  if (event.type === 'stream-delta') {
    pendingDelta = event;
    scheduleFrame();
    return;
  }
  if (event.type === 'tool-run-updated') {
    if (!pendingToolRuns) pendingToolRuns = new Set<string>();
    pendingToolRuns.add(event.messageId);
    scheduleFrame();
    return;
  }

  // Preserve lifecycle ordering when a terminal event lands before the
  // animation frame scheduled for the final delta.
  flushPendingDelta();
  flushPendingToolRuns();
  commit(event);
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/* The bridge conforms to the M1 `ImmutableBridge` shape (getSnapshot /
   dispatch / subscribe / flush / __resetForTests) plus the legacy
   `publish` alias so window-published bridges still expose the original
   contract. */
const chatRuntimeBridge: ImmutableBridge<ChatRuntimeSnapshot, ChatRuntimeEvent> & {
  publish: (event: ChatRuntimeEvent) => void;
  __resetForTests: () => void;
} = {
  getSnapshot: () => snapshot,
  dispatch: publish,
  publish,
  subscribe,
  flush: () => {
    flushPendingDelta();
    flushPendingToolRuns();
  },
  __resetForTests: () => {
    snapshot = Object.freeze({
      revision: 0,
      currentSessionId: null,
      phase: 'topic',
      messageCount: 0,
      messages: Object.freeze([] as ReadonlyArray<LegacyChatMessage>),
      lastMessage: null,
      isStreaming: false,
      stream: IDLE_STREAM,
      lastEvent: 'state-synced',
    });
    pendingDelta = null;
    pendingToolRuns = null;
    if (pendingDeltaFrame) {
      window.cancelAnimationFrame(pendingDeltaFrame);
      pendingDeltaFrame = 0;
    }
    listeners.forEach((listener) => listener());
  },
};

export function installChatRuntimeBridge(): ChatRuntimeBridge {
  const existing = window.__socratesReactChatBridge;
  if (existing) return existing;

  const bridge: ChatRuntimeBridge = {
    getSnapshot: chatRuntimeBridge.getSnapshot,
    publish: chatRuntimeBridge.publish,
    subscribe: chatRuntimeBridge.subscribe,
  };
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

/**
 * Direct access to the bridge for React subscribers via `useBridge`.
 * The factory's `useBridge` expects an `ImmutableBridge`, which the
 * custom bridge above already conforms to.
 */
export const chatRuntimeImmutableBridge: ImmutableBridge<
  ChatRuntimeSnapshot,
  ChatRuntimeEvent
> = chatRuntimeBridge;

export function useChatRuntimeSnapshot(): ChatRuntimeSnapshot {
  return useBridge(chatRuntimeBridge);
}
