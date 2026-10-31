/**
 * Shared contracts for the message list React migration boundary.
 *
 * The legacy `main.js` owns the message state (addMessage, addStreamingMessage,
 * editMessage, etc.) and publishes events through the chat runtime store.
 * React reads immutable published snapshots and renders the message list
 * declaratively.
 */

import type { LegacyChatMessage } from '../types/domain';

/**
 * Click handler props passed to MessageToolbar. React owns edit state;
 * remaining actions dispatch through the typed legacy gateway.
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
  /** Immutable render snapshot published by the chat runtime store. */
  message: LegacyChatMessage;
  /** Global math-render revision from the remaining legacy KaTeX renderer. */
  mathRevision?: number;
  /** True when this row is the latest message in the visible transcript. */
  isLatest?: boolean;
  /** Shared public sessions render transcript content without message actions. */
  readOnly?: boolean;
}
