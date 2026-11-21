// src/legacy/sendGlyph.ts — the send button's "sent" moment.
//
// The shared composer uses this brief state to acknowledge submission with
// opacity feedback while the primary control switches from Send to Stop.

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
