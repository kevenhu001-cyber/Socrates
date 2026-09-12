/**
 * ui/scrollDecision.ts — pure auto-scroll decision predicates.
 *
 * The scroll-off (pin) detection stays input-driven in scrollPill.js,
 * which sets `state._userScrolledAway` from wheel/touch/keyboard intent.
 * This module extracts only the *decision* — "should this streaming delta
 * auto-scroll?" — into pure predicates so it is unit/property testable.
 * The DOM effect (smoothScrollToBottom) stays in scroll.js.
 *
 * It also owns the keyboard-transition anchoring decision: whether a
 * transcript should keep following the bottom or hold the reader's
 * captured offset while the virtual keyboard changes the layout.
 */

/** Pixels from the bottom that still count as "pinned". Matches scrollPill.js. */
export const SCROLL_SLACK = 64;

/**
 * Pixels from the bottom that still count as "following" while the virtual
 * keyboard changes the transcript's flex height. Larger than SCROLL_SLACK
 * because a keyboard lift can hide several hundred pixels in one frame and
 * a reader who was mid-glide at the bottom must still be followed.
 */
export const KEYBOARD_PIN_SLACK = 96;

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

/** Reader intent captured when a keyboard/layout transition began. */
export interface KeyboardAnchorSnapshot {
  /** Transcript scrollTop captured before the layout change. */
  scrollTop: number;
  /** True when the reader was following the bottom at capture time. */
  pinned: boolean;
}

/** Geometry/input context at restore time. */
export interface KeyboardAnchorContext {
  /** Current maximum reachable scrollTop (scrollHeight - clientHeight). */
  maxScrollTop: number;
  /** Whether the reader has expressed upward scroll intent since capture. */
  scrolledAway: boolean;
  /** Whether a newer wheel/touch/key gesture arrived after capture. */
  userIntentAfterCapture: boolean;
  /**
   * Visual-viewport pan since capture (visualViewport.offsetTop delta).
   * iOS Safari pans the visual viewport down to reveal a focused composer,
   * which moves the transcript content up on screen; the transcript scrolls
   * back by the same amount (scrollTop − panDelta) so the reader's content
   * stays under the same visual position.
   */
  panDelta?: number;
}

export type KeyboardAnchorAction =
  | { type: 'follow-bottom' }
  | { type: 'restore'; top: number }
  | { type: 'none' };

/**
 * Decide what a keyboard transition should do to the transcript:
 *
 *  - `follow-bottom` — the reader was following the latest answer and has
 *    not scrolled away; keep the newest content above the composer.
 *  - `restore` — the reader was inspecting history; return to the exact
 *    offset captured before the layout change, shifted by any visual
 *    viewport pan and clamped to the new range, without ever forcing the
 *    bottom.
 *  - `none` — a newer user gesture owns the scroll now; touch nothing.
 */
export function decideKeyboardAnchorAction(
  anchor: KeyboardAnchorSnapshot | null,
  context: KeyboardAnchorContext,
): KeyboardAnchorAction {
  if (!anchor || context.userIntentAfterCapture) return { type: 'none' };
  if (anchor.pinned && !context.scrolledAway) return { type: 'follow-bottom' };
  const maxTop = Number.isFinite(context.maxScrollTop)
    ? Math.max(0, context.maxScrollTop)
    : 0;
  const pan = Number.isFinite(context.panDelta) ? (context.panDelta as number) : 0;
  /* `offsetTop` grows when the visual viewport pans down the layout, so the
   * same scrollTop would render the content higher on screen. Subtract the
   * pan to keep it visually still; adding it doubled the jump. */
  const captured = Number.isFinite(anchor.scrollTop)
    ? Math.max(0, anchor.scrollTop - pan)
    : 0;
  return { type: 'restore', top: Math.min(maxTop, captured) };
}
