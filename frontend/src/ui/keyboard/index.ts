/**
 * ui/keyboard — virtual-keyboard avoidance controller.
 *
 * Motion ownership is intentionally strict:
 *   - native-resize: Android/WebView or the browser owns the layout motion.
 *     JS publishes zero keyboard inset and never adds transform/FLIP motion.
 *     The Capacitor Android shell opts into synchronized IME insets so 100dvh
 *     is relaid out on the same animation clock as the real keyboard.
 *   - overlay: the layout viewport stays fixed; JS publishes only the
 *     uncovered VisualViewport coverage as --keyboard-inset.
 *
 * Keeping native-resize presentation-only code out of this controller avoids
 * a second animation timeline fighting the IME. JS still owns keyboard state,
 * mode classification, transcript anchoring and overlay compensation.
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
  let preFocusBaselineUntil = 0;
  let appliedInset = -1;
  let overlayEvidence = 0;
  let frame = 0;
  let sampleUntil = 0;
  let blurTimer: ReturnType<typeof setTimeout> | 0 = 0;
  let nativeOpenTimer: ReturnType<typeof setTimeout> | 0 = 0;
  let nativeHideTimer: ReturnType<typeof setTimeout> | 0 = 0;

  const shellElement = (): HTMLElement | null => (
    container || document.getElementById('appShell') || root
  );

  const isFocused = () => isTrackedInputFocused(trackedInputs);

  const isTrackedNode = (node: EventTarget | Node | null): boolean => {
    if (!(node instanceof Node)) return false;
    return trackedInputs.some((element) => element === node || element.contains(node));
  };

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
  });

  const ensureBaseline = () => {
    if (!baseline) baseline = captureBaseline();
  };

  const clearTimer = (timer: ReturnType<typeof setTimeout> | 0) => {
    if (timer) clearTimeout(timer);
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
    clearNativeOpenTimer();
    clearNativeHideTimer();
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
    try { delete root.dataset.keyboardMotion; } catch { /* legacy cleanup */ }
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

  const sample = () => {
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

    if (phase === 'closing' && geometryLooksRestored(g)) {
      finishSession();
      return;
    }

    if (mode === 'native-resize') {
      /* Native layout is the only movement owner. In the Capacitor Android
         shell synchronized window insets make 100dvh advance on the real IME
         animation clock. Any JS transform here would create a second clock. */
      publishInset(0);
      if (phase === 'opening' && (
        g.innerShrink >= NATIVE_DELTA_PX || g.shellShrink >= NATIVE_DELTA_PX
      )) {
        setPhase('open');
      }
      return;
    }

    if (mode === 'overlay') {
      publishInset(g.visibleCoverage);
      if (phase === 'opening' && g.visibleCoverage > KEYBOARD_OPEN_THRESHOLD_PX) {
        setPhase('open');
      }
      if (geometryLooksRestored(g)) finishSession();
      return;
    }

    /* Unknown mode: wait for evidence instead of guessing and double-lifting. */
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

  const onPointerDown = (event: PointerEvent) => {
    if (sessionActive || !isTrackedNode(event.target)) return;
    baseline = captureBaseline();
    preFocusBaselineUntil = now() + PRE_FOCUS_BASELINE_MS;
    mode = 'unknown';
    overlayEvidence = 0;
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
    sampleFor();
  };

  const onFocusOut = () => {
    if (!sessionActive) {
      baseline = null;
      preFocusBaselineUntil = 0;
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

  document.addEventListener('pointerdown', onPointerDown, true);
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
  try { delete root.dataset.keyboardMotion; } catch { /* legacy cleanup */ }

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
      anchor.end();
      insetListeners.clear();
      document.removeEventListener('pointerdown', onPointerDown, true);
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
