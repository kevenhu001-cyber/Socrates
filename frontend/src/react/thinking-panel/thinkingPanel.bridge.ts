import type { ImmutableBridge } from '../../lib/bridge/createImmutableBridge.ts';
import { useBridge } from '../../lib/bridge/useBridge.ts';
import { toolRunLabel } from '../tool-run/labels.js';
import type { ToolCallLike } from '../tool-run/labels.js';
import type {
  ThinkingPanelActivity,
  ThinkingPanelBridge,
  ThinkingPanelEvent,
  ThinkingPanelSnapshot,
} from './types';

type Listener = () => void;

type ToolActivityEvent = Extract<ThinkingPanelEvent, { type: 'tool-activity' }>;

const EMPTY_ACTIVITIES: readonly ThinkingPanelActivity[] = Object.freeze([]);
const IDLE: ThinkingPanelSnapshot = Object.freeze({
  open: false,
  messageId: null,
  activities: EMPTY_ACTIVITIES,
  streaming: false,
  revision: 0,
  lastEvent: 'turn-start',
});

let snapshot: ThinkingPanelSnapshot = IDLE;
const listeners = new Set<Listener>();

function activityFromEvent(event: ToolActivityEvent): ThinkingPanelActivity {
  const call: ToolCallLike = {
    id: event.id,
    name: event.name,
    input: event.input,
    output: event.output,
    results: event.results,
    status: event.status,
  };
  return Object.freeze({
    id: event.id,
    toolName: event.name,
    label: toolRunLabel(call, event.state).text,
    state: event.state,
  });
}

function commit(event: ThinkingPanelEvent): void {
  let next: Omit<ThinkingPanelSnapshot, 'revision'>;
  switch (event.type) {
    case 'thinking-start':
      next = {
        open: snapshot.open,
        messageId: event.messageId,
        activities: snapshot.messageId === event.messageId ? snapshot.activities : EMPTY_ACTIVITIES,
        streaming: true,
        lastEvent: event.type,
      };
      break;
    case 'thinking-end':
      if (snapshot.messageId !== null && event.messageId !== snapshot.messageId) return;
      next = {
        open: snapshot.open,
        messageId: event.messageId,
        activities: snapshot.activities,
        streaming: false,
        lastEvent: event.type,
      };
      break;
    case 'tool-activity': {
      if (snapshot.messageId !== null && event.messageId !== snapshot.messageId) return;
      const activities = snapshot.messageId === event.messageId
        ? snapshot.activities.slice()
        : [];
      const item = activityFromEvent(event);
      const index = activities.findIndex((activity) => activity.id === item.id);
      if (index >= 0) activities[index] = item;
      else activities.push(item);
      next = {
        open: snapshot.open,
        messageId: event.messageId,
        activities: Object.freeze(activities),
        streaming: event.state === 'done' || event.state === 'error',
        lastEvent: event.type,
      };
      break;
    }
    case 'panel-open':
      next = {
        open: true,
        messageId: event.messageId ?? snapshot.messageId,
        activities: snapshot.activities,
        streaming: snapshot.streaming,
        lastEvent: event.type,
      };
      break;
    case 'panel-close':
      next = {
        open: false,
        messageId: snapshot.messageId,
        activities: snapshot.activities,
        streaming: snapshot.streaming,
        lastEvent: event.type,
      };
      break;
    case 'turn-start':
      next = {
        open: false,
        messageId: null,
        activities: EMPTY_ACTIVITIES,
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

function publish(event: ThinkingPanelEvent): void {
  commit(event);
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

const thinkingPanelBridge: ImmutableBridge<ThinkingPanelSnapshot, ThinkingPanelEvent> & {
  publish: (event: ThinkingPanelEvent) => void;
  __resetForTests: () => void;
} = {
  getSnapshot,
  dispatch: publish,
  publish,
  subscribe,
  flush: () => {},
  __resetForTests: () => {
    snapshot = IDLE;
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
      subscribe: thinkingPanelBridge.subscribe,
    };
  }
  if (window.__socratesThinkingPanelBridge) {
    return window.__socratesThinkingPanelBridge;
  }
  const bridge: ThinkingPanelBridge = {
    getSnapshot: thinkingPanelBridge.getSnapshot,
    publish: thinkingPanelBridge.publish,
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

export const thinkingPanelImmutableBridge: ImmutableBridge<ThinkingPanelSnapshot, ThinkingPanelEvent> = thinkingPanelBridge;

export function useThinkingPanelSnapshot(): ThinkingPanelSnapshot {
  return useBridge(thinkingPanelBridge);
}
