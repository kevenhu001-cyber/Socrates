import type { ScrollAnchor } from './progressiveMount';

const MSG_LIST_ID = 'msgList';
const STICKY_MS = 4000;

interface Sticky {
  list: HTMLElement;
  expected: number;
  until: number;
  frame: number;
}

let sticky: Sticky | null = null;
let intentBound: HTMLElement | null = null;

export function scrollHost(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.getElementById(MSG_LIST_ID);
}

export function releaseSticky(): void {
  if (sticky?.frame) cancelAnimationFrame(sticky.frame);
  sticky = null;
}

function releaseOnIntent(): void {
  releaseSticky();
}

export function isSticky(list: HTMLElement): boolean {
  return Boolean(sticky && sticky.list === list && performance.now() < sticky.until);
}

export function stickTo(list: HTMLElement): void {
  list.scrollTop = list.scrollHeight;
  if (sticky) sticky.expected = list.scrollTop;
}

export function pinToBottom(list: HTMLElement): void {
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
    if (!list.isConnected || performance.now() > state.until) {
      releaseSticky();
      return;
    }
    if (Math.abs(list.scrollTop - state.expected) > 1) {
      releaseSticky();
      return;
    }
    if (list.scrollHeight - list.scrollTop - list.clientHeight > 1) stickTo(list);
    state.frame = requestAnimationFrame(step);
  };
  state.frame = requestAnimationFrame(step);
}

export function correctScrollAnchor(anchor: ScrollAnchor, host: HTMLElement): void {
  if (anchor.pinned) stickTo(host);
  else host.scrollTop = anchor.top + (host.scrollHeight - anchor.height);
}
