/**
 * Thinking panel bridge — M2 single-bridge migration.
 *
 * Carries the reasoning text stream that the side panel / bottom sheet
 * renders. The legacy `chat/toolRuntime.ts` and `ui/thinkingPill.js`
 * publishers call `window.__socratesThinkingPanelBridge.publish(event)`
 * and `.publishThinkingDelta(messageId, text)` for high-frequency
 * reasoning updates.
 *
 * Why this bridge does not use `createImmutableBridge` directly
 *  - The reasoning stream coalesces within an animation frame but
 *    keeps the LAST text rather than the last action, and the
 *    `thinkingPanel.test.mjs` regression suite asserts the exact
 *    RAF-throttle + last-text-wins behaviour.
 *  - `publishThinkingDelta(messageId, text)` is a parallel write
 *    surface (the stream controller's hot path) that needs to share
 *    the same commit queue as `publish(...)`. The factory has one
 *    pending-action slot; we need a separate text slot.
 *  - We keep the custom RAF loop here and still expose the
 *    factory-shaped bridge interface (`getSnapshot`, `dispatch`,
 *    `subscribe`) so React hooks can use `useBridge(bridge)`.
 *
 * M2 conventions
 *  - `dispatch` and `publish` both route through the same RAF loop;
 *    `publish` is the legacy alias `ui/thinkingPill.js` still calls.
 *  - `publishThinkingDelta` is preserved verbatim — it is a
 *    documented hot-path entry on the legacy bridge.
 *  - React subscribers use `useBridge(bridge)` directly.
 */

import type { ImmutableBridge } from '../../lib/bridge/createImmutableBridge.ts';
import { useBridge } from '../../lib/bridge/useBridge.ts';
import type {
  ThinkingPanelBridge,
  ThinkingPanelEvent,
  ThinkingPanelSnapshot,
} from './types';

type Listener = () => void;

const IDLE: ThinkingPanelSnapshot = Object.freeze({
  open: false,
  messageId: null,
  text: '',
  streaming: false,
  revision: 0,
  lastEvent: 'turn-start',
});

let snapshot: ThinkingPanelSnapshot = IDLE;
const listeners = new Set<Listener>();

let pendingDelta: { messageId: string; text: string } | null = null;
let pendingDeltaFrame: number | null = null;

function commit(event: ThinkingPanelEvent): void {
  let next: Omit<ThinkingPanelSnapshot, 'revision'>;
  switch (event.type) {
    case 'thinking-start':
      next = {
        open: snapshot.open,
        messageId: event.messageId,
        text: '',
        streaming: true,
        lastEvent: event.type,
      };
      break;
    case 'thinking-delta':
      next = {
        open: snapshot.open,
        messageId: event.messageId,
        text: event.text,
        streaming: true,
        lastEvent: event.type,
      };
      break;
    case 'thinking-end':
      next = {
        open: snapshot.open,
        messageId: snapshot.messageId ?? event.messageId,
        text: snapshot.text,
        streaming: false,
        lastEvent: event.type,
      };
      break;
    case 'panel-open':
      next = {
        open: true,
        messageId: event.messageId ?? snapshot.messageId,
        text: snapshot.text,
        streaming: snapshot.streaming,
        lastEvent: event.type,
      };
      break;
    case 'panel-close':
      next = {
        open: false,
        messageId: snapshot.messageId,
        text: snapshot.text,
        streaming: snapshot.streaming,
        lastEvent: event.type,
      };
      break;
    case 'turn-start':
      next = {
        open: false,
        messageId: null,
        text: '',
        streaming: false,
        lastEvent: event.type,
      };
      break;
  }
  snapshot = Object.freeze({
    ...next,
    revision: snapshot.revision + 1,
  });
  listeners.forEach((listener) => listener());
}

function flushPendingDelta(): void {
  if (!pendingDelta) return;
  const delta = pendingDelta;
  pendingDelta = null;
  if (pendingDeltaFrame != null) {
    const raf = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : null;
    if (raf) cancelAnimationFrame(pendingDeltaFrame);
    pendingDeltaFrame = null;
  }
  commit({ type: 'thinking-delta', messageId: delta.messageId, text: delta.text });
}

function schedulePendingDelta(): void {
  if (pendingDeltaFrame != null) return;
  const raf = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : null;
  if (raf) {
    pendingDeltaFrame = raf(flushPendingDelta);
  } else {
    pendingDeltaFrame = window.setTimeout(flushPendingDelta, 100) as unknown as number;
  }
}

function publish(event: ThinkingPanelEvent): void {
  if (event.type === 'thinking-delta') {
    if (snapshot.messageId !== null && event.messageId !== snapshot.messageId) return;
    if (event.messageId === snapshot.messageId && event.text === snapshot.text) return;
    pendingDelta = { messageId: event.messageId, text: event.text };
    schedulePendingDelta();
    return;
  }
  if (event.type === 'thinking-end'
    && snapshot.messageId !== null
    && event.messageId !== snapshot.messageId) {
    return;
  }
  if (pendingDelta) flushPendingDelta();
  commit(event);
}

function publishThinkingDelta(messageId: string, text: string): void {
  publish({ type: 'thinking-delta', messageId, text });
}

function getSnapshot(): ThinkingPanelSnapshot {
  return snapshot;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const thinkingPanelBridge: ImmutableBridge<
  ThinkingPanelSnapshot,
  ThinkingPanelEvent
> & {
  publish: (event: ThinkingPanelEvent) => void;
  publishThinkingDelta: (messageId: string, text: string) => void;
  __resetForTests: () => void;
} = {
  getSnapshot,
  dispatch: publish,
  publish,
  publishThinkingDelta,
  subscribe,
  flush: () => {
    if (pendingDelta) flushPendingDelta();
  },
  __resetForTests: () => {
    snapshot = IDLE;
    pendingDelta = null;
    if (pendingDeltaFrame != null) {
      const raf = typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : null;
      if (raf) cancelAnimationFrame(pendingDeltaFrame);
      pendingDeltaFrame = null;
    }
    listeners.forEach((listener) => listener());
  },
};

declare global {
  interface Window {
    __socratesThinkingPanelBridge?: ThinkingPanelBridge;
  }
}

export function installThinkingPanelBridge(): ThinkingPanelBridge {
  if (typeof window === 'undefined') {
    return {
      getSnapshot: thinkingPanelBridge.getSnapshot,
      publish: thinkingPanelBridge.publish,
      publishThinkingDelta: thinkingPanelBridge.publishThinkingDelta,
      subscribe: thinkingPanelBridge.subscribe,
    };
  }
  if (window.__socratesThinkingPanelBridge) {
    return window.__socratesThinkingPanelBridge;
  }
  const bridge: ThinkingPanelBridge = {
    getSnapshot: thinkingPanelBridge.getSnapshot,
    publish: thinkingPanelBridge.publish,
    publishThinkingDelta: thinkingPanelBridge.publishThinkingDelta,
    subscribe: thinkingPanelBridge.subscribe,
  };
  window.__socratesThinkingPanelBridge = bridge;
  return bridge;
}

export function getThinkingPanelSnapshot(): ThinkingPanelSnapshot {
  return installThinkingPanelBridge().getSnapshot();
}

export function subscribeToThinkingPanel(listener: Listener): () => void {
  return installThinkingPanelBridge().subscribe(listener);
}

export const thinkingPanelImmutableBridge: ImmutableBridge<
  ThinkingPanelSnapshot,
  ThinkingPanelEvent
> = thinkingPanelBridge;

export function useThinkingPanelSnapshot(): ThinkingPanelSnapshot {
  return useBridge(thinkingPanelBridge);
}
