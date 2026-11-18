import { useEffect, useState } from 'react';
import { Button } from '../ui/shadcn/button';
import { i18n } from '../legacy/gateway';
import { useConversationActive } from '../topbar/useConversationActive.ts';
import { scrollContainer, scrollMainToBottom, SCROLL_SLACK } from '../../legacy/scroll.ts';

/**
 * The line above the question box in a conversation, after the 2026-11-18
 * phone reference: while the reader is at the latest message it is the quiet
 * disclaimer ("Socrates can make mistakes…"); once they scroll away it turns
 * into a round "•••" chip that brings them back to the latest message.
 */
function useTranscriptAwayFromBottom(active: boolean): boolean {
  const [away, setAway] = useState(false);
  useEffect(() => {
    if (!active) {
      setAway(false);
      return undefined;
    }
    /* Measured only when something scrolls (captured at the document, since
       scroll does not bubble) or the viewport resizes: never per streamed
       token, so the streaming hot path pays no forced layout for it. While
       the reader follows the answer, auto-follow scrolls and re-measures. */
    let frame = 0;
    const measure = () => {
      frame = 0;
      const scroller = scrollContainer();
      if (!scroller) return;
      const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      setAway(distance > SCROLL_SLACK);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    document.addEventListener('scroll', schedule, { capture: true, passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    schedule();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener('scroll', schedule, { capture: true });
      window.removeEventListener('resize', schedule);
    };
  }, [active]);
  return away;
}

export function ComposerOverhead() {
  const conversationActive = useConversationActive();
  const away = useTranscriptAwayFromBottom(conversationActive);
  if (!conversationActive) return null;
  return (
    <div className="composer-overhead" data-state={away ? 'away' : 'latest'}>
      {away ? (
        <Button
          type="button"
          variant="ghost"
          className="composer-jump-latest"
          aria-label={i18n('composer.jumpToLatest', 'Scroll to latest')}
          title={i18n('composer.jumpToLatest', 'Scroll to latest')}
          onClick={() => scrollMainToBottom({ force: true, smooth: true })}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor">
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </Button>
      ) : (
        <p className="composer-disclaimer">
          {i18n('composer.disclaimer', 'Socrates can make mistakes. Check important info.')}
        </p>
      )}
    </div>
  );
}
