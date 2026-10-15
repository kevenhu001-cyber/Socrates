// src/ui/sendGlyph.js — the send button's "sent" moment.
//
// A composer submit flips the primary button through arrow → stop within a
// frame or two. Without a transition the icon just flickers. While
// `.is-sending` is on the button, the React PrimaryButton
// (react/lib/boot/indicatorComponents.tsx) renders the departing arrow and
// the arriving stop glyph together; CSS in parity/composer-unified.css
// animates them. Only transform/opacity move, so the button's measured box
// never changes.
//
// P_composer-primary-split dropped the voice leg of the sequence: the idle
// glyph is the arrow, so the morph is arrow → stop.

export const SEND_GLYPH_MS = 220;

let timer = 0;

export function playSendGlyph(doc) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  const btn = d && d.getElementById ? d.getElementById('composerPrimaryBtn') : null;
  if (!btn) return;
  if (timer) clearTimeout(timer);
  /* P_send-glyph-no-reflow — the previous restart trick
     (`btn.classList.remove` + `void btn.offsetWidth` + `add`) forced a
     synchronous layout on every send, costing 5–15ms on the click
     frame even when the button was nowhere near the viewport's
     current style. Removing the class and re-adding it in the same
     tick already cancels the running CSS animation in every modern
     engine; deferring the re-add to rAF lets the click handler return
     immediately and lands the restart on the next paint boundary,
     which is the only place the animation needs to be "fresh" anyway.
     The 220ms timer below still drives the un-send side. */
  btn.classList.remove('is-sending');
  const raf = typeof d.requestAnimationFrame === 'function'
    ? d.requestAnimationFrame.bind(d)
    : (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null);
  const restart = function () {
    btn.classList.add('is-sending');
  };
  if (raf) raf(restart);
  else restart();
  timer = setTimeout(function () {
    timer = 0;
    btn.classList.remove('is-sending');
  }, SEND_GLYPH_MS);
}
