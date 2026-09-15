/*
 * ui/viewTransitions.ts
 *
 * Tiny wrapper around `document.startViewTransition` (Chrome/Edge 111+,
 * Safari 18+). Used by startSession() to coalesce the topic-setup
 * → chat-view swap into one browser-native cross-fade so the user
 * sees a single frame instead of the intermediate class-toggle flash.
 *
 * On browsers without View Transitions the callback runs immediately —
 * behavior stays identical to the pre-wrapper code path.
 *
 * TypeScript's DOM lib already declares `startViewTransition` since
 * 5.6, so we delegate to the built-in signature and only guard the
 * feature-detect branch.
 */

let featureChecked = false;
let supported = false;

function detect(): boolean {
  if (featureChecked) return supported;
  featureChecked = true;
  supported =
    typeof document !== 'undefined' &&
    typeof (document as Document).startViewTransition === 'function';
  return supported;
}

/**
 * Wrap a DOM mutation in `document.startViewTransition` so the browser
 * captures the pre-state, runs the mutation, and cross-fades to the
 * post-state in one native paint. No-op when the browser lacks the API.
 *
 * `update` runs synchronously inside the transition's update phase, so
 * React/legacy mutations stay in the same JS task as the click. Callers
 * must NOT await anything inside `update` — that would defeat the
 * one-frame contract and re-introduce the layout-thrash window.
 */
export function withViewTransition(update: () => void): void {
  if (typeof document === 'undefined') {
    update();
    return;
  }
  const start = document.startViewTransition?.bind(document);
  if (typeof start !== 'function') {
    update();
    return;
  }
  /* P_zero-delay — startViewTransition's `ready` resolves once the new
     state has been captured. We deliberately do NOT await it: the browser
     applies the cross-fade automatically and `update` runs inside the
     transition phase, which is what makes the swap one-frame. */
  try {
    start(update);
  } catch (_) {
    /* Defensive fallback — the spec says startViewTransition throws if
       called from inside another transition. Bypassing it preserves the
       old behavior instead of leaving the click silent. */
    update();
  }
}

/** Test-only — does the current browser support View Transitions. */
export function hasViewTransitions(): boolean {
  return detect();
}

let swapSeq = 0;

/**
 * Cross-fade ONE element through a DOM rewrite (e.g. a streaming bubble's
 * finish() swap, where the whole markdown body is re-rendered and spliced).
 *
 * The element gets a temporary `view-transition-name`; a `vt-scoped-swap`
 * class on <html> (see styles.css) suppresses the root snapshot's own
 * cross-fade, so only the named row morphs — size and position interpolate
 * while its content fades — instead of the entire viewport flashing.
 *
 * `update` runs inside the transition's update phase; afterwards we wait two
 * frames before letting the browser capture the new state, so a store-driven
 * React commit has landed by capture time even when it did not flush
 * synchronously inside `update`.
 *
 * Falls back to running `update` immediately when the API is missing, the
 * element is gone, or the user prefers reduced motion.
 */
export function withElementSwapTransition(el: HTMLElement | null, update: () => void): void {
  const start =
    typeof document !== 'undefined' && typeof document.startViewTransition === 'function'
      ? document.startViewTransition.bind(document)
      : undefined;
  let reduce = false;
  try {
    reduce =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) { /* matchMedia unavailable — treat as no preference */ }
  if (!start || !el || !el.isConnected || reduce) {
    update();
    return;
  }
  const rootEl = document.documentElement;
  const name = 'msg-swap-' + (++swapSeq);
  const cleanup = () => {
    try { el.style.viewTransitionName = ''; } catch (_) { /* element may be detached */ }
    rootEl.classList.remove('vt-scoped-swap');
  };
  try {
    el.style.viewTransitionName = name;
    rootEl.classList.add('vt-scoped-swap');
    const vt = start(() => {
      update();
      return new Promise<void>((resolve) => {
        const raf = typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame
          : (cb: FrameRequestCallback) => setTimeout(cb, 0) as unknown as number;
        raf(() => raf(() => resolve()));
        /* rAF is throttled to ~never in hidden tabs — cap the wait so the
           transition cannot stall on a paused frame pump. */
        setTimeout(resolve, 120);
      });
    });
    vt.updateCallbackDone.catch(() => { /* update threw — swap falls back to instant */ });
    vt.finished.then(cleanup, cleanup);
  } catch (_) {
    cleanup();
    update();
  }
}
