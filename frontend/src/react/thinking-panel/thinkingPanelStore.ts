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

const bridge: ThinkingPanelBridge = {
  getSnapshot,
  publish,
  publishThinkingDelta,
  subscribe,
};

declare global {
  interface Window {
    __socratesThinkingPanelBridge?: ThinkingPanelBridge;
  }
}

export function installThinkingPanelBridge(): ThinkingPanelBridge {
  if (typeof window !== 'undefined' && window.__socratesThinkingPanelBridge) {
    return window.__socratesThinkingPanelBridge;
  }
  if (typeof window !== 'undefined') {
    window.__socratesThinkingPanelBridge = bridge;
  }
  return bridge;
}

export function getThinkingPanelSnapshot(): ThinkingPanelSnapshot {
  return installThinkingPanelBridge().getSnapshot();
}

export function subscribeToThinkingPanel(listener: Listener): () => void {
  return installThinkingPanelBridge().subscribe(listener);
}
