/**
 * ui/scrollDecision.ts — pure auto-scroll decision predicates.
 *
 * The scroll-off (pin) detection stays input-driven in scrollPill.js,
 * which sets `state._userScrolledAway` from wheel/touch/keyboard intent.
 * This module extracts only the *decision* — "should this streaming delta
 * auto-scroll?" — into pure predicates so it is unit/property testable.
 * The DOM effect (smoothScrollToBottom) stays in scroll.js.
 */

/** Pixels from the bottom that still count as "pinned". Matches scrollPill.js. */
export const SCROLL_SLACK = 64;

/** The reader is pinned when within `slack` pixels of the bottom. */
export function isPinnedToBottom(distanceFromBottom: number, slack = SCROLL_SLACK): boolean {
  return distanceFromBottom <= slack;
}

/**
 * A streaming delta auto-scrolls only when the reader is pinned AND has
 * not expressed upward scroll intent.
 */
export function shouldAutoScroll(distanceFromBottom: number, userScrolledAway: boolean): boolean {
  return isPinnedToBottom(distanceFromBottom) && !userScrolledAway;
}
