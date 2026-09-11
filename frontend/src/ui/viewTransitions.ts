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