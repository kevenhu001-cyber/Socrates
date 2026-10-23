/*
 * ui/viewTransitions.ts
 *
 * Tiny wrapper around `document.startViewTransition` (Chrome/Edge 111+,
 * Safari 18+). Used for page/surface swaps where a browser-native cross-fade
 * avoids exposing intermediate shell state.
 *
 * Message streaming no longer uses element-scoped View Transitions: a live
 * bubble changes too frequently for snapshot/morph work to be a sensible hot
 * path. Finish-state polish is handled by lightweight opacity transitions.
 *
 * On browsers without View Transitions the callback runs immediately —
 * behavior stays identical to the pre-wrapper code path.
 *
 * TypeScript's DOM lib already declares `startViewTransition` since
 * 5.6, so we delegate to the built-in signature and only guard the
 * feature-detect branch.
 */

import { prefersReducedMotion } from './motion.js';

let activeTransition: ViewTransition | null = null;
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
 * The browser schedules `update` after capturing the old state (not in
 * the click task). Callers must keep it synchronous and must NOT await
 * network work inside it. Reduced motion bypasses snapshotting entirely.
 */
export function withViewTransition(update: () => void): void {
  if (typeof document === 'undefined' || prefersReducedMotion()) {
    activeTransition?.skipTransition();
    activeTransition = null;
    update();
    return;
  }
  const start = document.startViewTransition?.bind(document);
  if (typeof start !== 'function') {
    update();
    return;
  }
  /* Keep rapid navigation responsive instead of stacking snapshot fades.
     skipTransition still runs the old update callback, preserving order. */
  activeTransition?.skipTransition();
  activeTransition = null;
  let invoked = false;
  try {
    const transition = start(() => {
      invoked = true;
      update();
    });
    activeTransition = transition;
    // Skipping a transition rejects `ready`; it is expected on rapid input.
    void transition.ready?.catch(() => { /* intentional: superseded snapshot */ });
    void transition.finished?.then(() => {
      if (activeTransition === transition) activeTransition = null;
    }, () => {
      if (activeTransition === transition) activeTransition = null;
    });
  } catch (error) {
    // Never replay a mutation that itself threw in a synchronous adapter.
    if (invoked) throw error;
    update();
  }
}

/** Test-only — does the current browser support View Transitions. */
export function hasViewTransitions(): boolean {
  return detect();
}
