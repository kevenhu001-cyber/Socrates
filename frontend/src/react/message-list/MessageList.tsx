import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useEffect, useLayoutEffect, useReducer, useRef, useSyncExternalStore } from 'react';

import {
  getChatRuntimeSnapshot,
  subscribeToChatRuntime,
} from '../chatRuntime.bridge';
import { ErrorBoundary } from '../ErrorBoundary';
import { MessageItem } from './MessageItem';
import { registerDeferredMessageRowsFlusher } from './deferredRows';
import type { LegacyChatMessage } from '../types/domain';
import { reportSwallow } from '../../util/reportSwallow.ts';

const MSG_LIST_ID = 'msgList';

function isRenderable(entry: LegacyChatMessage): boolean {
  /* A streaming entry is renderable as soon as the stream starts: React owns
     the live turn (see react/tool-run/AssistantTurn's `live` mode), which is
     what the status line, the running tool row, and the arriving tail all
     paint from. `chat/toolRuntime.ts` keeps `toolCalls[]` current and main.js
     keeps `rawText` + `_liveStatus` current on this same object. */
  if (typeof entry.type === 'string' && entry.type === 'streaming') return true;
  if (typeof entry.html === 'string' && entry.html.length > 0) return true;
  if (typeof entry.rawText === 'string' && entry.rawText.length > 0) return true;
  return false;
}

function entryId(entry: LegacyChatMessage, fallback: string): string {
  if (typeof entry.clientId === 'string' && entry.clientId.length > 0) return entry.clientId;
  if (typeof entry.id === 'string' && entry.id.length > 0) return entry.id;
  return fallback;
}

let visibleMessagesCache: ReadonlyArray<LegacyChatMessage> = Object.freeze([]);
let visibleMessagesRevision = -1;

function getVisibleMessagesSnapshot(): ReadonlyArray<LegacyChatMessage> {
  const snapshot = getChatRuntimeSnapshot();
  /* The store's revision — not entry identity — is the invalidation signal.
     The legacy pipeline mutates message objects in place (streamed text,
     tool calls settling), so comparing entries would hand React back the
     same array after a publish and the bubble would freeze mid-stream.
     Returning a stable value while the revision is untouched is what
     `useSyncExternalStore` requires of a snapshot reader. */
  if (visibleMessagesRevision === snapshot.revision) return visibleMessagesCache;

  const seen = new Set<string>();
  const next: LegacyChatMessage[] = [];

  snapshot.messages.forEach((entry, idx) => {
    const id = entryId(entry, `idx-${idx}`);
    if (!isRenderable(entry) || seen.has(id)) return;
    seen.add(id);
    next.push(entry);
  });

  visibleMessagesRevision = snapshot.revision;
  visibleMessagesCache = Object.freeze(next);
  return visibleMessagesCache;
}

/* P_progressive-mount — how a long history reaches the DOM.
 *
 * A session switch used to commit every row in one synchronous React pass:
 * markdown + KaTeX + DOMPurify for each assistant turn, innerHTML parsing for
 * all of them, then the first layout of the whole transcript. For a 200-message
 * session that pass alone was a 3–4 s long task at 4x CPU throttle, and nothing
 * — not even the newest answer the user is looking for — painted until it
 * finished.
 *
 * Only the newest INITIAL_ROWS rows commit with the switch. The older rows are
 * prepended CHUNK_ROWS at a time from idle callbacks (or immediately when the
 * reader scrolls toward the top), with the scroll offset corrected so the rows
 * in view never move. Appends — a sent message, a streaming answer — are not
 * affected: deferral only starts when the list is REPLACED, i.e. when the last
 * row the list had committed is no longer part of the new list.
 */
const INITIAL_ROWS = 12;
const CHUNK_ROWS = 12;
/* Start pulling older rows in immediately once the reader is this close to the
   top of what has been mounted. */
const NEAR_TOP_PX = 1200;

interface MountTrack {
  items: ReadonlyArray<LegacyChatMessage>;
  /** id of the first mounted row, or null when every row is mounted. */
  floor: string | null;
}

interface ScrollAnchor {
  height: number;
  top: number;
  pinned: boolean;
}

function lastId(items: ReadonlyArray<LegacyChatMessage>): string | null {
  if (!items.length) return null;
  return entryId(items[items.length - 1], `idx-${items.length - 1}`);
}

/** True when `next` is a different transcript rather than a grown one. */
function isReplacement(prev: ReadonlyArray<LegacyChatMessage>, next: ReadonlyArray<LegacyChatMessage>): boolean {
  const prevLast = lastId(prev);
  if (prevLast === null) return true;
  /* Scan from the end: after an append the previous last row sits within the
     last few entries, so the common case is O(1). */
  for (let i = next.length - 1; i >= 0; i--) {
    if (entryId(next[i], `idx-${i}`) === prevLast) return false;
  }
  return true;
}

function indexOfId(items: ReadonlyArray<LegacyChatMessage>, id: string): number {
  for (let i = 0; i < items.length; i++) {
    if (entryId(items[i], `idx-${i}`) === id) return i;
  }
  return -1;
}

function scrollHost(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.getElementById(MSG_LIST_ID);
}

/* Keep a just-opened history pinned to its newest message while it settles.
   Rows get their real height a few frames late (content-visibility estimates,
   KaTeX / code layout, older rows being prepended in chunks), and on a slow
   device that can take seconds, so a fixed number of re-pins was not enough.
   The pin holds until the reader takes over — wheel, touch, a press on the
   list — or something else moves the scroll position (find-in-session, the
   send-time turn anchor), or STICKY_MS passes. */
const STICKY_MS = 4000;
interface Sticky { list: HTMLElement; expected: number; until: number; frame: number }
let sticky: Sticky | null = null;

function releaseSticky(): void {
  if (sticky && sticky.frame) cancelAnimationFrame(sticky.frame);
  sticky = null;
}

const releaseOnIntent = () => releaseSticky();
let intentBound: HTMLElement | null = null;

function isSticky(list: HTMLElement): boolean {
  return !!sticky && sticky.list === list && performance.now() < sticky.until;
}

function stickTo(list: HTMLElement): void {
  list.scrollTop = list.scrollHeight;
  if (sticky) sticky.expected = list.scrollTop;
}

function pinToBottom(list: HTMLElement): void {
  releaseSticky();
  if (intentBound !== list) {
    for (const type of ['wheel', 'touchstart', 'mousedown'] as const) {
      list.addEventListener(type, releaseOnIntent, { passive: true });
    }
    intentBound = list;
  }
  const state: Sticky = { list, expected: 0, until: performance.now() + STICKY_MS, frame: 0 };
  sticky = state;
  stickTo(list);
  const step = () => {
    if (sticky !== state) return;
    state.frame = 0;
    if (!list.isConnected || performance.now() > state.until) { releaseSticky(); return; }
    /* Someone else scrolled: they own the viewport now. */
    if (Math.abs(list.scrollTop - state.expected) > 1) { releaseSticky(); return; }
    if (list.scrollHeight - list.scrollTop - list.clientHeight > 1) stickTo(list);
    state.frame = requestAnimationFrame(step);
  };
  state.frame = requestAnimationFrame(step);
}

function MessageList() {
  const visibleMessages = useSyncExternalStore(
    subscribeToChatRuntime,
    getVisibleMessagesSnapshot,
    getVisibleMessagesSnapshot,
  );
  const items = visibleMessages;
  const trackRef = useRef<MountTrack>({ items: Object.freeze([]), floor: null });
  const anchorRef = useRef<ScrollAnchor | null>(null);
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  /* Decide the mount floor for THIS render from what was last committed. Pure
     with respect to the refs (they only change in commit / scheduled callbacks),
     so a discarded render leaves nothing behind. */
  let floor = trackRef.current.floor;
  const replaced = items !== trackRef.current.items && isReplacement(trackRef.current.items, items);
  if (replaced) {
    floor = items.length > INITIAL_ROWS
      ? entryId(items[items.length - INITIAL_ROWS], `idx-${items.length - INITIAL_ROWS}`)
      : null;
  }
  let start = 0;
  if (floor !== null) {
    start = indexOfId(items, floor);
    if (start <= 0) { start = 0; floor = null; }
  }
  const mounted = start > 0 ? items.slice(start) : items;

  useLayoutEffect(() => {
    trackRef.current = { items, floor };
    /* Rows were prepended above the viewport: keep what the reader sees still.
       A reader parked at the bottom stays at the bottom. */
    const anchor = anchorRef.current;
    anchorRef.current = null;
    const host = anchor ? scrollHost() : null;
    if (anchor && host) {
      if (anchor.pinned) stickTo(host);
      else host.scrollTop = anchor.top + (host.scrollHeight - anchor.height);
    }
    /* A history that was just opened starts at its newest message. loadSession
       used to set scrollTop before React had committed the new rows, so it
       measured the previous transcript (or a hidden list) and a switch could
       land anywhere — often the very top. Only restored histories qualify: a
       brand-new chat's first bubble belongs to the send-time turn anchor. */
    const last = items.length ? items[items.length - 1] : null;
    if (replaced && last && last.restoredFromHistory) {
      const list = scrollHost();
      if (list) pinToBottom(list);
    } else if (replaced) {
      /* New chat / cleared list: the send-time turn anchor owns the viewport. */
      releaseSticky();
    }
  });

  /* Pull the next older chunk in — from idle time, or straight away when the
     reader is close to the top of the mounted rows. */
  useEffect(() => {
    if (floor === null) return undefined;
    let cancelled = false;
    let idleHandle: number | null = null;
    const expand = (all: boolean) => {
      if (cancelled) return;
      const track = trackRef.current;
      if (track.floor === null) return;
      const idx = indexOfId(track.items, track.floor);
      const next = all || idx <= CHUNK_ROWS ? 0 : idx - CHUNK_ROWS;
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
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (typeof w.requestIdleCallback === 'function') {
      idleHandle = w.requestIdleCallback(() => expand(false), { timeout: 200 });
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
        if (typeof w.cancelIdleCallback === 'function') w.cancelIdleCallback(idleHandle);
        else window.clearTimeout(idleHandle);
      }
      if (host) host.removeEventListener('scroll', onScroll);
      unregisterFlusher();
    };
    /* Keyed on the floor only: streaming commits re-render this list many
       times a second, and re-arming on each would keep pushing the idle
       deadline out. `expand` reads the refs, so a stale closure is harmless. */
  }, [floor]);
  /* P_zero-delay — scroll ownership was here, but it raced with
     turnAnchor.scheduleActiveTurnToTop (single owner now). The
     send-time anchor in chat/turnAnchor.ts already moves the
     viewport to the user bubble on commit; a second scrollTop
     write from React caused the page to jump a frame later.
     History mid-list scroll restoration lives in
     ui/scroll.js#scrollToBottomIfPinned. */

  if (mounted.length === 0) {
    return <div data-react-message-list-empty="1" data-react-owned="1" />;
  }

  return (
    <>
      {mounted.map((entry, idx) => {
        const id = entryId(entry, `idx-${idx + start}`);
        return (
          <MessageItem
            key={id}
            message={entry}
            /* Both are read from mutable legacy state. Passing them as props
               is what lets the memoized row notice a change that left every
               object identity intact. */
            textLength={typeof entry.rawText === 'string' ? entry.rawText.length : 0}
            toolRevision={entry._toolRunRev || 0}
            mathRevision={typeof window === 'undefined' ? 0 : (window as any).__socratesMathRenderRev || 0}
            renderRevision={(entry as any)._katexRenderedRev || (entry as any)._renderRev || 0}
          />
        );
      })}
    </>
  );
}

/* The mount flag lives in ui/msgListMount.ts so the legacy chat layer can ask
   the same question without importing this React module (see the chat-layering
   check script). */
import { isMsgListMounted, setMsgListMounted } from '../../ui/msgListMount.ts';

/**
 * Mounts the React message list into the existing `#msgList` element.
 *
 * The host element keeps its id and its CSS classes. React only owns
 * its children — the legacy authoring paths (`addMessage`, session
 * history reload, branch context restore) detect the mounted runtime
 * via `dataset.reactMigrationRuntime === 'msg-list'` and skip their
 * direct DOM mutation. The legacy state push remains the authoritative
 * write; React renders from the chat runtime snapshot.
 *
 * A streaming bubble belongs to React too: the live turn renders from the
 * same `rawText` + `toolCalls` as a finalized one, with the chrome (status
 * line, running row) coming from `_liveStatus`. When the runtime is not
 * mounted, `main.js` keeps painting its own bubble — every legacy writer
 * checks the dataset flags this function sets before that hand-off.
 */
export function mountMessageList(): { root: Root | null } {
  const container = document.getElementById(MSG_LIST_ID);
  if (!container) return { root: null };
  if (isMsgListMounted()) return { root: null };
  // The read-only share view renders #msgList itself; never mount over it.
  if (window.__socratesShareMsgListTakeover) return { root: null };

  const root = createRoot(container);
  root.render(<ErrorBoundary><MessageList /></ErrorBoundary>);
  setMsgListMounted(true);

  window.__socratesReleaseMsgListReact = () => {
    try { root.unmount(); } catch (e) { reportSwallow(e, 'MessageList.releaseMsgListReact.unmount'); /* already unmounted */ }
    setMsgListMounted(false);
    delete window.__socratesReleaseMsgListReact;
  };

  return { root };
}

export { MessageList };
export type { LegacyChatMessage };
