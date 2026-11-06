import { flushSync } from 'react-dom';
import { useEffect, useLayoutEffect, useReducer, useRef, type RefObject } from 'react';

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
  hasLiveTail,
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
import { entryId } from './messageIdentity';
import { setOffscreenMount } from './nearViewport';
import { canLoadOlderHistory, registerBeforeOlderRows, requestOlderHistory } from '../../session/historyPagingState.ts';

function sameWindow(track: MountTrack, next: MountWindowState): boolean {
  return track.floor === next.floor
    && track.ceiling === next.ceiling
    && track.full === next.full;
}

export function turnOwnsMountViewport(host: Pick<HTMLElement, 'dataset'>): boolean {
  return host.dataset.turnAnchorSettling === 'true'
    || host.dataset.turnViewportOwner === 'turn';
}

/* R7 phase 2 — older history pages are prepended to the store. Right before
   they publish, capture the scroll anchor against the pre-prepend DOM and pin
   the window to its current first row, so the prepend mounts nothing new and
   the reader's row stays put; later scrolling reveals the new rows through
   the ordinary 'older' shifts. A full mount (find) keeps mounting everything,
   with the anchor still held. */
function useHistoryPrepend(
  trackRef: RefObject<MountTrack>,
  anchorRef: RefObject<ScrollAnchor | null>,
): void {
  useEffect(() => registerBeforeOlderRows(() => {
    const track = trackRef.current;
    const host = scrollHost();
    anchorRef.current = host ? captureScrollAnchor(host) : null;
    if (!track.full && track.floor === null && track.items.length) {
      trackRef.current = { ...track, floor: entryId(track.items[0], 'idx-0') };
    }
  }), [anchorRef, trackRef]);
}

/* R7 phase 2 — once the oldest loaded row is mounted (and the transcript is
   not in a full mount), reaching the top asks the server for the previous
   page. At scrollTop 0 an upward wheel or touch gesture emits no scroll
   event, so those gestures retry a failed page too; a transcript too short to
   scroll fetches the previous page once the browser is idle. */
function useOlderHistoryTrigger(atOldestRow: boolean, itemCount: number): void {
  useEffect(() => {
    const host = atOldestRow ? scrollHost() : null;
    if (!host) return undefined;
    const loadOlder = () => {
      if (turnOwnsMountViewport(host) || !canLoadOlderHistory()) return;
      void requestOlderHistory();
    };
    const onScroll = () => {
      if (host.scrollTop < NEAR_TOP_PX) loadOlder();
    };
    const onUpwardIntent = (event: Event) => {
      if (host.scrollTop >= NEAR_TOP_PX) return;
      if (event.type === 'wheel' && (event as WheelEvent).deltaY >= 0) return;
      loadOlder();
    };
    host.addEventListener('scroll', onScroll, { passive: true });
    host.addEventListener('wheel', onUpwardIntent, { passive: true });
    host.addEventListener('touchmove', onUpwardIntent, { passive: true });
    const idle = (window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
    const fillTimer = host.scrollHeight <= host.clientHeight + NEAR_TOP_PX
      ? window.setTimeout(() => {
        if (typeof idle === 'function') idle.call(window, loadOlder, { timeout: 200 });
        else loadOlder();
      }, 0)
      : null;
    return () => {
      if (fillTimer !== null) window.clearTimeout(fillTimer);
      host.removeEventListener('scroll', onScroll);
      host.removeEventListener('wheel', onUpwardIntent);
      host.removeEventListener('touchmove', onUpwardIntent);
    };
  }, [atOldestRow, itemCount]);
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
  const liveTail = hasLiveTail(items);

  useLayoutEffect(() => {
    /* Children's layout effects ran first: rows mounted by a window shift
       have already read the off-screen flag. */
    setOffscreenMount(false);
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
        setOffscreenMount(true);
        rerender();
      });
      setOffscreenMount(false);
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

  useHistoryPrepend(trackRef, anchorRef);
  useOlderHistoryTrigger(start === 0 && !full, items.length);

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
      if (cancelled || turnOwnsMountViewport(host)) return;
      const track = trackRef.current;
      const next = shiftMountWindow(track.items, track, direction);
      if (sameWindow(track, next)) return;
      anchorRef.current = captureScrollAnchor(host);
      trackRef.current = { ...track, ...next };
      cancelled = true;
      /* Rows revealed by a shift sit outside the viewport (above it while
         scrolling up, below it while scrolling down): their heavy wiring
         waits until they come within reach. */
      setOffscreenMount(true);
      rerender();
    };

    const onScroll = () => {
      if (cancelled) return;
      if (turnOwnsMountViewport(host)) return;
      if (start > 0 && host.scrollTop < NEAR_TOP_PX) {
        /* While a response streams, keep its tail row resident. We may grow
           backward up to the cap, but we do not slide the whole window away
           from the live assistant row. */
        if (!liveTail || mounted.length < MAX_MOUNTED_ROWS) shift('older');
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
      const fill = () => {
        if (!turnOwnsMountViewport(host)) shift('older');
      };
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
  }, [ceiling, end, floor, full, items.length, liveTail, mounted.length, start]);

  return { mounted, start };
}
