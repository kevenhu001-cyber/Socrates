import { Icon } from '../../../ui/Icon';
/**
 * Indicator components — small React roots registered by the boot registry.
 *
 * These render only the parts of the legacy shell that needed
 * declarative state; the rest stays in legacy markup. Extracted out
 * of `bootstrap.tsx` so the bootstrap module stays under the M2
 * 100-line budget.
 */

import { useEffect, useRef, useState } from 'react';
import { useUiStore } from '../../../store/index.ts';
import { useChatStreamStatus, useIsChatStreaming } from '../../useChatRuntime';

const ICON_PROPS = {
  fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
} as const;

function SendArrowIcon() { return <Icon name="arrowUp" strokeWidth={2.25} className="icon-arrow" />; }
function StopSquareIcon() { return <svg viewBox="0 0 24 24" {...ICON_PROPS} strokeWidth="2" className="icon-stop"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>; }
/* The pill's visibility is part of the sticky-bottom contract: while an
   answer streams, a reader who scrolls away gets the "↓ New reply"
   affordance and clicking it re-pins. `_userScrolledAway` is owned by the
   legacy scroll listener (ui/scrollPill.ts), so read it from the ui domain
   store — the typed view of the same flag the legacy listener writes, and
   a subscription to that one namespace rather than to every state change. */
function useScrolledAway(): boolean {
  return useUiStore((snapshot) => Boolean(snapshot._userScrolledAway));
}

/* The legacy updateComposerBtn mirrors draft state onto the button's
   `.active` class (canSend = has text or attachments) and owns the
   disabled state. Observe that class so the icon swaps exactly when the
   legacy contract flips, without duplicating its canSend logic. Single
   button since the composer shell is one instance (P_composer-single). */
function useControlClass(className: string): boolean {
  const [active, setActive] = useState(
    () => document.getElementById('composerPrimaryBtn')?.classList.contains(className) ?? false,
  );
  useEffect(() => {
    const btn = document.getElementById('composerPrimaryBtn');
    if (!btn) return undefined;
    const sync = () => setActive(btn.classList.contains(className));
    const observer = new MutationObserver(sync);
    observer.observe(btn, { attributes: true, attributeFilter: ['class'] });
    sync();
    return () => observer.disconnect();
  }, [className]);
  return active;
}

export function NewReplyPill({ host }: { host?: HTMLElement | null }) {
  /* Establish the first React subscription without changing the legacy
     element's markup, text, or delegated click behavior. */
  const streaming = useIsChatStreaming();
  const scrolledAway = useScrolledAway();
  /* Once an answer streams in while the reader is away, the affordance
     stays until they re-pin — a finished stream is still an unseen reply. */
  const unseen = useRef(false);
  useEffect(() => {
    if (scrolledAway && streaming) unseen.current = true;
    if (!scrolledAway) unseen.current = false;
    if (!host) return undefined;
    host.classList.toggle('visible', scrolledAway && (streaming || unseen.current));
    return undefined;
  }, [host, streaming, scrolledAway]);
  return <>↓ New reply</>;
}

/* One primary action: the send arrow, or the stop square while a turn
   streams. P_composer-primary-split retired the idle voice waveform — the
   microphone is the only dictation control, so the primary never changes
   identity with the draft. The .active class is mirrored by the existing
   composer state controller. */
export function PrimaryButton() {
  const streamStatus = useChatStreamStatus();
  /* ui/sendGlyph.js holds `.is-sending` for one short beat after a
     composer submit: render the departing arrow over the arriving stop
     glyph so the swap reads as one motion instead of arrow → stop flicker
     while the draft clears and the stream starts. */
  const sending = useControlClass('is-sending');
  if (sending) {
    return (
      <>
        <span className="send-glyph send-glyph-out"><SendArrowIcon /></span>
        <span className="send-glyph send-glyph-in"><StopSquareIcon /></span>
      </>
    );
  }
  if (streamStatus === 'streaming') return <StopSquareIcon />;
  return <SendArrowIcon />;
}
