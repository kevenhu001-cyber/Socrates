/**
 * ui/keyboard — virtual-keyboard avoidance controller.
 *
 * A keyboard session has one layout-motion owner:
 *   - native-resize: Android/WebView resizes the layout viewport. JS never
 *     adds keyboard inset. If that resize arrives in coarse steps, JS holds
 *     the composer at its pre-focus visual position until native geometry is
 *     stable, then releases it with one compositor animation.
 *   - overlay: layout stays fixed and JS publishes only the uncovered visual
 *     viewport coverage as --keyboard-inset.
 *
 * The important invariant is that a JS animation is never allowed to run
 * while the native layout is still changing underneath it. That was the
 * source of the opening judder in earlier FLIP implementations.
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

const NATIVE_FLIP_MIN_PX = 28;
const NATIVE_FLIP_MS = 220;
const NATIVE_FLIP_EASING = 'cubic-bezier(0.2, 0, 0, 1)';

/* A pre-focus snapshot must survive focusin / keyboardWillShow because some
 * Android WebViews have already performed focus reveal by then. */
const PRE_FOCUS_SNAPSHOT_MS = 800;

/* Once a coarse native jump is detected, keep the composer visually frozen
 * until both its layout box and the viewport have stopped changing for a few
 * consecutive frames. This prevents a compositor animation from being mixed
 * with a still-running 100dvh/native-resize animation. */
const OPENING_STABLE_FRAMES = 3;
const OPENING_STABLE_SLOP_PX = 1.5;
const OPENING_HOLD_MIN_MS = 48;
const OPENING_HOLD_MAX_MS = 220;

type KeyboardMode = 'unknown' | 'native-resize' | 'overlay';
type NativeMotionEdge = 'opening' | 'closing' | null;
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

interface KeyboardGeometry {
  innerHeight: number;
  currentShellBottom: number;
  visualHeight: number;
  visualOffsetTop: number;
  innerShrink: number;
  shellShrink: number;
  visualShrink: number;
  visibleCoverage: number;
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

  /* Native motion state. Layout coordinates are always measured without the
     presentation-only hold/animation offset. */
  let nativeMotionTarget: HTMLElement | null = null;
  let lastComposerLayoutTop: number | null = null;
  let nativeMotionAnimation: Animation | null = null;
  let nativeMotionEdge: NativeMotionEdge = null;
  let preFocusSnapshotUntil = 0;

  /* Opening-only visual hold. */
  let openingLockTop: number | null = null;
  let openingHoldActive = false;
  let openingHoldOffset = 0;
  let openingHoldStartedAt = 0;
  let openingStableFrames = 0;
  let openingLastLayoutTop: number | null = null;
  let openingLastInnerHeight: number | null = null;
  let openingLastShellBottom: number | null = null;
  let openingReleaseStarted = false;
  let openingOriginalInlineTransform = '';
  let openingOriginalWillChange = '';

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

  const motionTargetForNode = (node: EventTarget | Node | null): HTMLElement | null => {
    if (!(node instanceof Node)) return null;
    const wrap = trackedInputs.find((element) => element === node || element.contains(node));
    if (!wrap) return null;
    if (wrap.id === 'chatInputWrap') {
      return document.getElementById('chatInputBar') || wrap;
    }
    return wrap;
  };

  const activeComposerMotionTarget = (): HTMLElement | null => (
    motionTargetForNode(document.activeElement) || nativeMotionTarget
  );

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

  const presentationTranslateY = (target: HTMLElement): number => {
    if (openingHoldActive && target === nativeMotionTarget) return openingHoldOffset;
    return animatedTranslateY(target);
  };

  const composerLayoutTop = (target: HTMLElement): number | null => {
    try {
      const top = Number(target.getBoundingClientRect().top) - presentationTranslateY(target);
      return Number.isFinite(top) ? top : null;
    } catch {
      return null;
    }
  };

  const cancelNativeAnimation = () => {
    if (!nativeMotionAnimation) return;
    try { nativeMotionAnimation.cancel(); } catch { /* already finished */ }
    nativeMotionAnimation = null;
    try { delete root.dataset.keyboardMotion; } catch { /* detached */ }
  };

  const hasFreshPreFocusSnapshot = (target: HTMLElement | null): boolean => (
    Boolean(target)
    && target === nativeMotionTarget
    && lastComposerLayoutTop != null
    && preFocusSnapshotUntil > now()
  );

  const captureComposerPosition = (
    target: HTMLElement | null = activeComposerMotionTarget(),
    preservePreFocus = false,
  ) => {
    if (!target) return;
    if (preservePreFocus && hasFreshPreFocusSnapshot(target)) return;
    nativeMotionTarget = target;
    lastComposerLayoutTop = composerLayoutTop(target);
  };

  const restoreOpeningInlineStyle = () => {
    const target = nativeMotionTarget;
    if (!target) return;
    target.style.transform = openingOriginalInlineTransform;
    target.style.willChange = openingOriginalWillChange;
  };

  const resetOpeningMotion = (restoreStyle = true) => {
    if (restoreStyle && openingHoldActive) restoreOpeningInlineStyle();
    openingHoldActive = false;
    openingHoldOffset = 0;
    openingHoldStartedAt = 0;
    openingStableFrames = 0;
    openingLastLayoutTop = null;
    openingLastInnerHeight = null;
    openingLastShellBottom = null;
    openingReleaseStarted = false;
    openingOriginalInlineTransform = '';
    openingOriginalWillChange = '';
  };

  const primePreFocusSnapshot = (event: PointerEvent) => {
    if (sessionActive) return;
    const target = motionTargetForNode(event.target);
    if (!target) return;

    cancelNativeAnimation();
    resetOpeningMotion();

    baseline = captureBaseline();
    mode = 'unknown';
    overlayEvidence = 0;
    nativeMotionTarget = target;
    lastComposerLayoutTop = composerLayoutTop(target);
    openingLockTop = lastComposerLayoutTop;
    preFocusSnapshotUntil = now() + PRE_FOCUS_SNAPSHOT_MS;
    nativeMotionEdge = 'opening';
    try { root.dataset.keyboardMode = 'unknown'; } catch { /* detached */ }
  };

  const prefersReducedMotion = (): boolean => {
    try { return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches); }
    catch { return false; }
  };

  const applyOpeningHold = (target: HTMLElement, layoutTop: number) => {
    if (openingLockTop == null) openingLockTop = lastComposerLayoutTop ?? layoutTop;
    openingHoldOffset = openingLockTop - layoutTop;
    target.style.transform = `translate3d(0, ${openingHoldOffset}px, 0)`;
    target.style.willChange = 'transform';
  };

  const beginOpeningHold = (
    target: HTMLElement,
    previousLayoutTop: number,
    layoutTop: number,
    g: KeyboardGeometry,
  ) => {
    if (prefersReducedMotion()) return;
    if (openingLockTop == null) openingLockTop = previousLayoutTop;

    cancelNativeAnimation();
    openingOriginalInlineTransform = target.style.transform;
    openingOriginalWillChange = target.style.willChange;
    openingHoldActive = true;
    openingReleaseStarted = false;
    openingHoldStartedAt = now();
    openingStableFrames = 0;
    openingLastLayoutTop = layoutTop;
    openingLastInnerHeight = g.innerHeight;
    openingLastShellBottom = g.currentShellBottom;
    applyOpeningHold(target, layoutTop);
    try { root.dataset.keyboardMotion = 'native-hold'; } catch { /* detached */ }
  };

  const releaseOpeningHold = () => {
    const target = nativeMotionTarget;
    if (!target || !openingHoldActive || openingReleaseStarted) return;

    const from = openingHoldOffset;
    openingReleaseStarted = true;
    openingHoldActive = false;

    if (prefersReducedMotion() || Math.abs(from) < 1 || typeof target.animate !== 'function') {
      restoreOpeningInlineStyle();
      openingHoldOffset = 0;
      nativeMotionEdge = null;
      try { delete root.dataset.keyboardMotion; } catch { /* detached */ }
      return;
    }

    const originalTransform = openingOriginalInlineTransform.trim();
    const fromTransform = originalTransform
      ? `translate3d(0, ${from}px, 0) ${originalTransform}`
      : `translate3d(0, ${from}px, 0)`;
    const toTransform = originalTransform || 'translate3d(0, 0, 0)';

    let animation: Animation;
    try {
      animation = target.animate(
        [
          { transform: fromTransform },
          { transform: toTransform },
        ],
        {
          duration: NATIVE_FLIP_MS,
          easing: NATIVE_FLIP_EASING,
          fill: 'both',
        },
      );
    } catch {
      restoreOpeningInlineStyle();
      openingHoldOffset = 0;
      nativeMotionEdge = null;
      try { delete root.dataset.keyboardMotion; } catch { /* detached */ }
      return;
    }

    /* WAAPI takes over the presentation transform synchronously; restore the
       normal inline style underneath it so cancel/finish reveals final layout. */
    restoreOpeningInlineStyle();
    openingHoldOffset = 0;
    nativeMotionAnimation = animation;
    try { root.dataset.keyboardMotion = 'native-release'; } catch { /* detached */ }

    animation.onfinish = () => {
      if (nativeMotionAnimation !== animation) return;
      nativeMotionAnimation = null;
      try { animation.cancel(); } catch { /* no-op */ }
      nativeMotionEdge = null;
      try { delete root.dataset.keyboardMotion; } catch { /* detached */ }
    };
    animation.oncancel = () => {
      if (nativeMotionAnimation === animation) nativeMotionAnimation = null;
    };
  };

  const updateNativeOpeningMotion = (g: KeyboardGeometry) => {
    if (nativeMotionEdge !== 'opening' || openingReleaseStarted) return;
    const target = activeComposerMotionTarget();
    if (!target) return;

    if (target !== nativeMotionTarget) {
      nativeMotionTarget = target;
      lastComposerLayoutTop = composerLayoutTop(target);
      openingLockTop = lastComposerLayoutTop;
      preFocusSnapshotUntil = 0;
      return;
    }

    const layoutTop = composerLayoutTop(target);
    if (layoutTop == null) return;
    if (lastComposerLayoutTop == null) {
      lastComposerLayoutTop = layoutTop;
      if (openingLockTop == null) openingLockTop = layoutTop;
      return;
    }

    const previousLayoutTop = lastComposerLayoutTop;
    const coarseStep = Math.abs(previousLayoutTop - layoutTop) >= NATIVE_FLIP_MIN_PX;
    lastComposerLayoutTop = layoutTop;

    if (!openingHoldActive) {
      /* Smooth native motion is already desirable. Intervene only when one
         frame contains a coarse jump large enough to look like teleporting. */
      if (!coarseStep) return;
      preFocusSnapshotUntil = 0;
      beginOpeningHold(target, previousLayoutTop, layoutTop, g);
      return;
    }

    /* Keep visual top exactly locked while native layout continues changing. */
    applyOpeningHold(target, layoutTop);

    const layoutStable = openingLastLayoutTop != null
      && Math.abs(layoutTop - openingLastLayoutTop) <= OPENING_STABLE_SLOP_PX;
    const innerStable = openingLastInnerHeight != null
      && Math.abs(g.innerHeight - openingLastInnerHeight) <= OPENING_STABLE_SLOP_PX;
    const shellStable = openingLastShellBottom != null
      && Math.abs(g.currentShellBottom - openingLastShellBottom) <= OPENING_STABLE_SLOP_PX;

    openingStableFrames = layoutStable && innerStable && shellStable
      ? openingStableFrames + 1
      : 0;
    openingLastLayoutTop = layoutTop;
    openingLastInnerHeight = g.innerHeight;
    openingLastShellBottom = g.currentShellBottom;

    const heldFor = now() - openingHoldStartedAt;
    const stableEnough = (
      openingStableFrames >= OPENING_STABLE_FRAMES
      && heldFor >= OPENING_HOLD_MIN_MS
    );
    const timedOut = heldFor >= OPENING_HOLD_MAX_MS;
    if (stableEnough || timedOut) releaseOpeningHold();
  };

  const animateClosingLayoutJump = (delta: number) => {
    const target = nativeMotionTarget;
    if (!target || Math.abs(delta) < NATIVE_FLIP_MIN_PX || prefersReducedMotion()) return;
    if (typeof target.animate !== 'function') return;

    const carry = animatedTranslateY(target);
    cancelNativeAnimation();
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
    try { root.dataset.keyboardMotion = 'native-closing'; } catch { /* detached */ }
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

  const updateNativeClosingMotion = () => {
    if (nativeMotionEdge !== 'closing') return;
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
    animateClosingLayoutJump(delta);
  };

  const startSession = () => {
    if (sessionActive) return;
    ensureBaseline();
    sessionActive = true;
    overlayEvidence = 0;
    nativeMotionEdge = 'opening';
    openingReleaseStarted = false;
    setIntent(true);
    setPhase('opening');
    captureComposerPosition(activeComposerMotionTarget(), true);
    if (openingLockTop == null) openingLockTop = lastComposerLayoutTop;
    anchor.begin();
  };

  const clearNativeOpenTimer = () => {
    if (!nativeOpenTimer) return;
    clearTimeout(nativeOpenTimer);
    nativeOpenTimer = 0;
  };

  const finishSession = () => {
    clearNativeOpenTimer();
    if (openingHoldActive) restoreOpeningInlineStyle();
    resetOpeningMotion(false);
    cancelNativeAnimation();

    sessionActive = false;
    mode = 'unknown';
    baseline = null;
    overlayEvidence = 0;
    sampleUntil = 0;
    preFocusSnapshotUntil = 0;
    nativeMotionEdge = null;
    openingLockTop = null;
    setIntent(false);
    setPhase('closed');
    publishInset(0);
    anchor.end();
    lastComposerLayoutTop = null;
    try { root.dataset.keyboardMode = 'unknown'; } catch { /* detached */ }
  };

  const geometry = (): KeyboardGeometry => {
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

  const geometryLooksRestored = (g: KeyboardGeometry): boolean => {
    if (!baseline) return true;
    return (
      g.visualShrink <= RESTORE_SLOP_PX
      && g.innerShrink <= RESTORE_SLOP_PX
      && g.shellShrink <= RESTORE_SLOP_PX
      && g.visibleCoverage <= KEYBOARD_OPEN_THRESHOLD_PX
    );
  };

  const classifyMode = (g: KeyboardGeometry) => {
    if (mode !== 'unknown') return;

    if (g.innerShrink >= NATIVE_DELTA_PX || g.shellShrink >= NATIVE_DELTA_PX) {
      setMode('native-resize');
      overlayEvidence = 0;
      return;
    }

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

    if (mode === 'native-resize') {
      if (nativeMotionEdge === 'opening') updateNativeOpeningMotion(g);
      else if (nativeMotionEdge === 'closing') updateNativeClosingMotion();
    }

    if (phase === 'closing' && geometryLooksRestored(g)) {
      finishSession();
      return;
    }

    if (mode === 'native-resize') {
      publishInset(0);
      if (phase === 'opening' && (g.innerShrink >= NATIVE_DELTA_PX || g.shellShrink >= NATIVE_DELTA_PX)) {
        setPhase('open');
      } else if (phase !== 'opening' && geometryLooksRestored(g)) {
        finishSession();
      }
      return;
    }

    if (mode === 'overlay') {
      /* Overlay and native motion must never coexist. */
      if (openingHoldActive) restoreOpeningInlineStyle();
      resetOpeningMotion(false);
      nativeMotionEdge = null;
      openingLockTop = null;

      publishInset(g.visibleCoverage);
      if (phase === 'opening' && g.visibleCoverage > KEYBOARD_OPEN_THRESHOLD_PX) {
        setPhase('open');
      }
      if (geometryLooksRestored(g)) finishSession();
      return;
    }

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
      if (preFocusSnapshotUntil <= now() || !baseline) baseline = captureBaseline();
      mode = 'unknown';
      overlayEvidence = 0;
      try { root.dataset.keyboardMode = 'unknown'; } catch { /* detached */ }
    }
    captureComposerPosition(activeComposerMotionTarget(), true);
    if (openingLockTop == null) openingLockTop = lastComposerLayoutTop;
    sampleFor();
  };

  const prepareClosingMotion = () => {
    /* A very fast dismiss can interrupt opening hold/release. Remove opening
       presentation state before taking the closing layout snapshot so the two
       edges never own transform at the same time. */
    if (openingHoldActive) restoreOpeningInlineStyle();
    resetOpeningMotion(false);
    cancelNativeAnimation();
    openingLockTop = null;
    captureComposerPosition();
    nativeMotionEdge = 'closing';
  };

  const onFocusOut = () => {
    if (!sessionActive) {
      baseline = null;
      preFocusSnapshotUntil = 0;
      nativeMotionEdge = null;
      openingLockTop = null;
      return;
    }
    prepareClosingMotion();
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

  document.addEventListener('pointerdown', primePreFocusSnapshot, true);
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
        captureComposerPosition(activeComposerMotionTarget(), true);
        if (openingLockTop == null) openingLockTop = lastComposerLayoutTop;
        startSession();
        nativeMotionEdge = 'opening';
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
      prepareClosingMotion();
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
      if (openingHoldActive) restoreOpeningInlineStyle();
      resetOpeningMotion(false);
      cancelNativeAnimation();
      nativeMotionEdge = null;
      openingLockTop = null;
      anchor.end();
      insetListeners.clear();
      document.removeEventListener('pointerdown', primePreFocusSnapshot, true);
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
