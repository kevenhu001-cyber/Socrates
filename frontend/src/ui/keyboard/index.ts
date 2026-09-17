/**
 * ui/keyboard — virtual-keyboard avoidance controller.
 *
 * Browsers expose mobile-keyboard geometry in two very different ways:
 *   - progressive: VisualViewport/layout geometry advances over several frames;
 *   - coarse: the page receives only the start and final geometry.
 *
 * Progressive motion is followed directly. For a coarse jump, JS performs a
 * same-frame FLIP: invert the already-applied layout jump before the next paint,
 * then animate once to the browser's final layout. This preserves a visible
 * opening/closing transition without reintroducing the old restart/judder loop.
 *
 * Capacitor native-resize remains system-owned; this browser fallback is never
 * installed in the native shell.
 */

import {
  isTrackedInputFocused,
  KEYBOARD_OPEN_THRESHOLD_PX,
  type ViewportLike,
} from './geometry.ts';
import { TranscriptAnchor } from './anchor.ts';

const BLUR_GRACE_MS = 900;
const EDGE_SAMPLE_MS = 650;
const PRE_FOCUS_BASELINE_MS = 800;
const OVERLAY_EVIDENCE_FRAMES = 2;
const NATIVE_DELTA_PX = 24;
const OVERLAY_DELTA_PX = 24;
const RESTORE_SLOP_PX = 8;
const NATIVE_OPEN_SETTLE_MS = 260;
const NATIVE_HIDE_FALLBACK_MS = 520;

const WEB_SYNC_LAYOUT_EVIDENCE_PX = 2;
const WEB_SYNC_EPSILON_PX = 0.2;
/* Per-frame IME movement is normally well below this. Crossing it indicates
 * that the browser exposed a coarse start->end geometry jump instead of the
 * keyboard's intermediate animation frames. */
const WEB_COARSE_JUMP_PX = 56;
const WEB_FALLBACK_MIN_MS = 190;
const WEB_FALLBACK_MAX_MS = 300;
const WEB_FALLBACK_BASE_MS = 175;
const WEB_FALLBACK_MS_PER_PX = 0.27;
const WEB_FALLBACK_EASING = 'cubic-bezier(0.2, 0, 0, 1)';

type KeyboardMode = 'unknown' | 'native-resize' | 'overlay';
type WebMotionEdge = 'opening' | 'closing' | null;
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
  visualOffsetTop: number;
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

type CapacitorLike = {
  isNativePlatform?: () => boolean;
};

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
  const capacitor = (window as Window & { Capacitor?: CapacitorLike }).Capacitor;
  const isCapacitorNative = (() => {
    try { return Boolean(capacitor?.isNativePlatform?.()); }
    catch { return false; }
  })();

  let phase: KeyboardPhase = 'closed';
  let mode: KeyboardMode = 'unknown';
  let sessionActive = false;
  let baseline: SessionBaseline | null = null;
  let preFocusBaselineUntil = 0;
  let appliedInset = -1;
  let overlayEvidence = 0;
  let frame = 0;
  let sampleUntil = 0;
  let blurTimer: ReturnType<typeof setTimeout> | 0 = 0;
  let nativeOpenTimer: ReturnType<typeof setTimeout> | 0 = 0;
  let nativeHideTimer: ReturnType<typeof setTimeout> | 0 = 0;

  /* Browser-only composer presentation state. */
  let webMotionTarget: HTMLElement | null = null;
  let webMotionArmed = false;
  let webStartTop: number | null = null;
  let webLastLayoutTop: number | null = null;
  let webTranslateY = 0;
  let webMotionEdge: WebMotionEdge = null;
  let webFallbackPlayed = false;
  let webFallbackAnimation: Animation | null = null;
  let webOriginalTransformValue = '';
  let webOriginalTransformPriority = '';
  let webOriginalWillChangeValue = '';
  let webOriginalWillChangePriority = '';

  const shellElement = (): HTMLElement | null => (
    container || document.getElementById('appShell') || root
  );

  const isFocused = () => isTrackedInputFocused(trackedInputs);

  const trackedWrapForNode = (node: EventTarget | Node | null): HTMLElement | null => {
    if (!(node instanceof Node)) return null;
    return trackedInputs.find((element) => element === node || element.contains(node)) || null;
  };

  const motionTargetForNode = (node: EventTarget | Node | null): HTMLElement | null => {
    const wrap = trackedWrapForNode(node);
    if (!wrap) return null;
    if (wrap.id === 'chatInputWrap') return document.getElementById('chatInputBar') || wrap;
    return wrap;
  };

  const activeMotionTarget = (): HTMLElement | null => (
    motionTargetForNode(document.activeElement) || webMotionTarget
  );

  const setPhase = (next: KeyboardPhase) => {
    if (phase === next && root.dataset.keyboardPhase === next) return;
    phase = next;
    try { root.dataset.keyboardPhase = next; } catch { /* detached */ }
  };

  const setIntent = (open: boolean) => {
    try { root.dataset.keyboardOpen = open ? 'true' : 'false'; } catch { /* detached */ }
  };

  const setMode = (next: KeyboardMode) => {
    if (mode !== 'unknown' && next !== mode) return;
    mode = next;
    try { root.dataset.keyboardMode = next; } catch { /* detached */ }
  };

  const publishInset = (value: number) => {
    const next = Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
    if (next === appliedInset) return;
    appliedInset = next;
    root.style.setProperty('--keyboard-inset', `${next}px`);
    for (const cb of insetListeners) {
      try { cb(next); } catch { /* isolated */ }
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
      ? Math.max(0, Number(viewport.offsetTop)) : 0;
    const documentTop = Number.isFinite(Number(window.scrollY))
      ? Math.max(0, Number(window.scrollY)) : 0;
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
    visualOffsetTop: viewport && Number.isFinite(Number(viewport.offsetTop))
      ? Math.max(0, Number(viewport.offsetTop))
      : 0,
  });

  const ensureBaseline = () => {
    if (!baseline) baseline = captureBaseline();
  };

  const prefersReducedMotion = (): boolean => {
    try { return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches); }
    catch { return false; }
  };

  const webTransform = (offset: number): string => {
    const translate = `translate3d(0, ${offset}px, 0)`;
    return webOriginalTransformValue
      ? `${translate} ${webOriginalTransformValue}`
      : translate;
  };

  const restoreWebMotionStyle = () => {
    const target = webMotionTarget;
    if (!target) return;

    if (webOriginalTransformValue) {
      target.style.setProperty(
        'transform',
        webOriginalTransformValue,
        webOriginalTransformPriority,
      );
    } else {
      target.style.removeProperty('transform');
    }

    if (webOriginalWillChangeValue) {
      target.style.setProperty(
        'will-change',
        webOriginalWillChangeValue,
        webOriginalWillChangePriority,
      );
    } else {
      target.style.removeProperty('will-change');
    }
  };

  const cancelWebFallbackAnimation = () => {
    if (!webFallbackAnimation) return;
    try { webFallbackAnimation.cancel(); } catch { /* already finished */ }
    webFallbackAnimation = null;
  };

  const resetWebMotion = (
    restoreStyle = true,
    cancelAnimation = true,
  ) => {
    if (cancelAnimation) cancelWebFallbackAnimation();
    if (restoreStyle && webMotionArmed) restoreWebMotionStyle();
    webMotionTarget = null;
    webMotionArmed = false;
    webStartTop = null;
    webLastLayoutTop = null;
    webTranslateY = 0;
    webMotionEdge = null;
    webFallbackPlayed = false;
    webOriginalTransformValue = '';
    webOriginalTransformPriority = '';
    webOriginalWillChangeValue = '';
    webOriginalWillChangePriority = '';
    try { delete root.dataset.keyboardMotion; } catch { /* detached */ }
  };

  const armWebMotion = (target: HTMLElement | null) => {
    if (isCapacitorNative || !viewport || !target) return;
    if (webMotionArmed && webMotionTarget === target) return;

    resetWebMotion();
    webMotionTarget = target;

    const rectTop = Number(target.getBoundingClientRect().top);
    if (!Number.isFinite(rectTop)) {
      webMotionTarget = null;
      return;
    }

    webOriginalTransformValue = target.style.getPropertyValue('transform');
    webOriginalTransformPriority = target.style.getPropertyPriority('transform');
    webOriginalWillChangeValue = target.style.getPropertyValue('will-change');
    webOriginalWillChangePriority = target.style.getPropertyPriority('will-change');
    webStartTop = rectTop;
    webLastLayoutTop = rectTop;
    webTranslateY = 0;
    webMotionEdge = 'opening';
    webFallbackPlayed = false;
    webMotionArmed = true;

    /* Pre-promote before focus so a coarse keyboard jump can be inverted in
       the resize callback without introducing a new compositor layer. */
    target.style.setProperty('transform', webTransform(0), 'important');
    target.style.setProperty('will-change', 'transform', 'important');
    try { root.dataset.keyboardMotion = 'web-armed'; } catch { /* detached */ }
  };

  const fallbackDuration = (distance: number): number => (
    Math.round(Math.min(
      WEB_FALLBACK_MAX_MS,
      Math.max(
        WEB_FALLBACK_MIN_MS,
        WEB_FALLBACK_BASE_MS + Math.abs(distance) * WEB_FALLBACK_MS_PER_PX,
      ),
    ))
  );

  const startCoarseFallback = (
    target: HTMLElement,
    delta: number,
  ): boolean => {
    if (
      isCapacitorNative
      || prefersReducedMotion()
      || !webMotionArmed
      || webFallbackPlayed
      || Math.abs(delta) < WEB_COARSE_JUMP_PX
      || typeof target.animate !== 'function'
    ) {
      return false;
    }

    cancelWebFallbackAnimation();
    webFallbackPlayed = true;

    const from = webTranslateY + delta;
    const to = webTranslateY;

    /* Set the inverse synchronously first. The current resize/layout has
       already landed, so this restores the previous painted position before
       the browser gets another paint opportunity. */
    target.style.setProperty('transform', webTransform(from), 'important');
    target.style.setProperty('will-change', 'transform', 'important');

    let animation: Animation;
    try {
      animation = target.animate(
        [
          { transform: webTransform(from) },
          { transform: webTransform(to) },
        ],
        {
          duration: fallbackDuration(delta),
          easing: WEB_FALLBACK_EASING,
          fill: 'both',
        },
      );
    } catch {
      target.style.setProperty('transform', webTransform(to), 'important');
      return false;
    }

    /* The animation owns presentation; the inline style underneath is already
       the final state, so cancel/finish reveals the correct layout. */
    target.style.setProperty('transform', webTransform(to), 'important');
    webFallbackAnimation = animation;
    try {
      root.dataset.keyboardMotion = webMotionEdge === 'closing'
        ? 'web-fallback-closing'
        : 'web-fallback-opening';
    } catch { /* detached */ }

    animation.onfinish = () => {
      if (webFallbackAnimation !== animation) return;
      webFallbackAnimation = null;
      try { animation.cancel(); } catch { /* no-op */ }

      if (!sessionActive && webMotionEdge === 'closing') {
        resetWebMotion(true, false);
        return;
      }
      try { root.dataset.keyboardMotion = 'web-armed'; } catch { /* detached */ }
    };
    animation.oncancel = () => {
      if (webFallbackAnimation === animation) webFallbackAnimation = null;
    };
    return true;
  };

  const prepareWebClosingEdge = () => {
    if (isCapacitorNative || !webMotionArmed) return;

    /* A very fast close may interrupt the opening fallback. Prefer the real
       open layout as the new baseline rather than carrying a stale animation. */
    if (webFallbackAnimation) {
      cancelWebFallbackAnimation();
      const target = webMotionTarget;
      if (target) target.style.setProperty('transform', webTransform(webTranslateY), 'important');
    }

    webMotionEdge = 'closing';
    webFallbackPlayed = false;

    const target = webMotionTarget;
    if (!target) return;
    const paintedTop = Number(target.getBoundingClientRect().top);
    if (!Number.isFinite(paintedTop)) return;
    webLastLayoutTop = paintedTop - webTranslateY;
  };

  const detectCoarseLayoutJump = (
    target: HTMLElement,
    layoutTop: number,
  ): boolean => {
    const previous = webLastLayoutTop;
    webLastLayoutTop = layoutTop;
    if (previous == null) return false;
    return startCoarseFallback(target, previous - layoutTop);
  };

  const syncWebMotionNow = () => {
    if (isCapacitorNative || !viewport || !baseline || !webMotionArmed) return;
    if (mode === 'overlay' || webFallbackAnimation) return;

    const target = activeMotionTarget();
    if (!target || target !== webMotionTarget || webStartTop == null) return;

    const innerHeight = Math.max(0, Number(window.innerHeight) || 0);
    const currentShellBottom = shellBottom();
    const layoutEvidence = Math.max(
      Math.abs(baseline.innerHeight - innerHeight),
      Math.abs(baseline.shellBottom - currentShellBottom),
    );

    /* Without layout movement this is likely overlay mode. Let the overlay
       branch own the lift rather than pre-emptively double-moving the input. */
    if (layoutEvidence < WEB_SYNC_LAYOUT_EVIDENCE_PX && mode !== 'native-resize') return;

    const visualHeight = Number.isFinite(Number(viewport.height))
      ? Math.max(0, Number(viewport.height))
      : innerHeight;
    const visualOffsetTop = Number.isFinite(Number(viewport.offsetTop))
      ? Math.max(0, Number(viewport.offsetTop))
      : 0;

    const paintedTop = Number(target.getBoundingClientRect().top);
    if (!Number.isFinite(paintedTop)) return;
    const layoutTop = paintedTop - webTranslateY;

    /* If the browser exposed only start/end geometry, animate this one coarse
       jump immediately. If it exposes progressive frames, no fallback starts. */
    if (detectCoarseLayoutJump(target, layoutTop)) return;

    const visualShrink = Math.max(0, baseline.visualHeight - visualHeight);
    const offsetDelta = visualOffsetTop - baseline.visualOffsetTop;
    const desiredLayoutTop = webStartTop - visualShrink + offsetDelta;
    const nextTranslate = desiredLayoutTop - layoutTop;
    if (!Number.isFinite(nextTranslate)) return;

    if (Math.abs(nextTranslate - webTranslateY) <= WEB_SYNC_EPSILON_PX) return;
    webTranslateY = nextTranslate;
    target.style.setProperty('transform', webTransform(webTranslateY), 'important');
    target.style.setProperty('will-change', 'transform', 'important');
    try { root.dataset.keyboardMotion = 'web-visual-viewport-sync'; } catch { /* detached */ }
  };

  const publishOverlayInset = (value: number) => {
    if (isCapacitorNative || !webMotionArmed || !webMotionTarget || webFallbackAnimation) {
      publishInset(value);
      return;
    }

    const target = webMotionTarget;
    const beforePaintedTop = Number(target.getBoundingClientRect().top);
    const beforeLayoutTop = Number.isFinite(beforePaintedTop)
      ? beforePaintedTop - webTranslateY
      : null;

    publishInset(value);

    /* Force one post-write geometry read while still in the same task. This
       lets a one-step CSS/layout lift be inverted before the next paint. */
    const afterPaintedTop = Number(target.getBoundingClientRect().top);
    if (!Number.isFinite(afterPaintedTop)) return;
    const afterLayoutTop = afterPaintedTop - webTranslateY;

    if (beforeLayoutTop != null) webLastLayoutTop = beforeLayoutTop;
    detectCoarseLayoutJump(target, afterLayoutTop);
  };

  const clearNativeOpenTimer = () => {
    if (!nativeOpenTimer) return;
    clearTimeout(nativeOpenTimer);
    nativeOpenTimer = 0;
  };

  const clearNativeHideTimer = () => {
    if (!nativeHideTimer) return;
    clearTimeout(nativeHideTimer);
    nativeHideTimer = 0;
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

  const finishSession = () => {
    const keepClosingFallback = Boolean(
      webFallbackAnimation && webMotionEdge === 'closing',
    );

    clearNativeOpenTimer();
    clearNativeHideTimer();
    if (!keepClosingFallback) resetWebMotion();

    sessionActive = false;
    mode = 'unknown';
    baseline = null;
    preFocusBaselineUntil = 0;
    overlayEvidence = 0;
    sampleUntil = 0;
    setIntent(false);
    setPhase('closed');
    publishInset(0);
    anchor.end();
    try { root.dataset.keyboardMode = 'unknown'; } catch { /* detached */ }
  };

  const geometry = (): KeyboardGeometry => {
    ensureBaseline();
    const base = baseline as SessionBaseline;
    const innerHeight = Math.max(0, Number(window.innerHeight) || 0);
    const currentShellBottom = shellBottom();
    const visualHeight = viewport && Number.isFinite(Number(viewport.height))
      ? Math.max(0, Number(viewport.height)) : innerHeight;
    const visualOffsetTop = viewport && Number.isFinite(Number(viewport.offsetTop))
      ? Math.max(0, Number(viewport.offsetTop)) : 0;
    const innerShrink = Math.max(0, base.innerHeight - innerHeight);
    const shellShrink = Math.max(0, base.shellBottom - currentShellBottom);
    const visualShrink = Math.max(0, base.visualHeight - visualHeight);
    const visibleCoverage = Math.max(0, currentShellBottom - (visualHeight + visualOffsetTop));
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
    return g.visualShrink <= RESTORE_SLOP_PX
      && g.innerShrink <= RESTORE_SLOP_PX
      && g.shellShrink <= RESTORE_SLOP_PX
      && g.visibleCoverage <= KEYBOARD_OPEN_THRESHOLD_PX;
  };

  const classifyMode = (g: KeyboardGeometry) => {
    if (mode !== 'unknown') return;

    if (g.innerShrink >= NATIVE_DELTA_PX || g.shellShrink >= NATIVE_DELTA_PX) {
      setMode('native-resize');
      overlayEvidence = 0;
      return;
    }

    const overlayCandidate = g.visualShrink >= OVERLAY_DELTA_PX
      || g.visibleCoverage >= OVERLAY_DELTA_PX
      || g.visualOffsetTop >= OVERLAY_DELTA_PX;
    overlayEvidence = overlayCandidate ? overlayEvidence + 1 : 0;
    if (overlayEvidence >= OVERLAY_EVIDENCE_FRAMES) setMode('overlay');
  };

  const expireUnusedPreFocusState = () => {
    if (sessionActive || isFocused()) return;
    if (!preFocusBaselineUntil || preFocusBaselineUntil > now()) return;
    resetWebMotion();
    baseline = null;
    preFocusBaselineUntil = 0;
  };

  const sample = () => {
    expireUnusedPreFocusState();

    const focused = isFocused();
    const g = geometry();

    const keyboardGeometryPresent = g.visualShrink > KEYBOARD_OPEN_THRESHOLD_PX
      || g.innerShrink > KEYBOARD_OPEN_THRESHOLD_PX
      || g.shellShrink > KEYBOARD_OPEN_THRESHOLD_PX
      || g.visibleCoverage > KEYBOARD_OPEN_THRESHOLD_PX
      || g.visualOffsetTop > KEYBOARD_OPEN_THRESHOLD_PX;

    if (!sessionActive && focused && keyboardGeometryPresent) startSession();
    if (sessionActive) classifyMode(g);

    if (!sessionActive) {
      publishInset(0);
      return;
    }

    if (mode === 'native-resize') {
      syncWebMotionNow();
      publishInset(0);
      if (phase === 'opening' && (
        g.innerShrink >= NATIVE_DELTA_PX || g.shellShrink >= NATIVE_DELTA_PX
      )) {
        setPhase('open');
      }

      /* Handle the final closing geometry before tearing down motion state, so
         a coarse restore can animate after the logical session has ended. */
      if (phase === 'closing' && geometryLooksRestored(g)) finishSession();
      return;
    }

    if (mode === 'overlay') {
      publishOverlayInset(g.visibleCoverage);
      if (phase === 'opening' && g.visibleCoverage > KEYBOARD_OPEN_THRESHOLD_PX) {
        setPhase('open');
      }
      if (phase === 'closing' && geometryLooksRestored(g)) finishSession();
      return;
    }

    /* Unknown mode: synchronous resize callbacks may already be compensating
       a real layout jump, but no CSS inset is published until ownership is known. */
    publishInset(0);
    if (phase === 'closing' && geometryLooksRestored(g)) finishSession();
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

  const onPointerDown = (event: PointerEvent) => {
    if (sessionActive) return;
    const target = motionTargetForNode(event.target);
    if (!target) return;

    baseline = captureBaseline();
    preFocusBaselineUntil = now() + PRE_FOCUS_BASELINE_MS;
    mode = 'unknown';
    overlayEvidence = 0;
    armWebMotion(target);
    try { root.dataset.keyboardMode = 'unknown'; } catch { /* detached */ }
    sampleFor(PRE_FOCUS_BASELINE_MS + 50);
  };

  const onFocusIn = () => {
    if (blurTimer) {
      clearTimeout(blurTimer);
      blurTimer = 0;
    }
    clearNativeHideTimer();

    if (!sessionActive) {
      if (!baseline || preFocusBaselineUntil <= now()) baseline = captureBaseline();
      mode = 'unknown';
      overlayEvidence = 0;
      try { root.dataset.keyboardMode = 'unknown'; } catch { /* detached */ }
    }

    armWebMotion(motionTargetForNode(document.activeElement));
    sampleFor(PRE_FOCUS_BASELINE_MS + 50);
  };

  const onFocusOut = () => {
    if (!sessionActive) {
      resetWebMotion();
      baseline = null;
      preFocusBaselineUntil = 0;
      return;
    }

    prepareWebClosingEdge();
    setPhase('closing');
    sampleFor();
    if (blurTimer) clearTimeout(blurTimer);
    blurTimer = setTimeout(() => {
      blurTimer = 0;
      if (sessionActive && !isFocused()) finishSession();
    }, BLUR_GRACE_MS);
  };

  const onVisualViewportGeometry = () => {
    /* The callback runs after geometry changes but before the next paint. A
       coarse jump is inverted here immediately; progressive frames stay 1:1. */
    syncWebMotionNow();
    sampleFor();
    if (anchor.active) anchor.correct();
  };

  const onWindowResize = () => {
    syncWebMotionNow();
    sampleFor();
    if (anchor.active) anchor.correct();
  };

  const onWindowScroll = () => {
    sampleFor();
    if (anchor.active) anchor.correct();
  };

  document.addEventListener('pointerdown', onPointerDown, true);
  if (viewport && typeof viewport.addEventListener === 'function') {
    viewport.addEventListener('resize', onVisualViewportGeometry);
    viewport.addEventListener('scroll', onVisualViewportGeometry);
  }
  window.addEventListener('resize', onWindowResize);
  window.addEventListener('scroll', onWindowScroll, { passive: true });
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);
  document.addEventListener('visibilitychange', onWindowResize);

  publishInset(0);
  setPhase('closed');
  setIntent(false);
  try { root.dataset.keyboardMode = 'unknown'; } catch { /* detached */ }
  try { delete root.dataset.keyboardMotion; } catch { /* cleanup */ }

  const controller: KeyboardLift = {
    get phase() { return phase; },
    get inset() { return appliedInset > 0 ? appliedInset : 0; },
    onInset(cb) {
      insetListeners.add(cb);
      return () => { insetListeners.delete(cb); };
    },
    notifyNativeKeyboard(kind, _keyboardHeight) {
      if (kind === 'show') {
        if (blurTimer) {
          clearTimeout(blurTimer);
          blurTimer = 0;
        }
        clearNativeHideTimer();
        baseline = baseline ?? captureBaseline();
        startSession();
        setMode('native-resize');
        publishInset(0);
        setPhase('opening');
        clearNativeOpenTimer();
        nativeOpenTimer = setTimeout(() => {
          nativeOpenTimer = 0;
          if (sessionActive && mode === 'native-resize' && phase === 'opening') {
            setPhase('open');
          }
        }, NATIVE_OPEN_SETTLE_MS);
        sampleFor();
        return;
      }

      clearNativeOpenTimer();
      if (!sessionActive) {
        publishInset(0);
        setIntent(false);
        setPhase('closed');
        return;
      }

      setPhase('closing');
      publishInset(0);
      sampleFor();
      clearNativeHideTimer();
      nativeHideTimer = setTimeout(() => {
        nativeHideTimer = 0;
        if (sessionActive) finishSession();
      }, NATIVE_HIDE_FALLBACK_MS);
    },
    destroy() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (blurTimer) {
        clearTimeout(blurTimer);
        blurTimer = 0;
      }
      clearNativeOpenTimer();
      clearNativeHideTimer();
      resetWebMotion();
      anchor.end();
      insetListeners.clear();
      document.removeEventListener('pointerdown', onPointerDown, true);
      if (viewport && typeof viewport.removeEventListener === 'function') {
        viewport.removeEventListener('resize', onVisualViewportGeometry);
        viewport.removeEventListener('scroll', onVisualViewportGeometry);
      }
      window.removeEventListener('resize', onWindowResize);
      window.removeEventListener('scroll', onWindowScroll);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('visibilitychange', onWindowResize);
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
