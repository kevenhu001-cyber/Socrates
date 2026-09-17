/**
 * ui/keyboard — virtual-keyboard avoidance controller.
 *
 * One keyboard session has exactly one layout-motion owner:
 *   - native-resize: the layout viewport / 100dvh shell moves with the IME;
 *     JS publishes zero inset. If that native reflow arrives as one coarse
 *     jump, a FLIP transform smooths the already-correct final layout without
 *     taking ownership of the keyboard geometry.
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

/* Some Android WebViews update 100dvh in one layout commit instead of
 * exposing the IME's intermediate frames. The final geometry is correct,
 * but the composer visibly teleports. FLIP keeps layout ownership native:
 * detect only a coarse layout jump, invert it with a compositor transform,
 * then animate that transform back to zero. Progressive native motion is
 * left untouched. */
const NATIVE_FLIP_MIN_PX = 28;
const NATIVE_FLIP_MS = 240;
const NATIVE_FLIP_EASING = 'cubic-bezier(0.2, 0, 0, 1)';

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

  /* FLIP state is visual only; it never feeds back into layout geometry. */
  let nativeMotionTarget: HTMLElement | null = null;
  let lastComposerLayoutTop: number | null = null;
  let nativeMotionAnimation: Animation | null = null;

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

  const activeComposerMotionTarget = (): HTMLElement | null => {
    const focused = document.activeElement;
    if (!(focused instanceof Node)) return nativeMotionTarget;
    const wrap = trackedInputs.find((element) => element === focused || element.contains(focused));
    if (!wrap) return nativeMotionTarget;
    /* Move the full chat input bar so its bottom fade/safe-area travels with
       the card. The landing composer has no separate bar wrapper. */
    if (wrap.id === 'chatInputWrap') {
      return document.getElementById('chatInputBar') || wrap;
    }
    return wrap;
  };

  const animatedTranslateY = (target: HTMLElement): number => {
    if (!nativeMotionAnimation || nativeMotionTarget !== target) return 0;
    try {
      const transform = getComputedStyle(target).transform;
      if (!transform || transform === 'none') return 0;
      const matrix = new DOMMatrixReadOnly(transform);
      return Number.isFinite(matrix.m42) ? matrix.m42 : 0;
    } catch {
      return 0;
    }
  };

  const composerLayoutTop = (target: HTMLElement): number | null => {
    try {
      /* getBoundingClientRect includes our FLIP transform. Remove that
         presentation-only offset so repeated samples observe layout, not
         the animation we created ourselves. */
      const top = Number(target.getBoundingClientRect().top) - animatedTranslateY(target);
      return Number.isFinite(top) ? top : null;
    } catch {
      return null;
    }
  };

  const captureComposerPosition = () => {
    const target = activeComposerMotionTarget();
    if (!target) return;
    nativeMotionTarget = target;
    lastComposerLayoutTop = composerLayoutTop(target);
  };

  const prefersReducedMotion = (): boolean => {
    try { return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches); }
    catch { return false; }
  };

  const animateNativeLayoutJump = (delta: number) => {
    const target = nativeMotionTarget;
    if (!target || Math.abs(delta) < NATIVE_FLIP_MIN_PX || prefersReducedMotion()) return;
    if (typeof target.animate !== 'function') return;

    /* If another coarse native step lands while the previous FLIP is still
       running, preserve the currently painted translation and add the new
       layout delta. Cancelling first without carrying this value would
       itself create a one-frame snap. */
    const carry = animatedTranslateY(target);
    if (nativeMotionAnimation) {
      try { nativeMotionAnimation.cancel(); } catch { /* already finished */ }
      nativeMotionAnimation = null;
    }
    const from = carry + delta;
    if (Math.abs(from) < 1) return;

    let animation: Animation;
    try {
      animation = target.animate(
        [
          { transform: `translate3d(0, ${from}px, 0)` },
          { transform: 'translate3d(0, 0, 0)' },
        ],
        {
          duration: NATIVE_FLIP_MS,
          easing: NATIVE_FLIP_EASING,
          fill: 'both',
        },
      );
    } catch {
      return;
    }

    nativeMotionAnimation = animation;
    try { root.dataset.keyboardMotion = 'native-flip'; } catch { /* detached */ }
    animation.onfinish = () => {
      if (nativeMotionAnimation !== animation) return;
      nativeMotionAnimation = null;
      try { animation.cancel(); } catch { /* no-op */ }
      try { delete root.dataset.keyboardMotion; } catch { /* detached */ }
    };
    animation.oncancel = () => {
      if (nativeMotionAnimation === animation) nativeMotionAnimation = null;
    };
  };

  const smoothNativeComposerJump = () => {
    const target = activeComposerMotionTarget();
    if (!target) return;
    if (target !== nativeMotionTarget) {
      nativeMotionTarget = target;
      lastComposerLayoutTop = composerLayoutTop(target);
      return;
    }
    const nextTop = composerLayoutTop(target);
    if (nextTop == null) return;
    if (lastComposerLayoutTop == null) {
      lastComposerLayoutTop = nextTop;
      return;
    }
    const delta = lastComposerLayoutTop - nextTop;
    lastComposerLayoutTop = nextTop;
    animateNativeLayoutJump(delta);
  };

  const startSession = () => {
    if (sessionActive) return;
    ensureBaseline();
    sessionActive = true;
    overlayEvidence = 0;
    setIntent(true);
    setPhase('opening');
    captureComposerPosition();
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
    lastComposerLayoutTop = null;
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
       or the rendered shell has materially shrunk. */
    if (g.innerShrink >= NATIVE_DELTA_PX || g.shellShrink >= NATIVE_DELTA_PX) {
      setMode('native-resize');
      overlayEvidence = 0;
      return;
    }

    /* Overlay requires repeated evidence. A single early visualViewport
       shrink is deliberately ignored because Android can report it before
       the 100dvh shell/layout viewport catches up. */
    const overlayCandidate = (
      g.visualShrink >= OVERLAY_DELTA_PX
      || g.visibleCoverage >= OVERLAY_DELTA_PX
      || g.visualOffsetTop >= OVERLAY_DELTA_PX
    );
    overlayEvidence = overlayCandidate ? overlayEvidence + 1 : 0;
    if (overlayEvidence >= OVERLAY_EVIDENCE_FRAMES) setMode('overlay');
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

    if (mode === 'native-resize') smoothNativeComposerJump();

    if (phase === 'closing' && geometryLooksRestored(g)) {
      /* smoothNativeComposerJump() runs first so a one-step downward native
         restore gets its inverse transform before the session state closes. */
      finishSession();
      return;
    }

    if (mode === 'native-resize') {
      /* Native/layout resize remains the sole geometry owner. The FLIP above
         is presentation-only and always converges to transform:none. */
      publishInset(0);
      if (phase === 'opening' && (g.innerShrink >= NATIVE_DELTA_PX || g.shellShrink >= NATIVE_DELTA_PX)) {
        setPhase('open');
      } else if (phase !== 'opening' && geometryLooksRestored(g)) {
        finishSession();
      }
      return;
    }

    if (mode === 'overlay') {
      /* Only residual layout-space coverage is published. Container scrollTop
         is intentionally excluded to prevent padding -> scroll -> padding
         feedback loops. */
      publishInset(g.visibleCoverage);
      if (phase === 'opening' && g.visibleCoverage > KEYBOARD_OPEN_THRESHOLD_PX) {
        setPhase('open');
      }
      if (geometryLooksRestored(g)) finishSession();
      return;
    }

    /* Unknown mode: wait for evidence instead of guessing. */
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
    captureComposerPosition();
    sampleFor();
  };

  const onFocusOut = () => {
    if (!sessionActive) {
      baseline = null;
      return;
    }
    captureComposerPosition();
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
        captureComposerPosition();
        startSession();
        /* Capacitor is configured with Keyboard.resize='native'. The native
           signal is timing/state only; keyboardHeight never becomes a CSS
           inset, so the FLIP cannot reintroduce double-lift. */
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
      captureComposerPosition();
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
      if (nativeMotionAnimation) {
        try { nativeMotionAnimation.cancel(); } catch { /* already finished */ }
        nativeMotionAnimation = null;
      }
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
      try { delete root.dataset.keyboardMotion; } catch { /* detached */ }
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
