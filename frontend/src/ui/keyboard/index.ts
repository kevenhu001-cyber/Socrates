/**
 * ui/keyboard — virtual-keyboard avoidance controller.
 *
 * One keyboard session has exactly one motion owner:
 *   - native-resize: the layout viewport / 100dvh shell moves with the IME;
 *     JS publishes zero inset and only exposes keyboard state.
 *   - overlay: the layout viewport stays fixed; JS mirrors the uncovered
 *     VisualViewport geometry into --keyboard-inset.
 *
 * The mode is locked for the lifetime of a session. While mode is unknown,
 * JS intentionally publishes zero inset instead of guessing. This prevents
 * the classic Android sequence "visual viewport shrinks -> JS lifts ->
 * layout viewport catches up -> JS drops", which appears as a large bounce.
 */

import {
  isTrackedInputFocused,
  KEYBOARD_OPEN_THRESHOLD_PX,
  MIN_STABLE_VISUAL_HEIGHT,
  type ViewportLike,
} from './geometry.ts';
import { TranscriptAnchor } from './anchor.ts';

const BLUR_GRACE_MS = 900;
const EDGE_SAMPLE_MS = 650;
const OVERLAY_EVIDENCE_FRAMES = 2;
const NATIVE_DELTA_PX = 24;
const OVERLAY_DELTA_PX = 24;
const RESTORE_SLOP_PX = 8;
const NATIVE_OPEN_SETTLE_MS = 220;

type KeyboardMode = 'unknown' | 'native-resize' | 'overlay';
export type KeyboardPhase = 'closed' | 'opening' | 'open' | 'closing';

export interface KeyboardLift {
  readonly phase: KeyboardPhase;
  readonly inset: number;
  onInset(cb: (layoutInset: number) => void): () => void;
  notifyNativeKeyboard(kind: 'show' | 'hide', keyboardHeight?: number): void;
  destroy(): void;
}

export interface KeyboardLiftOptions {
  inputs?: HTMLElement | HTMLElement[] | string;
  input?: HTMLElement;
  container?: HTMLElement | null;
  root?: HTMLElement | null;
}

interface SessionBaseline {
  shellBottom: number;
  innerHeight: number;
  visualHeight: number;
}

let active: KeyboardLift | null = null;

export function getKeyboardLift(): KeyboardLift | null {
  return active;
}

const now = (): number => (
  typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
);

export function initKeyboardLift({
  inputs,
  input,
  container,
  root = typeof document !== 'undefined' ? document.documentElement : null,
}: KeyboardLiftOptions = {}): KeyboardLift {
  if (!root || typeof window === 'undefined' || typeof document === 'undefined') {
    return unavailableLift();
  }

  const trackedInputs = (() => {
    const source = inputs ?? input;
    if (!source) return [] as HTMLElement[];
    if (typeof source === 'string') {
      return Array.from(document.querySelectorAll<HTMLElement>(source));
    }
    return (Array.isArray(source) ? source : [source]).filter(Boolean);
  })();

  const viewport = window.visualViewport as (ViewportLike & EventTarget) | null;
  const insetListeners = new Set<(layoutInset: number) => void>();

  let phase: KeyboardPhase = 'closed';
  let mode: KeyboardMode = 'unknown';
  let sessionActive = false;
  let baseline: SessionBaseline | null = null;
  let appliedInset = -1;
  let overlayEvidence = 0;
  let frame = 0;
  let sampleUntil = 0;
  let blurTimer: ReturnType<typeof setTimeout> | 0 = 0;
  let nativeOpenTimer: ReturnType<typeof setTimeout> | 0 = 0;

  const shellElement = (): HTMLElement | null => (
    container
    || document.getElementById('appShell')
    || root
  );

  const isFocused = () => isTrackedInputFocused(trackedInputs);

  const setPhase = (next: KeyboardPhase) => {
    if (phase === next && root.dataset.keyboardPhase === next) return;
    phase = next;
    try { root.dataset.keyboardPhase = next; } catch { /* detached root */ }
  };

  const setIntent = (open: boolean) => {
    try { root.dataset.keyboardOpen = open ? 'true' : 'false'; } catch { /* detached root */ }
  };

  const setMode = (next: KeyboardMode) => {
    if (mode !== 'unknown' && next !== mode) return;
    mode = next;
    try { root.dataset.keyboardMode = next; } catch { /* detached root */ }
  };

  const publishInset = (value: number) => {
    const next = Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
    if (next === appliedInset) return;
    appliedInset = next;
    root.style.setProperty('--keyboard-inset', `${next}px`);
    for (const cb of insetListeners) {
      try { cb(next); } catch { /* subscriber faults stay isolated */ }
    }
  };

  const shellBottom = (): number => {
    const el = shellElement();
    try {
      if (el && typeof el.getBoundingClientRect === 'function') {
        const bottom = Number(el.getBoundingClientRect().bottom);
        if (Number.isFinite(bottom) && bottom > 0) return bottom;
      }
    } catch { /* detached */ }
    return Math.max(0, Number(window.innerHeight) || 0);
  };

  const viewportPan = (): number => {
    const visualTop = viewport && Number.isFinite(Number(viewport.offsetTop))
      ? Math.max(0, Number(viewport.offsetTop))
      : 0;
    const documentTop = Number.isFinite(Number(window.scrollY))
      ? Math.max(0, Number(window.scrollY))
      : 0;
    return visualTop + documentTop;
  };

  const anchor = new TranscriptAnchor({
    listFor: () => {
      try { return document.getElementById('msgList'); } catch { return null; }
    },
    viewportOffset: viewportPan,
    stillActive: () => sessionActive || phase === 'closing',
  });

  const captureBaseline = (): SessionBaseline => ({
    shellBottom: shellBottom(),
    innerHeight: Math.max(0, Number(window.innerHeight) || 0),
    visualHeight: viewport && Number.isFinite(Number(viewport.height))
      ? Math.max(0, Number(viewport.height))
      : Math.max(0, Number(window.innerHeight) || 0),
  });

  const ensureBaseline = () => {
    if (!baseline) baseline = captureBaseline();
  };

  const startSession = () => {
    if (sessionActive) return;
    ensureBaseline();
    sessionActive = true;
    overlayEvidence = 0;
    setIntent(true);
    setPhase('opening');
    anchor.begin();
  };

  const clearNativeOpenTimer = () => {
    if (!nativeOpenTimer) return;
    clearTimeout(nativeOpenTimer);
    nativeOpenTimer = 0;
  };

  const finishSession = () => {
    clearNativeOpenTimer();
    sessionActive = false;
    mode = 'unknown';
    baseline = null;
    overlayEvidence = 0;
    sampleUntil = 0;
    setIntent(false);
    setPhase('closed');
    publishInset(0);
    anchor.end();
    try { root.dataset.keyboardMode = 'unknown'; } catch { /* detached */ }
  };

  const geometry = () => {
    ensureBaseline();
    const base = baseline as SessionBaseline;
    const innerHeight = Math.max(0, Number(window.innerHeight) || 0);
    const currentShellBottom = shellBottom();
    const visualHeight = viewport && Number.isFinite(Number(viewport.height))
      ? Math.max(0, Number(viewport.height))
      : innerHeight;
    const visualOffsetTop = viewport && Number.isFinite(Number(viewport.offsetTop))
      ? Math.max(0, Number(viewport.offsetTop))
      : 0;

    const innerShrink = Math.max(0, base.innerHeight - innerHeight);
    const shellShrink = Math.max(0, base.shellBottom - currentShellBottom);
    const visualShrink = Math.max(0, base.visualHeight - visualHeight);
    const visibleCoverage = Math.max(
      0,
      currentShellBottom - (visualHeight + visualOffsetTop),
    );

    return {
      innerHeight,
      currentShellBottom,
      visualHeight,
      visualOffsetTop,
      innerShrink,
      shellShrink,
      visualShrink,
      visibleCoverage,
    };
  };

  const geometryLooksRestored = (g: ReturnType<typeof geometry>): boolean => {
    if (!baseline) return true;
    return (
      g.visualShrink <= RESTORE_SLOP_PX
      && g.innerShrink <= RESTORE_SLOP_PX
      && g.shellShrink <= RESTORE_SLOP_PX
      && g.visibleCoverage <= KEYBOARD_OPEN_THRESHOLD_PX
    );
  };

  const classifyMode = (g: ReturnType<typeof geometry>) => {
    if (mode !== 'unknown') return;

    /* Native resize is authoritative as soon as either the layout viewport
       or the rendered shell has materially shrunk. This usually arrives in
       the same frame as visualViewport on Android resizes-content. */
    if (g.innerShrink >= NATIVE_DELTA_PX || g.shellShrink >= NATIVE_DELTA_PX) {
      setMode('native-resize');
      overlayEvidence = 0;
      return;
    }

    /* Overlay requires repeated evidence. A single early visualViewport
       shrink is deliberately ignored because Android can report it one
       frame before the 100dvh shell/layout viewport catches up. */
    const overlayCandidate = (
      g.visualShrink >= OVERLAY_DELTA_PX
      || g.visibleCoverage >= OVERLAY_DELTA_PX
      || g.visualOffsetTop >= OVERLAY_DELTA_PX
    );
    overlayEvidence = overlayCandidate ? overlayEvidence + 1 : 0;
    if (overlayEvidence >= OVERLAY_EVIDENCE_FRAMES) {
      setMode('overlay');
    }
  };

  const sample = () => {
    const focused = isFocused();
    const g = geometry();

    const keyboardGeometryPresent = (
      g.visualShrink > KEYBOARD_OPEN_THRESHOLD_PX
      || g.innerShrink > KEYBOARD_OPEN_THRESHOLD_PX
      || g.shellShrink > KEYBOARD_OPEN_THRESHOLD_PX
      || g.visibleCoverage > KEYBOARD_OPEN_THRESHOLD_PX
      || g.visualOffsetTop > KEYBOARD_OPEN_THRESHOLD_PX
    );

    if (!sessionActive && focused && keyboardGeometryPresent) startSession();
    if (sessionActive) classifyMode(g);

    if (!sessionActive) {
      publishInset(0);
      return;
    }

    if (phase === 'closing' && geometryLooksRestored(g)) {
      finishSession();
      return;
    }

    if (mode === 'native-resize') {
      /* Native/layout resize is the sole motion owner. Never add a second
         JS displacement, even during the one-frame viewport/layout skew. */
      publishInset(0);
      if (phase === 'opening' && (g.innerShrink >= NATIVE_DELTA_PX || g.shellShrink >= NATIVE_DELTA_PX)) {
        setPhase('open');
      } else if (phase !== 'opening' && geometryLooksRestored(g)) {
        /* Browser resizes-content can dismiss the IME without a native
           bridge event while focus remains in the editor. Geometry restore
           is sufficient to end that web session. */
        finishSession();
      }
      return;
    }

    if (mode === 'overlay') {
      /* Only the residual layout-space coverage is published. Container
         scrollTop is intentionally excluded: padding changes can cause
         scroll-into-view, and feeding that scroll back into the inset forms
         a positive feedback loop (padding -> scroll -> padding -> jitter). */
      publishInset(g.visibleCoverage);
      if (phase === 'opening' && g.visibleCoverage > KEYBOARD_OPEN_THRESHOLD_PX) {
        setPhase('open');
      }
      if (geometryLooksRestored(g)) finishSession();
      return;
    }

    /* Unknown mode: wait for evidence instead of guessing. Zero is safer
       than a wrong full-height compensation that must be undone next frame. */
    publishInset(0);
  };

  const onFrame = () => {
    frame = 0;
    sample();
    if (sampleUntil > now() && !frame) frame = requestAnimationFrame(onFrame);
  };

  const sampleFor = (ms = EDGE_SAMPLE_MS) => {
    sampleUntil = Math.max(sampleUntil, now() + ms);
    if (!frame && typeof requestAnimationFrame === 'function') {
      frame = requestAnimationFrame(onFrame);
    } else if (typeof requestAnimationFrame !== 'function') {
      sample();
    }
  };

  const onFocusIn = () => {
    if (blurTimer) { clearTimeout(blurTimer); blurTimer = 0; }
    if (!sessionActive) {
      baseline = captureBaseline();
      mode = 'unknown';
      overlayEvidence = 0;
      try { root.dataset.keyboardMode = 'unknown'; } catch { /* detached */ }
    }
    sampleFor();
  };

  const onFocusOut = () => {
    if (!sessionActive) {
      baseline = null;
      return;
    }
    setPhase('closing');
    sampleFor();
    if (blurTimer) clearTimeout(blurTimer);
    blurTimer = setTimeout(() => {
      blurTimer = 0;
      if (sessionActive && !isFocused()) finishSession();
    }, BLUR_GRACE_MS);
  };

  const onViewportGeometry = () => {
    sampleFor();
    if (anchor.active) anchor.correct();
  };

  if (viewport && typeof viewport.addEventListener === 'function') {
    viewport.addEventListener('resize', onViewportGeometry);
    viewport.addEventListener('scroll', onViewportGeometry);
  }
  window.addEventListener('resize', onViewportGeometry);
  window.addEventListener('scroll', onViewportGeometry, { passive: true });
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);
  document.addEventListener('visibilitychange', onViewportGeometry);

  publishInset(0);
  setPhase('closed');
  setIntent(false);
  try { root.dataset.keyboardMode = 'unknown'; } catch { /* detached */ }

  const controller: KeyboardLift = {
    get phase() { return phase; },
    get inset() { return appliedInset > 0 ? appliedInset : 0; },
    onInset(cb) {
      insetListeners.add(cb);
      return () => { insetListeners.delete(cb); };
    },
    notifyNativeKeyboard(kind, _keyboardHeight) {
      if (kind === 'show') {
        if (blurTimer) { clearTimeout(blurTimer); blurTimer = 0; }
        baseline = baseline ?? captureBaseline();
        startSession();
        /* Capacitor is configured with Keyboard.resize='native'. The native
           signal is therefore state/timing only; keyboardHeight must never
           become a CSS inset or the composer will jump to the final height
           before Android's own resize animation begins. */
        setMode('native-resize');
        publishInset(0);
        setPhase('opening');
        clearNativeOpenTimer();
        nativeOpenTimer = setTimeout(() => {
          nativeOpenTimer = 0;
          if (sessionActive && mode === 'native-resize' && phase === 'opening') setPhase('open');
        }, NATIVE_OPEN_SETTLE_MS);
        sampleFor();
        return;
      }

      if (!sessionActive) {
        finishSession();
        return;
      }
      clearNativeOpenTimer();
      setPhase('closing');
      publishInset(0);
      sampleFor();
      if (blurTimer) clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        blurTimer = 0;
        if (sessionActive) finishSession();
      }, NATIVE_OPEN_SETTLE_MS);
    },
    destroy() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (blurTimer) { clearTimeout(blurTimer); blurTimer = 0; }
      clearNativeOpenTimer();
      anchor.end();
      insetListeners.clear();
      if (viewport && typeof viewport.removeEventListener === 'function') {
        viewport.removeEventListener('resize', onViewportGeometry);
        viewport.removeEventListener('scroll', onViewportGeometry);
      }
      window.removeEventListener('resize', onViewportGeometry);
      window.removeEventListener('scroll', onViewportGeometry);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('visibilitychange', onViewportGeometry);
      try { root.style.removeProperty('--keyboard-inset'); } catch { /* detached */ }
      try { delete root.dataset.keyboardOpen; } catch { /* detached */ }
      try { delete root.dataset.keyboardPhase; } catch { /* detached */ }
      try { delete root.dataset.keyboardMode; } catch { /* detached */ }
      if (active === controller) active = null;
    },
  };

  active = controller;
  return controller;
}

function unavailableLift(): KeyboardLift {
  return {
    phase: 'closed',
    inset: 0,
    onInset: () => () => undefined,
    notifyNativeKeyboard: () => undefined,
    destroy: () => undefined,
  };
}
