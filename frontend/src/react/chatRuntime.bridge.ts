/**
 * Chat runtime bridge — M2 single-bridge migration.
 *
 * Carries the runtime snapshot that the React message list, the chat
 * composer, and the send-button indicator all subscribe to. The session
 * domain now publishes recursively frozen message rows; this bridge adds the
 * stream lifecycle snapshot and keeps a defensive path for compatibility data.
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
import { getStreamRenderInterval } from '../render/streaming.ts';
import { stateStore } from '../state/store.ts';
import { reconcileMessageSnapshots } from './chatRuntimeSnapshot.ts';
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
/* P_bridge-coalesce-lifecycle — `message-added` and `stream-started` arrive
   back-to-back on the click frame from chat/messages.js + chat/streamingTurn.ts.
   The synchronous `commit()` pair used to fire two `Object.freeze` walks over
   the message list and two listener notifications back-to-back. Queue them
   until the next animation frame and commit them there, so the click frame
   pays one rAF instead of two snapshot walks. Terminal events drain this
   queue before committing so lifecycle ordering survives.

   The queue keeps ONE SLOT PER EVENT TYPE. A single slot where the later
   event overwrote the earlier one was equivalent to the synchronous pair only
   for the FINAL snapshot — it dropped one listener notification, so a
   subscriber that samples `lastEvent` never saw `message-added` when the
   pair landed in the same frame. That race is observable: the legacy
   lifecycle contract requires both events to be seen, and
   e2e/react-compat.spec.mjs asserts it.

   One slot per TYPE, not one slot per event: a transcript that grows by a
   dozen messages in one frame publishes a dozen `message-added` events, and
   committing each of them would walk the whole message list a dozen times
   in one frame — that is the cost the single slot was there to avoid. The
   newest event of a type wins (the older ones describe rows the snapshot
   already carries), while the slot keeps its position so publication order
   survives. */
const pendingLifecycle: ChatRuntimeEvent[] = [];
/* Arrival order for the two queues. `message-added`/`stream-started` and
   `tool-run-updated` can land in the same frame; flushing them in a fixed
   order (tool runs first, lifecycle second) made `lastEvent` report the
   older event. Track a monotonic sequence so the frame drains them in the
   order they were published. The lifecycle group is positioned by its FIRST
   queued event, so a tool run published between two lifecycle events still
   drains after the whole group. */
let pendingLifecycleSeq = 0;
let pendingToolRunsSeq = 0;
let eventSeq = 0;
let pendingDeltaFrame = 0;
/* P_stream-paint-cadence — deltas used to commit once per rAF (up to 60
   repaints/sec), which made the adaptive getStreamRenderInterval() cadence
   dead code: it paced the state mirror but not the paint path. Each commit
   re-parses the markdown tail, so at 60fps the main thread can lose too much
   frame budget on long answers. Delta commits are gated by the same interval:
   the first paint is immediate, and subsequent ones are paced at ~20/12/8fps
   by answer length. */
let pendingDeltaTimer: ReturnType<typeof setTimeout> | null = null;
let lastDeltaCommitAt = 0;

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
    case 'stream-retry-replaced':
      /* The failed row was removed from session state immediately before this
         event. Clear its terminal stream record until the replacement stream
         publishes its own stream-started event. */
      return IDLE_STREAM;
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

function changedMessageIdsForEvent(event: ChatRuntimeEvent): ReadonlySet<string> | null {
  if (event.type === 'state-synced') return null;
  return new Set([event.messageId]);
}

function commit(
  event: ChatRuntimeEvent,
  changedMessageIds: ReadonlySet<string> | null = changedMessageIdsForEvent(event),
): void {
  const legacy = readChatState();
  const messages = reconcileMessageSnapshots(
    snapshot.messages,
    legacy.messages,
    changedMessageIds,
  );
  const last = messages.length > 0 ? messages[messages.length - 1] : undefined;
  const stream = streamFromEvent(event, legacy.messages);

  snapshot = Object.freeze({
    revision: snapshot.revision + 1,
    currentSessionId: legacy.currentSessionId,
    phase: legacy.phase,
    messageCount: messages.length,
    messages,
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

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function deltaDue(): boolean {
  if (!pendingDelta) return true;
  if (!lastDeltaCommitAt) return true;
  return nowMs() - lastDeltaCommitAt >= getStreamRenderInterval(pendingDelta.textLength);
}

function clearDeltaTimer(): void {
  if (pendingDeltaTimer !== null) {
    clearTimeout(pendingDeltaTimer);
    pendingDeltaTimer = null;
  }
}

function flushPendingDelta(): void {
  if (!pendingDelta) return;
  const event = pendingDelta;
  pendingDelta = null;
  clearDeltaTimer();
  if (pendingDeltaFrame) {
    cancelFrame(pendingDeltaFrame);
    pendingDeltaFrame = 0;
  }
  lastDeltaCommitAt = nowMs();
  commit(event);
}

function scheduleFrame(): void {
  if (pendingDeltaFrame) return;
  pendingDeltaFrame = requestFrame(() => {
    pendingDeltaFrame = 0;
    /* A tool-run commit must not smuggle an early delta paint past the
       cadence gate — the delta stays pending until its own deadline. */
    if (deltaDue()) {
      flushPendingDelta();
    } else if (pendingDelta) {
      /* The pending delta grew past a cadence boundary since its timer was
         armed (a longer textLength raises the interval). Re-arm so a mid-
         stream stall cannot leave the last paint until the next
         event happens to arrive. */
      scheduleDeltaFlush(pendingDelta);
    }
    flushQueuedCommits();
  });
}

/**
 * Drain the lifecycle and tool-run queues in publication order. Both queues
 * coalesce independently, so a single frame may hold one of each; committing
 * them in a fixed order would make the snapshot's `lastEvent` depend on the
 * queue implementation rather than on what actually happened last.
 */
function flushQueuedCommits(): void {
  const queued: Array<{ seq: number; flush: () => void }> = [];
  if (pendingLifecycle.length > 0) {
    queued.push({ seq: pendingLifecycleSeq, flush: flushPendingLifecycle });
  }
  if (pendingToolRuns && pendingToolRuns.size > 0) {
    queued.push({ seq: pendingToolRunsSeq, flush: flushPendingToolRuns });
  }
  queued.sort((a, b) => a.seq - b.seq);
  for (const entry of queued) entry.flush();
}

/**
 * Queue a lifecycle event, keeping one slot per event type. The newest event
 * of a type replaces the one already queued (its messageId is the freshest),
 * but the slot keeps its position so publication order survives.
 */
function queueLifecycleEvent(event: ChatRuntimeEvent): void {
  const existing = pendingLifecycle.findIndex((queued) => queued.type === event.type);
  if (existing >= 0) {
    pendingLifecycle[existing] = event;
    return;
  }
  pendingLifecycle.push(event);
}

/**
 * Drain the queued lifecycle events (message-added / stream-started) in
 * publication order. Every queued type gets its own commit, so a subscriber
 * observes each one — a subscriber that samples `lastEvent` must see
 * `message-added` even when the pair lands in the same frame. No-op when the
 * queue is empty so the rAF callback above can call this unconditionally.
 */
function flushPendingLifecycle(): void {
  if (pendingLifecycle.length === 0) return;
  const events = pendingLifecycle.splice(0, pendingLifecycle.length);
  for (const event of events) commit(event);
}

/* Defer the next delta commit until its cadence deadline, then hand it to
   the normal rAF seam so the paint still lands on a frame boundary. */
function scheduleDeltaFlush(event: Extract<ChatRuntimeEvent, { type: 'stream-delta' }>): void {
  if (deltaDue()) {
    scheduleFrame();
    return;
  }
  if (pendingDeltaTimer !== null) return;
  const wait = Math.max(
    1,
    lastDeltaCommitAt + getStreamRenderInterval(event.textLength) - nowMs(),
  );
  pendingDeltaTimer = setTimeout(() => {
    pendingDeltaTimer = null;
    scheduleFrame();
  }, wait);
}

/**
 * Tool lifecycle events arrive faster than a person can read them (a code run
 * emits progress on every output flush). The bridge snapshots every changed
 * message once per frame and preserves object identity for untouched rows.
 */
function flushPendingToolRuns(): void {
  if (!pendingToolRuns || pendingToolRuns.size === 0) {
    pendingToolRuns = null;
    return;
  }
  const ids = new Set(pendingToolRuns);
  pendingToolRuns = null;
  /* One commit is enough for every coalesced tool message; the changed-id set
     tells the immutable reconciler which row identities must advance. */
  const firstId = ids.values().next().value;
  if (typeof firstId === 'string') {
    commit({ type: 'tool-run-updated', messageId: firstId }, ids);
  }
}

function publish(event: ChatRuntimeEvent): void {
  if (event.type === 'stream-delta') {
    pendingDelta = event;
    scheduleDeltaFlush(event);
    return;
  }
  if (event.type === 'tool-run-updated') {
    if (!pendingToolRuns) pendingToolRuns = new Set<string>();
    pendingToolRuns.add(event.messageId);
    pendingToolRunsSeq = ++eventSeq;
    scheduleFrame();
    return;
  }

  /* Coalesce the click-frame lifecycle events into one commit per
     animation frame, one slot per event type. The click frame pays one rAF
     instead of a snapshot walk per event; the events themselves are kept in
     publication order so no lifecycle notification is lost. */
  if (event.type === 'message-added' || event.type === 'stream-started') {
    const seq = ++eventSeq;
    if (pendingLifecycle.length === 0) pendingLifecycleSeq = seq;
    queueLifecycleEvent(event);
    scheduleFrame();
    return;
  }

  // Preserve lifecycle ordering when a terminal or replacement event lands
  // before the animation frame scheduled for the final delta/tool update.
  flushPendingDelta();
  flushPendingToolRuns();
  flushPendingLifecycle();
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
    pendingLifecycle.length = 0;
    pendingLifecycleSeq = 0;
    pendingToolRunsSeq = 0;
    eventSeq = 0;
    clearDeltaTimer();
    lastDeltaCommitAt = 0;
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
