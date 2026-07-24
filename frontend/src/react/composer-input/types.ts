/**
 * Shared contracts for the composer React migration boundary.
 *
 * The legacy `main.js` and `ui/topicSetup.js` own the textarea state,
 * send/start button state, and attachment state. In React mode, the
 * legacy code publishes through this bridge so React can render the
 * composer input area declaratively.
 */

export interface ComposerInputSnapshot {
  /** Topic setup textarea value */
  topicInput: string;
  /** Chat composer textarea value */
  chatInput: string;
  /** Whether there are pending attachments */
  hasAttachments: boolean;
  /** Whether a stream is currently active */
  isStreaming: boolean;
  /** Whether the topic setup is visible (vs chat view) */
  isTopicSetup: boolean;
  /** Current reasoning effort */
  reasoningEffort: string;
  revision: number;
}

export interface ComposerInputBridge {
  getSnapshot: () => ComposerInputSnapshot;
  publish: (snapshot: Omit<ComposerInputSnapshot, 'revision'>) => void;
  subscribe: (listener: () => void) => () => void;
}

declare global {
  interface Window {
    __socratesComposerInputBridge?: ComposerInputBridge;
  }
}
