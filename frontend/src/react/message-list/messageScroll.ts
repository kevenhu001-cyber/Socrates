import type { ScrollAnchor } from './progressiveMount';
import { writeScrollTop } from '../../ui/scrollCoordinator.ts';

const MSG_LIST_ID = 'msgList';
const STICKY_MS = 4000;

interface Sticky {
  list: HTMLElement;
  expected: number;
  until: number;
  frame: number;
  timer: ReturnType<typeof setTimeout> | null;
  resizeObserver: ResizeObserver | null;
}

let sticky: Sticky | null = null;
let intentBound: HTMLElement | null = null;

export function scrollHost(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.getElementById(MSG_LIST_ID);
}

export function releaseSticky(): void {
  if (sticky?.frame) cancelAnimationFrame(sticky.frame);
  if (sticky?.timer != null) clearTimeout(sticky.timer);
  sticky?.resizeObserver?.disconnect();
  sticky = null;
}

function releaseOnIntent(): void {
  releaseSticky();
}

export function isSticky(list: HTMLElement): boolean {
  return Boolean(sticky && sticky.list === list && performance.now() < sticky.until);
}

const FADE_SIZE_PX = 28;

export function updateScrollFadeMask(list: HTMLElement | null): void {
  if (!list) return;
  const { scrollTop = 0, scrollHeight = 0, clientHeight = 0 } = list;
  const isAtTop = scrollTop <= 2;
  const isAtBottom = scrollTop + clientHeight >= scrollHeight - 2;
  const topVal = isAtTop ? '0px' : `${FADE_SIZE_PX}px`;
  const bottomVal = isAtBottom ? '0px' : `${FADE_SIZE_PX}px`;
  if (list.style.getPropertyValue('--ui-scroll-fade-top') !== topVal) {
    list.style.setProperty('--ui-scroll-fade-top', topVal);
  }
  if (list.style.getPropertyValue('--ui-scroll-fade-bottom') !== bottomVal) {
    list.style.setProperty('--ui-scroll-fade-bottom', bottomVal);
  }
}

export function stickTo(list: HTMLElement): void {
  writeScrollTop(list, list.scrollHeight, 'content');
  if (sticky) sticky.expected = list.scrollTop;
  updateScrollFadeMask(list);
}

export function pinToBottom(list: HTMLElement): void {
  releaseSticky();
  if (intentBound !== list) {
    for (const type of ['wheel', 'touchstart', 'mousedown'] as const) {
      list.addEventListener(type, releaseOnIntent, { passive: true });
    }
    intentBound = list;
  }
  const state: Sticky = {
    list,
    expected: 0,
    until: performance.now() + STICKY_MS,
    frame: 0,
    timer: null,
    resizeObserver: null,
  };
  sticky = state;
  stickTo(list);
  const maintain = () => {
    if (sticky !== state) return;
    state.frame = 0;
    if (!list.isConnected || performance.now() > state.until) {
      releaseSticky();
      return;
    }
    if (Math.abs(list.scrollTop - state.expected) > 1) {
      releaseSticky();
      return;
    }
    if (list.scrollHeight - list.scrollTop - list.clientHeight > 1) stickTo(list);
  };
  /* History replacement can grow as images, fonts, or deferred rows settle.
     Observe those real geometry changes instead of polling scrollTop on every
     frame for four seconds. The old loop competed with the send glide and the
     content-follow observer even when the list was unchanged. */
  if (typeof ResizeObserver === 'function') {
    state.resizeObserver = new ResizeObserver(maintain);
    state.resizeObserver.observe(list);
  } else {
    /* Older WebViews get one best-effort follow-up frame, not a permanent
       fallback loop. */
    state.frame = requestAnimationFrame(maintain);
  }
  state.timer = setTimeout(() => {
    if (sticky === state) releaseSticky();
  }, STICKY_MS);
}

function firstVisibleMessageRow(host: HTMLElement): HTMLElement | null {
  const hostRect = host.getBoundingClientRect();
  for (const child of Array.from(host.children)) {
    if (!(child instanceof HTMLElement) || !child.classList.contains('msg')) continue;
    if (!child.dataset.clientId) continue;
    const rect = child.getBoundingClientRect();
    if (rect.bottom >= hostRect.top + 1) return child;
  }
  return null;
}

export function captureScrollAnchor(host: HTMLElement): ScrollAnchor {
  const pinned = isSticky(host) || host.scrollHeight - host.scrollTop - host.clientHeight <= 2;
  const anchor: ScrollAnchor = {
    height: host.scrollHeight,
    top: host.scrollTop,
    pinned,
  };
  if (pinned) return anchor;

  const row = firstVisibleMessageRow(host);
  if (!row?.dataset.clientId) return anchor;
  anchor.clientId = row.dataset.clientId;
  anchor.visualTop = row.getBoundingClientRect().top - host.getBoundingClientRect().top;
  return anchor;
}

function rowByClientId(host: HTMLElement, clientId: string): HTMLElement | null {
  for (const child of Array.from(host.children)) {
    if (child instanceof HTMLElement && child.dataset.clientId === clientId) return child;
  }
  return null;
}

export function correctScrollAnchor(anchor: ScrollAnchor, host: HTMLElement): void {
  if (anchor.pinned) {
    stickTo(host);
    return;
  }
  if (anchor.clientId && Number.isFinite(anchor.visualTop)) {
    const row = rowByClientId(host, anchor.clientId);
    if (row) {
      const visualTop = row.getBoundingClientRect().top - host.getBoundingClientRect().top;
      writeScrollTop(host, host.scrollTop + (visualTop - Number(anchor.visualTop)), 'history');
      return;
    }
  }
  writeScrollTop(host, anchor.top + (host.scrollHeight - anchor.height), 'history');
}
