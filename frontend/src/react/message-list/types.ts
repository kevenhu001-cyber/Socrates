/**
 * Shared contracts for the message list React migration boundary.
 *
 * The legacy `main.js` owns the message state (addMessage, addStreamingMessage,
 * editMessage, etc.) and pushes events through the chat runtime bridge.
 * React reads immutable published snapshots and renders the message list
 * declaratively.
 */

import type { LegacyChatMessage } from '../types/domain';

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
  /** True when this row is the latest message in the visible transcript. */
  isLatest?: boolean;
}
