/**
 * Indicator components — small React roots registered by the boot registry.
 *
 * These render only the parts of the legacy shell that needed
 * declarative state; the rest stays in legacy markup. Extracted out
 * of `bootstrap.tsx` so the bootstrap module stays under the M2
 * 100-line budget.
 */

import { useEffect, useRef } from 'react';
import { useUiStore } from '../../../store/index.ts';
import { useIsChatStreaming } from '../../useChatRuntime';

/* The pill's visibility is part of the sticky-bottom contract: while an
   answer streams, a reader who scrolls away gets the "↓ New reply"
   affordance and clicking it re-pins. `_userScrolledAway` is owned by the
   legacy scroll listener (ui/scrollPill.ts), so read it from the ui domain
   store — the typed view of the same flag the legacy listener writes, and
   a subscription to that one namespace rather than to every state change. */
function useScrolledAway(): boolean {
  return useUiStore((snapshot) => Boolean(snapshot._userScrolledAway));
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
  /* Reference: a 36px circle carrying a down arrow. The old label stays as
     visually hidden text (the host's aria-label names the control). */
  return (
    <>
      <svg className="new-reply-pill-glyph" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M12 5v14" /><path d="m6 13 6 6 6-6" /></svg>
      <span className="visually-hidden">↓ New reply</span>
    </>
  );
}

/* The composer's primary send / stop control moved to the shared React
   Native rail in RN-7 (packages/ui/src/composer/ComposerControls.tsx). */
