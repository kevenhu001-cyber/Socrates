import { flushSync } from 'react-dom';
import { useEffect, useLayoutEffect, useReducer, useRef } from 'react';

import { registerDeferredMessageRowsFlusher } from './deferredRows';
import { correctScrollAnchor, isSticky, pinToBottom, releaseSticky, scrollHost } from './messageScroll';
import { CHUNK_ROWS, indexOfId, NEAR_TOP_PX, resolveMountedRows, type MountTrack, type ScrollAnchor } from './progressiveMount';
import { entryId } from './messageIdentity';
import type { LegacyChatMessage } from '../types/domain';

export function useProgressiveMessageMount(items: ReadonlyArray<LegacyChatMessage>): {
  mounted: ReadonlyArray<LegacyChatMessage>;
  start: number;
} {
  const trackRef = useRef<MountTrack>({ items: Object.freeze([]), floor: null });
  const anchorRef = useRef<ScrollAnchor | null>(null);
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  const mountWindow = resolveMountedRows(items, trackRef.current);
  const { floor, mounted, replaced, start } = mountWindow;

  useLayoutEffect(() => {
    trackRef.current = { items, floor };
    const anchor = anchorRef.current;
    anchorRef.current = null;
    const host = anchor ? scrollHost() : null;
    if (anchor && host) correctScrollAnchor(anchor, host);

    const last = items.length ? items[items.length - 1] : null;
    if (replaced && last?.restoredFromHistory) {
      const list = scrollHost();
      if (list) pinToBottom(list);
    } else if (replaced) {
      releaseSticky();
    }
  });

  useEffect(() => {
    if (floor === null) return undefined;
    let cancelled = false;
    let idleHandle: number | null = null;
    const expand = (all: boolean) => {
      if (cancelled) return;
      const track = trackRef.current;
      if (track.floor === null) return;
      const index = indexOfId(track.items, track.floor);
      const next = all || index <= CHUNK_ROWS ? 0 : index - CHUNK_ROWS;
      const host = scrollHost();
      if (host) {
        anchorRef.current = {
          height: host.scrollHeight,
          top: host.scrollTop,
          pinned: isSticky(host) || host.scrollHeight - host.scrollTop - host.clientHeight <= 2,
        };
      }
      track.floor = next > 0 ? entryId(track.items[next], `idx-${next}`) : null;
      cancelled = true;
      rerender();
    };
    const browser = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (typeof browser.requestIdleCallback === 'function') {
      idleHandle = browser.requestIdleCallback(() => expand(false), { timeout: 200 });
    } else {
      idleHandle = window.setTimeout(() => expand(false), 32);
    }
    const host = scrollHost();
    const onScroll = () => {
      if (host && host.scrollTop < NEAR_TOP_PX) expand(false);
    };
    if (host) host.addEventListener('scroll', onScroll, { passive: true });
    const unregisterFlusher = registerDeferredMessageRowsFlusher(
      () => { flushSync(() => expand(true)); },
    );
    return () => {
      cancelled = true;
      if (idleHandle !== null) {
        if (typeof browser.cancelIdleCallback === 'function') browser.cancelIdleCallback(idleHandle);
        else window.clearTimeout(idleHandle);
      }
      if (host) host.removeEventListener('scroll', onScroll);
      unregisterFlusher();
    };
    /* Stream renders do not re-arm the idle timer; expansion reads current refs. */
  }, [floor]);

  return { mounted, start };
}
