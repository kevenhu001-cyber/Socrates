/* Deprecated compatibility stub.
 *
 * Live streaming no longer performs post-commit DOM walks/replacements to
 * decorate newly revealed text. The playback clock in render/streaming.ts is
 * now the sole text-reveal pacing mechanism. Keep this file temporarily so
 * downstream branches importing it fail softly during the convergence window;
 * no production code imports it on this branch.
 */

export const TAIL_FADE_MS = 0;

export function recordReveal() {
  return [];
}

export function computeFadeSegments() {
  return [];
}

export function applyTailFade() {
  return 0;
}
