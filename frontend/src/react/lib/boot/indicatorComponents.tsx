/**
 * Indicator components — small React roots the legacy pipeline reads
 * through `host.dataset.mountedBy`.
 *
 * These render only the parts of the legacy shell that needed
 * declarative state; the rest stays in legacy markup. Extracted out
 * of `bootstrap.tsx` so the bootstrap module stays under the M2
 * 100-line budget.
 */

import { useEffect, useState } from 'react';
import { useChatStreamStatus, useIsChatStreaming } from '../../useChatRuntime';

const ICON_PROPS = {
  fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
} as const;

function VoiceIcon() { return <svg viewBox="0 0 24 24" {...ICON_PROPS} strokeWidth="2" className="icon-voice"><path d="M4 10v4M8 7v10M12 5v14M16 8v8M20 10v4" /></svg>; }
function SendArrowIcon() { return <svg viewBox="0 0 24 24" {...ICON_PROPS} strokeWidth="2.5" className="icon-arrow"><path d="M12 19V5M5 12l7-7 7 7" /></svg>; }
function StopSquareIcon() { return <svg viewBox="0 0 24 24" {...ICON_PROPS} strokeWidth="2"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>; }

function useButtonActive(buttonId: string): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const button = document.getElementById(buttonId);
    if (!button) return undefined;
    const sync = () => setActive(button.classList.contains('active'));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(button, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [buttonId]);
  return active;
}

export function NewReplyPill() {
  /* Establish the first React subscription without changing the legacy
     element's markup, text, visibility logic, or delegated click
     behavior. */
  useIsChatStreaming();
  return <>↓ New reply</>;
}

export function StartButton() {
  return useButtonActive('startBtn') ? <SendArrowIcon /> : <VoiceIcon />;
}

export function SendButton() {
  const streamStatus = useChatStreamStatus();
  const isActive = useButtonActive('sendBtn');
  return streamStatus === 'streaming'
    ? <StopSquareIcon />
    : isActive ? <SendArrowIcon /> : <VoiceIcon />;
}
