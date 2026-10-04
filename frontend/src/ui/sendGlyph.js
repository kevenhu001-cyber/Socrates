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
  /* Restart cleanly on a rapid second send: drop the class for one
     style recalculation so the CSS animations run again. */
  btn.classList.remove('is-sending');
  void btn.offsetWidth;
  btn.classList.add('is-sending');
  timer = setTimeout(function () {
    timer = 0;
    btn.classList.remove('is-sending');
  }, SEND_GLYPH_MS);
}
