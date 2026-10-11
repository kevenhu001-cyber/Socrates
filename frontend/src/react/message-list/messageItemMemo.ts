import type { MessageItemProps } from './types';

/**
 * chatRuntime.bridge publishes immutable per-message render snapshots and
 * preserves object identity for untouched rows. That makes reference equality
 * the source of truth for message invalidation instead of a growing set of
 * mutable revision counters.
 */
export function areMessageItemsEqual(prev: MessageItemProps, next: MessageItemProps): boolean {
  return prev.mathRevision === next.mathRevision
    && prev.message === next.message;
}
