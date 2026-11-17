/* Keep the reader's rows still while rows above the viewport change height.
 *
 * #msgList disables native scroll anchoring (overflow-anchor: none) because
 * the mount window and the turn anchor correct scrollTop themselves. Those
 * corrections run once, in the commit that mounts rows. A row mounted above
 * the viewport by an upward window shift (or an older history page) first
 * lays out at its contain-intrinsic-size guess (90px / 240px) and reaches its
 * real height a frame or two later, when content-visibility renders it, its
 * deferred wiring runs, or a visualization finishes. Without compensation
 * every such growth pushed the row the reader was looking at down by the
 * difference — over a thousand pixels per shift on code- and chart-heavy
 * history.
 *
 * One ResizeObserver watches the mounted message rows. When a row that sits
 * entirely above the visible top of the transcript changes height, scrollTop
 * moves by the same amount, before paint. Rows in or below the viewport are
 * left alone (their growth never moves what is above them), and the bottom
 * follow and the send-turn anchor keep sole ownership while they are active.
 */
import { useEffect, useLayoutEffect } from 'react';

import { isSticky, scrollHost } from './messageScroll';
import { uiBridge } from '../../store/index.ts';
import { scrollOwnerOf, writeScrollTop } from '../../legacy/scrollCoordinator.ts';

interface Keeper {
  host: HTMLElement;
  observer: ResizeObserver;
  heights: WeakMap<Element, number>;
  observed: Set<Element>;
}

let keeper: Keeper | null = null;

function viewportOwnedElsewhere(host: HTMLElement): boolean {
  /* The send anchor owns the prompt's TOP OFFSET, not the height of the rows
     inside the answer. While a turn is live a tool row, an expanded step or a
     visualization lands above the reader's paragraph and grows that row; the
     anchor never watches it, so without this compensation the paragraph under
     the reader slides down on every such mount. Only the send glide
     (`turnAnchorSettling`) owns the transcript outright — it is animating
     scrollTop itself and a parallel write would fight it. */
  return isSticky(host) || host.dataset.turnAnchorSettling === 'true';
}

function borderBoxHeight(entry: ResizeObserverEntry): number {
  const box = entry.borderBoxSize && entry.borderBoxSize[0];
  return box ? box.blockSize : entry.target.getBoundingClientRect().height;
}

function onResize(entries: ResizeObserverEntry[]): void {
  const current = keeper;
  if (!current) return;
  const { host, heights } = current;
  let delta = 0;
  let hostTop: number | null = null;
  for (const entry of entries) {
    const height = borderBoxHeight(entry);
    const previous = heights.get(entry.target);
    heights.set(entry.target, height);
    if (previous === undefined || previous === height || !entry.target.isConnected) continue;
    if (hostTop === null) hostTop = host.getBoundingClientRect().top;
    if (entry.target.getBoundingClientRect().bottom <= hostTop + 1) delta += height - previous;
  }
  if (Math.abs(delta) < 0.5 || viewportOwnedElsewhere(host)) return;
  /* A reader already at the bottom is followed by the content-follow path.
     The browser also clamps their scrollTop to the new maximum in the same
     layout pass; adding this delta again moved them up by the shrink a
     second time (the send reserve retiring two 184px rows left a pinned
     reader 368px behind). Let the clamp stand and let follow own the tail. */
  const maxTop = Math.max(0, host.scrollHeight - host.clientHeight);
  if (host.scrollTop >= maxTop - 1) return;
  /* `anchor`, not `history`: while a turn anchor holds the transcript a
     history-priority write is rejected outright, which is how this
     compensation silently stopped running during a live turn. */
  writeScrollTop(host, host.scrollTop + delta, 'anchor');
}

function keeperFor(host: HTMLElement): Keeper | null {
  if (typeof ResizeObserver !== 'function') return null;
  if (keeper && keeper.host === host) return keeper;
  keeper?.observer.disconnect();
  keeper = {
    host,
    observer: new ResizeObserver(onResize),
    heights: new WeakMap(),
    observed: new Set(),
  };
  return keeper;
}

/** Observe the rows currently mounted in #msgList. */
function trackMountedRowHeights(): void {
  const host = scrollHost();
  const current = host ? keeperFor(host) : null;
  if (!host || !current) return;
  for (const element of current.observed) {
    if (element.parentElement !== host) {
      current.observer.unobserve(element);
      current.observed.delete(element);
    }
  }
  for (const child of Array.from(host.children)) {
    if (!child.classList.contains('msg') || current.observed.has(child)) continue;
    current.observed.add(child);
    /* Seed with the height this commit laid the row out at, so growth that
       lands before the observer's first notification is still compensated. */
    current.heights.set(child, child.getBoundingClientRect().height);
    current.observer.observe(child);
  }
}

function stopTrackingRowHeights(): void {
  keeper?.observer.disconnect();
  keeper = null;
  if (rememberFrame) cancelAnimationFrame(rememberFrame);
  rememberFrame = 0;
  readingAnchor = null;
  readingMutations?.disconnect();
  readingMutations = null;
  readingAnchorDirty = true;
}

/* ── Reading anchor ────────────────────────────────────────────────────────
 * The resize observer above can only see elements that CHANGE HEIGHT. A tool
 * row or a chart that MOUNTS between two paragraphs does not resize anything
 * — it pushes every following block down — so during a live turn the
 * paragraph under the reader slid away with no observed resize at all.
 *
 * This anchor remembers the block at the top of the viewport after each
 * painted commit and restores its offset in the next commit's layout phase
 * (before paint). The offset is measured against the scroller, so an ordinary
 * scroll never looks like drift. Identity is the block's text prefix (prose
 * only grows at its end), with its position as the fallback.
 */
interface ReadingAnchor {
  host: HTMLElement;
  block: HTMLElement;
  clientId: string;
  text: string;
  index: number;
  /** Block top minus the scroller's top, in px. Scroll-invariant. */
  offset: number;
}

let readingAnchor: ReadingAnchor | null = null;
let rememberFrame = 0;
let readingMutations: MutationObserver | null = null;
let readingAnchorDirty = true;

/** DOM after the anchored block cannot move its top. Avoid synchronous
 * scrollHeight/layout reads on every streamed token below the reader. */
export function mutationsCanMoveReadingBlock(block: Element, records: MutationRecord[]): boolean {
  if (!block.isConnected) return true;
  return records.some((record) => {
    const position = block.compareDocumentPosition(record.target);
    // A descendant is FOLLOWING too, so exclude CONTAINED_BY from the fast path.
    return !(position & 4) || !!(position & 16) || !!(position & 1);
  });
}

function markReadingMutations(records: MutationRecord[]): void {
  if (!readingAnchor || mutationsCanMoveReadingBlock(readingAnchor.block, records))
    readingAnchorDirty = true;
}

function escapeClientId(id: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/["\\]/g, '\\$&');
}

/** Streaming prose already has stable paragraph blocks. Anchoring the whole
 * answer treats every token as a change to the reader's block. */
export function readingBlocksOf(row: Element): NodeListOf<HTMLElement> {
  const prose = row.querySelectorAll<HTMLElement>('.tool-run-prose');
  return prose.length ? prose : row.querySelectorAll<HTMLElement>('.msg-body > *');
}

function blockTextOf(element: Element): string {
  return (element.textContent || '').trim().slice(0, 80);
}

function readerPinned(host: HTMLElement): boolean {
  return isSticky(host) || host.scrollHeight - host.scrollTop - host.clientHeight <= 2;
}

/**
 * Only a reader who has expressed upward intent owns a fixed position. While
 * the transcript is following the bottom, the send glide is animating, or the
 * keyboard anchor is working, those motions own the scroll and a second
 * correction would read as drift — the exact class of bug this module is
 * meant to remove.
 */
function readerHoldsPosition(): boolean {
  return uiBridge.getSnapshot()._userScrolledAway === true;
}

function canRestoreReadingAnchor(host: HTMLElement | null, anchor: ReadingAnchor | null): boolean {
  if (!anchor || !host || host !== anchor.host) return false;
  if (!readerHoldsPosition() || readerPinned(host)) return false;
  if (host.dataset.turnAnchorSettling === 'true') return false;
  const owner = scrollOwnerOf(host);
  return owner === null || owner === 'history' || owner === 'anchor';
}

function findMatchingReadingBlock(row: HTMLElement, anchor: ReadingAnchor): HTMLElement | null {
  const blocks = readingBlocksOf(row);
  if (anchor.text) {
    for (let index = 0; index < blocks.length; index++) {
      if (blockTextOf(blocks[index]) === anchor.text) return blocks[index];
    }
  }
  return blocks[anchor.index] || null;
}

function restoreReadingAnchor(): void {
  const anchor = readingAnchor;
  if (!anchor) return;
  const host = scrollHost();
  if (!host || host !== anchor.host) {
    readingAnchor = null;
    return;
  }
  if (!canRestoreReadingAnchor(host, anchor)) return;
  const row = host.querySelector<HTMLElement>(
    '.msg[data-client-id="' + escapeClientId(anchor.clientId) + '"]',
  );
  if (!row) {
    readingAnchor = null;
    return;
  }
  const block = findMatchingReadingBlock(row, anchor);
  if (!block) return;
  const offset = block.getBoundingClientRect().top - host.getBoundingClientRect().top;
  const delta = offset - anchor.offset;
  /* A huge delta means the identity guess matched the wrong block; leaving
     the reader alone is better than teleporting the transcript. */
  if (Math.abs(delta) <= 0.5 || Math.abs(delta) > 1600) return;
  writeScrollTop(host, host.scrollTop + delta, 'anchor');
}

function rememberReadingAnchor(): void {
  rememberFrame = 0;
  const host = scrollHost();
  if (!host || !readerHoldsPosition() || readerPinned(host)) {
    readingAnchor = null;
    return;
  }
  const hostTop = host.getBoundingClientRect().top;
  for (const row of Array.from(host.children)) {
    if (!(row instanceof HTMLElement) || !row.classList.contains('msg')) continue;
    const clientId = row.dataset.clientId;
    if (!clientId) continue;
    const blocks = readingBlocksOf(row);
    for (let index = 0; index < blocks.length; index++) {
      const rect = blocks[index].getBoundingClientRect();
      if (rect.height <= 0 || rect.bottom <= hostTop + 1) continue;
      readingAnchor = {
        host,
        block: blocks[index],
        clientId,
        text: blockTextOf(blocks[index]),
        index,
        offset: rect.top - hostTop,
      };
      return;
    }
  }
  readingAnchor = null;
}

function scheduleRememberAnchor(): void {
  if (rememberFrame) return;
  rememberFrame = requestAnimationFrame(rememberReadingAnchor);
}

function onReaderScroll(): void {
  scheduleRememberAnchor();
}

/** Call in the transcript's mount hook, after the layout effect that
    corrects the scroll anchor: it runs on every commit and picks up the rows
    that commit mounted. */
export function useAboveViewportResizeCompensation(): void {
  useLayoutEffect(() => {
    /* Before paint: keep the anchored block where the reader left it. After
       paint: remember the block that is now at the top of the viewport. */
    if (readingMutations) markReadingMutations(readingMutations.takeRecords());
    if (!readingMutations || readingAnchorDirty || !readingAnchor) {
      readingAnchorDirty = false;
      restoreReadingAnchor();
      scheduleRememberAnchor();
    }
    trackMountedRowHeights();
  });
  useEffect(() => {
    const host = scrollHost();
    if (host && typeof MutationObserver === 'function') {
      readingMutations = new MutationObserver(markReadingMutations);
      readingMutations.observe(host, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
      });
    }
    host?.addEventListener('scroll', onReaderScroll, { passive: true });
    return () => {
      host?.removeEventListener('scroll', onReaderScroll);
      stopTrackingRowHeights();
    };
  }, []);
}
