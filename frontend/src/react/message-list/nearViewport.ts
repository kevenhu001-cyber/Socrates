/* Defer expensive per-row DOM wiring until the row nears the transcript
 * viewport.
 *
 * Rows that mount off screen (the idle fill above the first screen, a window
 * shift while scrolling, the full mount behind find-in-session) used to wire
 * every visualization, code-block toolbar and persisted extra in the same
 * layout effect, so one scroll step could become a several-hundred-ms task on
 * a phone. Those rows now hand their wiring to one shared
 * IntersectionObserver rooted at #msgList with a generous margin; rows that
 * come within reach run their wiring in idle slices instead of one burst.
 */
import { scrollHost } from './messageScroll';

type Task = () => void;

function alreadyRan(): void {
  /* Nothing to cancel: the task ran synchronously. */
}

/** How far outside the visible transcript a row still counts as near. */
const NEAR_MARGIN = '1200px 0px';
/** Upper bound on how long near-viewport work may wait for an idle slot. */
const IDLE_TIMEOUT_MS = 120;
const SLICE_BUDGET_MS = 8;

interface IdleDeadlineLike { timeRemaining(): number; didTimeout?: boolean }
type IdleWindow = Window & {
  requestIdleCallback?: (callback: (deadline: IdleDeadlineLike) => void, options?: { timeout: number }) => number;
};

let observer: IntersectionObserver | null = null;
let observerRoot: Element | null = null;
const waiting = new Map<Element, Task>();
const ready: Array<{ element: Element; task: Task }> = [];
let drainScheduled = false;
let offscreenMount = false;

/** The mount window marks commits that only mount rows outside the viewport. */
export function setOffscreenMount(value: boolean): void {
  offscreenMount = value;
}

export function isOffscreenMount(): boolean {
  return offscreenMount;
}

function drain(deadline?: IdleDeadlineLike): void {
  drainScheduled = false;
  const started = performance.now();
  while (ready.length) {
    if (deadline && !deadline.didTimeout && deadline.timeRemaining() <= 1) break;
    if (!deadline && performance.now() - started > SLICE_BUDGET_MS) break;
    const next = ready.shift()!;
    if (next.element.isConnected) next.task();
  }
  if (ready.length) scheduleDrain();
}

function scheduleDrain(): void {
  if (drainScheduled) return;
  drainScheduled = true;
  const idle = (window as IdleWindow).requestIdleCallback;
  if (typeof idle === 'function') idle.call(window, drain, { timeout: IDLE_TIMEOUT_MS });
  else setTimeout(() => drain(), 16);
}

function onEntries(entries: IntersectionObserverEntry[]): void {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const task = waiting.get(entry.target);
    if (!task) continue;
    waiting.delete(entry.target);
    observer?.unobserve(entry.target);
    ready.push({ element: entry.target, task });
  }
  if (ready.length) scheduleDrain();
}

function observerFor(root: Element): IntersectionObserver {
  if (observer && observerRoot === root) return observer;
  /* The transcript host was replaced: move every waiting row over. */
  const previous = [...waiting.keys()];
  observer?.disconnect();
  observer = new IntersectionObserver(onEntries, { root, rootMargin: NEAR_MARGIN });
  observerRoot = root;
  for (const element of previous) observer.observe(element);
  return observer;
}

/**
 * Run `task` once `element` is within reach of the transcript viewport.
 * Without IntersectionObserver (or a transcript host) it runs immediately.
 * Returns a cancel function; cancelling after the task ran is a no-op.
 */
export function runWhenNearViewport(element: Element, task: Task): () => void {
  const root = scrollHost();
  if (typeof IntersectionObserver !== 'function' || !root || !root.contains(element)) {
    task();
    return alreadyRan;
  }
  waiting.set(element, task);
  observerFor(root).observe(element);
  return () => {
    if (waiting.get(element) === task) {
      waiting.delete(element);
      observer?.unobserve(element);
    }
    for (let index = ready.length - 1; index >= 0; index--) {
      if (ready[index].element === element && ready[index].task === task) ready.splice(index, 1);
    }
  };
}
