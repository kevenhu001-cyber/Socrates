/* ui/composerAnim.js — extracted from main.js (B6 batch).
 * Mobile composer fr-interpolation feature detect. Zero-behavior-change lift.
 * Runs once on import (same position semantics as the inline block).
 */
export function detectComposerAnimSupport() {
  try {
    if (typeof CSS === 'undefined' || !CSS.supports) return false;
    /* Some older engines accept the property name but ignore the
       track interpolation. Probe a second time with an explicitly
       `0fr`-shaped value as the parsed test. */
    return CSS.supports('grid-template-rows', '0fr');
  } catch (_) { return false; }
}

export function applyComposerAnimClass() {
  if (typeof document === 'undefined') return;
  var ok = detectComposerAnimSupport();
  document.documentElement.classList.toggle('composer-anim-fr', ok);
  document.documentElement.classList.toggle('composer-anim-no-fr', !ok);
}

applyComposerAnimClass();
