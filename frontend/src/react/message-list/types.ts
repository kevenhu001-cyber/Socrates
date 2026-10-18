/**
 * Shared contracts for the message list React migration boundary.
 *
 * The legacy `main.js` owns the message state (addMessage, addStreamingMessage,
 * editMessage, etc.) and pushes events through the chat runtime bridge.
 * React reads immutable published snapshots and renders the message list
 * declaratively.
 */

import type { LegacyChatMessage } from '../types/domain';

export interface MessageListBridge {
  /** Called by legacy code to signal that the message list DOM should be
   *  re-rendered by React. The chat runtime bridge already carries the
   *  message data; this bridge is purely a trigger. */
  notify: () => void;
  subscribe: (listener: () => void) => () => void;
}

/**
 * Click handler props passed to MessageToolbar. The legacy functions live
 * on `window` and remain the authoritative side-effect owner; the React
 * toolbar dispatches through them so the visible UI matches.
 */
export interface MessageToolbarCallbacks {
  onCopy: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onShare?: () => void;
  onRegenerate?: () => void;
  onThumbsUp?: () => void;
  onThumbsDown?: () => void;
  onBranch?: () => void;
  onReExplain?: () => void;
  onReadAloud?: (ev: React.MouseEvent<HTMLButtonElement>) => void;
  onSwitchBranch?: (targetIndex: number) => void;
}

export interface MessageItemProps {
  /** Immutable render snapshot published by chatRuntime.bridge. */
  message: LegacyChatMessage;
  /** Global math-render revision from the remaining legacy KaTeX renderer. */
  mathRevision?: number;
}

declare global {
  interface Window {
    __socratesMessageListBridge?: MessageListBridge;
  }
}
