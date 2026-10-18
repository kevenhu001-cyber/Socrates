import { flushSync } from 'react-dom';
import { useEffect, useLayoutEffect, useReducer, useRef } from 'react';

import { registerDeferredMessageRowsFlusher } from './deferredRows';
import {
  captureScrollAnchor,
  correctScrollAnchor,
  pinToBottom,
  releaseSticky,
  scrollHost,
} from './messageScroll';
import {
  fullMountWindow,
  indexOfId,
  MAX_MOUNTED_ROWS,
  NEAR_BOTTOM_PX,
  NEAR_TOP_PX,
  resolveMountedRows,
  shiftMountWindow,
  windowAroundIndex,
  type MountTrack,
  type MountWindowState,
  type ScrollAnchor,
} from './progressiveMount';
import type { LegacyChatMessage } from '../types/domain';

function sameWindow(track: MountTrack, next: MountWindowState): boolean {
  return track.floor === next.floor
    && track.ceiling === next.ceiling
    && track.full === next.full;
}

export function useProgressiveMessageMount(items: ReadonlyArray<LegacyChatMessage>): {
  mounted: ReadonlyArray<LegacyChatMessage>;
  start: number;
} {
  const trackRef = useRef<MountTrack>({
    items: Object.freeze([]),
    floor: null,
    ceiling: null,
    full: false,
  });
  const anchorRef = useRef<ScrollAnchor | null>(null);
  const [, rerender] = useReducer((count: number) => count + 1, 0);
  const mountWindow = resolveMountedRows(items, trackRef.current);
  const { ceiling, end, floor, full, mounted, replaced, start } = mountWindow;

  useLayoutEffect(() => {
    trackRef.current = { items, floor, ceiling, full };
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

  useEffect(() => registerDeferredMessageRowsFlusher(
    () => {
      const track = trackRef.current;
      if (track.full) return;
      flushSync(() => {
        const host = scrollHost();
        anchorRef.current = host ? captureScrollAnchor(host) : null;
        const next = fullMountWindow();
        trackRef.current = { ...track, ...next };
        rerender();
      });
    },
    () => {
      const track = trackRef.current;
      if (!track.full) return;
      flushSync(() => {
        const host = scrollHost();
        const anchor = host ? captureScrollAnchor(host) : null;
        anchorRef.current = anchor;
        const anchorIndex = anchor?.clientId
          ? indexOfId(track.items, anchor.clientId)
          : track.items.length - 1;
        const next = windowAroundIndex(track.items, anchorIndex >= 0 ? anchorIndex : track.items.length - 1);
        trackRef.current = { ...track, ...next };
        rerender();
      });
    },
  ), []);

  useEffect(() => {
    if (full) return undefined;
    const host = scrollHost();
    if (!host) return undefined;

    let cancelled = false;
    let idleHandle: number | null = null;
    const browser = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const shift = (direction: 'older' | 'newer') => {
      if (cancelled) return;
      const track = trackRef.current;
      const next = shiftMountWindow(track.items, track, direction);
      if (sameWindow(track, next)) return;
      anchorRef.current = captureScrollAnchor(host);
      trackRef.current = { ...track, ...next };
      cancelled = true;
      rerender();
    };

    const onScroll = () => {
      if (cancelled) return;
      if (start > 0 && host.scrollTop < NEAR_TOP_PX) {
        shift('older');
        return;
      }
      const distanceFromBottom = host.scrollHeight - host.scrollTop - host.clientHeight;
      if (end < items.length && distanceFromBottom < NEAR_BOTTOM_PX) shift('newer');
    };

    host.addEventListener('scroll', onScroll, { passive: true });

    /* Only fill enough older history to make the initial window comfortably
       scrollable. The previous implementation kept expanding every idle frame
       until the entire transcript lived in the DOM. */
    if (
      start > 0
      && mounted.length < MAX_MOUNTED_ROWS
      && host.scrollHeight <= host.clientHeight + NEAR_TOP_PX
    ) {
      const fill = () => shift('older');
      if (typeof browser.requestIdleCallback === 'function') {
        idleHandle = browser.requestIdleCallback(fill, { timeout: 200 });
      } else {
        idleHandle = window.setTimeout(fill, 32);
      }
    }

    return () => {
      cancelled = true;
      if (idleHandle !== null) {
        if (typeof browser.cancelIdleCallback === 'function') browser.cancelIdleCallback(idleHandle);
        else window.clearTimeout(idleHandle);
      }
      host.removeEventListener('scroll', onScroll);
    };
  }, [ceiling, end, floor, full, items.length, mounted.length, start]);

  return { mounted, start };
}
