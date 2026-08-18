export type ThinkingPanelEvent =
  | { type: 'thinking-start'; messageId: string }
  | { type: 'thinking-delta'; messageId: string; text: string }
  | { type: 'thinking-end'; messageId: string }
  | { type: 'panel-open'; messageId: string | null }
  | { type: 'panel-close' }
  | { type: 'turn-start' };

export interface ThinkingPanelSnapshot {
  open: boolean;
  messageId: string | null;
  text: string;
  streaming: boolean;
  revision: number;
  lastEvent: ThinkingPanelEvent['type'];
}

export interface ThinkingPanelBridge {
  getSnapshot: () => ThinkingPanelSnapshot;
  publish: (event: ThinkingPanelEvent) => void;
  /** Throttled text publish used by the legacy stream controller. */
  publishThinkingDelta: (messageId: string, text: string) => void;
  subscribe: (listener: () => void) => () => void;
}
