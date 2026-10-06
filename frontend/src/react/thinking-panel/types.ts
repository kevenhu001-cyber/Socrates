export type ThinkingActivityState = 'running' | 'done' | 'error' | 'stopped' | 'awaiting';

export interface ThinkingPanelActivity {
  id: string;
  toolName: string;
  label: string;
  state: ThinkingActivityState;
}

export type ThinkingPanelEvent =
  | { type: 'thinking-start'; messageId: string }
  | { type: 'thinking-end'; messageId: string }
  | {
    type: 'tool-activity';
    messageId: string;
    id: string;
    name: string;
    input?: unknown;
    output?: string | null;
    results?: unknown[];
    status?: string;
    state: ThinkingActivityState;
  }
  | { type: 'panel-open'; messageId: string | null }
  | { type: 'panel-close' }
  | { type: 'turn-start' };

export interface ThinkingPanelSnapshot {
  open: boolean;
  messageId: string | null;
  activities: readonly ThinkingPanelActivity[];
  streaming: boolean;
  revision: number;
  lastEvent: ThinkingPanelEvent['type'];
}

export interface ThinkingPanelBridge {
  getSnapshot: () => ThinkingPanelSnapshot;
  publish: (event: ThinkingPanelEvent) => void;
  subscribe: (listener: () => void) => () => void;
}
