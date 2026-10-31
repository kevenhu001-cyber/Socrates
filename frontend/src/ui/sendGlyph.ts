// src/ui/sendGlyph.ts — the send button's "sent" moment.
//
// A composer submit flips the primary button through arrow → stop within a
// frame or two. Without a transition the icon just flickers. While
// `isSending` is true, React renders `.is-sending` on the button and the
// departing arrow plus arriving stop glyph together. CSS in
// parity/composer-unified.css animates them. Only transform/opacity move, so
// the button's measured box never changes.
//
// P_composer-primary-split dropped the voice leg of the sequence: the idle
// glyph is the arrow, so the morph is arrow → stop.

import { useSendGlyphStore } from './sendGlyph.store.ts';

export const SEND_GLYPH_MS = 220;

let timer: ReturnType<typeof setTimeout> | number = 0;

export function playSendGlyph(): void {
  if (timer) clearTimeout(timer);
  const setSending = useSendGlyphStore.getState().setSending;
  setSending(false);
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setSending(true));
  else setSending(true);
  timer = setTimeout(() => {
    timer = 0;
    setSending(false);
  }, SEND_GLYPH_MS);
}
