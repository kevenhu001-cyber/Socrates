/* sidebar/breakpoints.ts — single source of truth for the shell's
   responsive breakpoints (S2 in docs/plans/2026-11-04-sidebar-ui-consistency.md).

   CSS owns the visual truth: `@media (max-width: 768px)` is the phone drawer
   range and `>= 769px` is the persistent desktop rail. JS used to encode this
   three ways — a 769 constant, bare `< 768`, bare `<= 768` — and the 768px
   width itself (iPad portrait) evaluated as JS-desktop against mobile CSS.
   Every sidebar consumer derives from these helpers so the encodings cannot
   drift apart again.
*/
export const MOBILE_VIEWPORT_MAX_PX = 768;
export const DESKTOP_VIEWPORT_MIN_PX = 769;

/** Phone drawer range, inclusive — matches `@media (max-width: 768px)`. */
export function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth <= MOBILE_VIEWPORT_MAX_PX;
}
