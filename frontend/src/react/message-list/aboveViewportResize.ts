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
import { writeScrollTop } from '../../ui/scrollCoordinator.ts';

interface Keeper {
  host: HTMLElement;
  observer: ResizeObserver;
  heights: WeakMap<Element, number>;
  observed: Set<Element>;
}

let keeper: Keeper | null = null;

function viewportOwnedElsewhere(host: HTMLElement): boolean {
  return isSticky(host)
    || host.dataset.turnAnchorSettling === 'true'
    || host.dataset.turnViewportOwner === 'turn';
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
  writeScrollTop(host, host.scrollTop + delta, 'history');
}

function keeperFor(host: HTMLElement): Keeper | null {
  if (typeof ResizeObserver !== 'function') return null;
  if (keeper && keeper.host === host) return keeper;
  keeper?.observer.disconnect();
  keeper = { host, observer: new ResizeObserver(onResize), heights: new WeakMap(), observed: new Set() };
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
}

/** Call in the transcript's mount hook, after the layout effect that
    corrects the scroll anchor: it runs on every commit and picks up the rows
    that commit mounted. */
export function useAboveViewportResizeCompensation(): void {
  useLayoutEffect(() => { trackMountedRowHeights(); });
  useEffect(() => stopTrackingRowHeights, []);
}
