/**
 * Indicator components — small React roots registered by the boot registry.
 *
 * These render only the parts of the legacy shell that needed
 * declarative state; the rest stays in legacy markup. Extracted out
 * of `bootstrap.tsx` so the bootstrap module stays under the M2
 * 100-line budget.
 */

import { useEffect, useRef, useState } from 'react';
import { stateStore } from '../../../state/store.js';
import { useChatStreamStatus, useIsChatStreaming } from '../../useChatRuntime';

const ICON_PROPS = {
  fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
} as const;

function SendArrowIcon() { return <svg viewBox="0 0 24 24" {...ICON_PROPS} strokeWidth="2.5" className="icon-arrow"><path d="M12 19V5M5 12l7-7 7 7" /></svg>; }
function StopSquareIcon() { return <svg viewBox="0 0 24 24" {...ICON_PROPS} strokeWidth="2" className="icon-stop"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>; }
/* Voice-input waveform bars — the idle state of the shared primary
   control (the same glyph the static markup ships in #startBtnContent /
   #sendBtnContent). Bars are <line> elements so `… .icon-arrow path`
   style selectors keep counting a single path. */
function VoiceIcon() {
  return (
    <svg viewBox="0 0 24 24" {...ICON_PROPS} strokeWidth="2" className="icon-voice">
      <path d="M4 10v4M8 7v10M12 5v14M16 8v8M20 10v4" />
    </svg>
  );
}

/* The pill's visibility is part of the sticky-bottom contract: while an
   answer streams, a reader who scrolls away gets the "↓ New reply"
   affordance and clicking it re-pins. `_userScrolledAway` is owned by the
   legacy scroll listener (ui/scrollPill.js), so subscribe to the store
   and mirror it onto the hydrating host element. */
function useScrolledAway(): boolean {
  const [away, setAway] = useState(() => Boolean(stateStore.read('_userScrolledAway')));
  useEffect(() => {
    const sync = () => setAway(Boolean(stateStore.read('_userScrolledAway')));
    sync();
    return stateStore.subscribe(sync);
  }, []);
  return away;
}

/* The legacy updateStartBtn/updateSendBtn mirror draft state onto the
   button's `.active` class (canSend = has text or attachments). Observe
   that class so the icon swaps voice ⇄ arrow exactly when the legacy
   contract flips, without duplicating its canSend logic. */
function useControlClass(id: 'startBtn' | 'sendBtn', className: string): boolean {
  const [active, setActive] = useState(
    () => document.getElementById(id)?.classList.contains(className) ?? false,
  );
  useEffect(() => {
    const btn = document.getElementById(id);
    if (!btn) return undefined;
    const sync = () => setActive(btn.classList.contains(className));
    const observer = new MutationObserver(sync);
    observer.observe(btn, { attributes: true, attributeFilter: ['class'] });
    sync();
    return () => observer.disconnect();
  }, [id, className]);
  return active;
}

function useControlActive(id: 'startBtn' | 'sendBtn'): boolean {
  return useControlClass(id, 'active');
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

export function StartButton() {
  const active = useControlActive('startBtn');
  return active ? <SendArrowIcon /> : <VoiceIcon />;
}

export function SendButton() {
  const streamStatus = useChatStreamStatus();
  const active = useControlActive('sendBtn');
  /* ui/sendGlyph.js holds `.is-sending` for one short beat after a
     composer submit: render the departing arrow over the arriving stop
     glyph so the swap reads as one motion instead of arrow → waveform →
     stop flicker while the draft clears and the stream starts. */
  const sending = useControlClass('sendBtn', 'is-sending');
  if (sending) {
    return (
      <>
        <span className="send-glyph send-glyph-out"><SendArrowIcon /></span>
        <span className="send-glyph send-glyph-in"><StopSquareIcon /></span>
      </>
    );
  }
  if (streamStatus === 'streaming') return <StopSquareIcon />;
  return active ? <SendArrowIcon /> : <VoiceIcon />;
}
