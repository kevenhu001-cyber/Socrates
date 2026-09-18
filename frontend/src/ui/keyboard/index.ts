/**
 * ui/keyboard — virtual-keyboard avoidance controller.
 *
 * Direct-follower model (Open WebUI): the measured keyboard coverage is
 * mirrored 1:1 into `--keyboard-inset` synchronously inside the geometry
 * event — never deferred to rAF, never gated behind a mode vote, never
 * blended, never animated. Smoothness comes from the source:
 * visualViewport events fire per frame during the IME animation, and
 * resizes-content browsers animate the 100dvh flex column natively on the
 * compositor. There is deliberately no FLIP / WAAPI compensation timeline:
 * a second motion timeline on top of the browser's own geometry is what
 * made the composer judder against the rising keyboard.
 *
 * Closing is confirmed, not instant: a lone restored frame (IME reporting
 * hiccup) is held instead of dipping the composer to zero and bouncing
 * back. Opening is always immediate — the first lifted frame already shows
 * the measured value.
 */

import {
  getKeyboardInset,
  isTrackedInputFocused,
  KEYBOARD_OPEN_THRESHOLD_PX,
  MIN_STABLE_VISUAL_HEIGHT,
  type ViewportLike,
} from './geometry.ts';
import { TranscriptAnchor } from './anchor.ts';

const BLUR_GRACE_MS = 900;
/* A restored (zero-coverage) read must persist this long before the lift is
 * released. Shorter than one real close animation step, longer than an IME
 * reporting hiccup, so a lone bad frame never dips the composer. */
const CLOSE_CONFIRM_MS = 64;
/* Settle window after the confirmed close write before the session tears
 * down, so the transcript anchor observes the final geometry. */
const FINISH_CLOSE_MS = 120;
const RESTORE_SLOP_PX = 8;
const NATIVE_OPEN_SETTLE_MS = 260;
const NATIVE_HIDE_FALLBACK_MS = 520;
/* A native height hint (physical pixels, density unscaled) must never lift
 * the composer off the screen — it is a floor capped against the shell. */
const NATIVE_HINT_MAX_RATIO = 0.65;
/* Sub-pixel shell/viewport rounding noise must not churn the layout. */
const WRITE_EPSILON_PX = 0.2;

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

  const viewport = window.visualViewport as (ViewportLike & EventTarget & { width?: number }) | null;
  const insetListeners = new Set<(layoutInset: number) => void>();
  const capacitor = (window as Window & { Capacitor?: CapacitorLike }).Capacitor;
  const isCapacitorNative = (() => {
    try { return Boolean(capacitor?.isNativePlatform?.()); }
    catch { return false; }
  })();

  let phase: KeyboardPhase = 'closed';
  let mode: KeyboardMode = 'unknown';
  let sessionActive = false;
  let appliedInset = -1;
  let blurTimer: ReturnType<typeof setTimeout> | 0 = 0;
  let closeTimer: ReturnType<typeof setTimeout> | 0 = 0;
  let finishTimer: ReturnType<typeof setTimeout> | 0 = 0;
  let nativeOpenTimer: ReturnType<typeof setTimeout> | 0 = 0;
  let nativeHideTimer: ReturnType<typeof setTimeout> | 0 = 0;
  let nativeHint: number | null = null;

  const shellElement = (): HTMLElement | null => (
    container || document.getElementById('appShell') || root
  );

  const isFocused = () => isTrackedInputFocused(trackedInputs);

  const setPhase = (next: KeyboardPhase) => {
    if (phase === next && root.dataset.keyboardPhase === next) return;
    phase = next;
    try { root.dataset.keyboardPhase = next; } catch { /* detached */ }
  };

  const setIntent = (open: boolean) => {
    try { root.dataset.keyboardOpen = open ? 'true' : 'false'; } catch { /* detached */ }
  };

  const setMode = (next: KeyboardMode) => {
    mode = next;
    try { root.dataset.keyboardMode = next; } catch { /* detached */ }
  };

  const publishInset = (value: number) => {
    const next = Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
    if (Math.abs(next - appliedInset) <= WRITE_EPSILON_PX) return;
    appliedInset = next;
    root.style.setProperty('--keyboard-inset', `${next}px`);
    for (const cb of insetListeners) {
      try { cb(next); } catch { /* isolated */ }
    }
    /* The transcript correction lands in the same task as the inset write,
     * so the painted messages never trail the composer by a frame. */
    if (anchor.active) anchor.correct();
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

  /**
   * Absolute keyboard coverage for this exact frame — no baseline, so a
   * stale pre-focus reference can never inject a jump into the first
   * lifted frame. Returns null for a transient/zoomed viewport sample,
   * which the caller holds (keeps displaying) instead of dipping to zero.
   */
  const measureTarget = (): number | null => {
    const shell = shellBottom();
    if (!(shell > 0)) return 0;
    if (viewport && Number.isFinite(Number(viewport.height))) {
      const height = Math.max(0, Number(viewport.height));
      if (height < MIN_STABLE_VISUAL_HEIGHT) return null;
      const scale = Number((viewport as ViewportLike).scale);
      if (Number.isFinite(scale) && Math.abs(scale - 1) > 0.05) return null;
      const offsetTop = Number.isFinite(Number(viewport.offsetTop))
        ? Math.max(0, Number(viewport.offsetTop)) : 0;
      const measured = getKeyboardInset(shell, height, offsetTop);
      if (measured > KEYBOARD_OPEN_THRESHOLD_PX) {
        /* Real geometry beats the native hint — consume it. */
        nativeHint = null;
        return measured;
      }
      if (nativeHint != null) {
        return Math.min(Math.max(0, nativeHint), shell * NATIVE_HINT_MAX_RATIO, shell);
      }
      return measured;
    }
    /* Legacy WebView without VisualViewport: a stuck shell paired with a
     * shrunken layout height still yields the true keyboard height, while
     * a jointly-shrunk shell reads ~0 (native reflow owns it). */
    const innerHeight = Number(window.innerHeight);
    if (!Number.isFinite(innerHeight) || innerHeight <= 0) return 0;
    const measured = getKeyboardInset(shell, Math.max(0, innerHeight), 0);
    if (measured > KEYBOARD_OPEN_THRESHOLD_PX) {
      nativeHint = null;
      return measured;
    }
    if (nativeHint != null) {
      return Math.min(Math.max(0, nativeHint), shell * NATIVE_HINT_MAX_RATIO, shell);
    }
    return measured;
  };

  const clearTimers = () => {
    if (blurTimer) { clearTimeout(blurTimer); blurTimer = 0; }
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = 0; }
    if (finishTimer) { clearTimeout(finishTimer); finishTimer = 0; }
  };

  const clearNativeTimers = () => {
    if (nativeOpenTimer) { clearTimeout(nativeOpenTimer); nativeOpenTimer = 0; }
    if (nativeHideTimer) { clearTimeout(nativeHideTimer); nativeHideTimer = 0; }
  };

  const startSession = () => {
    if (sessionActive) return;
    sessionActive = true;
    setIntent(true);
    setPhase('opening');
    anchor.begin();
  };

  const finishSession = () => {
    clearTimers();
    clearNativeTimers();
    nativeHint = null;
    sessionActive = false;
    setMode('unknown');
    setIntent(false);
    setPhase('closed');
    publishInset(0);
    anchor.end();
  };

  const scheduleFinish = () => {
    if (finishTimer) return;
    finishTimer = setTimeout(() => {
      finishTimer = 0;
      if (!sessionActive) return;
      const target = measureTarget();
      /* Still restored (or focus genuinely left) — release the session.
       * A re-opened keyboard cancels this timer on its first frame. */
      if (target == null || target <= RESTORE_SLOP_PX || !isFocused()) {
        finishSession();
      }
    }, FINISH_CLOSE_MS);
  };

  const confirmClose = () => {
    closeTimer = 0;
    if (!sessionActive) return;
    const target = measureTarget();
    if (target != null && target > RESTORE_SLOP_PX) return;
    if (target == null) {
      /* Unstable frame at the boundary — wait for a readable one. */
      if (sessionActive) scheduleCloseConfirm();
      return;
    }
    setPhase('closing');
    publishInset(0);
    /* A native shell teleport that restored the layout may still be
     * mid-FLIP; the session releases once the confirmed zero lands. */
    scheduleFinish();
  };

  const scheduleCloseConfirm = () => {
    if (closeTimer) return;
    /* Held, not closing yet: a lone restored frame must neither dip the
     * composer nor flip the phase — the confirm timer below releases the
     * lift only if the restore persists. */
    closeTimer = setTimeout(confirmClose, CLOSE_CONFIRM_MS);
  };

  const cancelCloseConfirm = () => {
    if (!closeTimer) return;
    clearTimeout(closeTimer);
    closeTimer = 0;
  };

  /**
   * The single entry point for every geometry signal. The inset is derived
   * from absolute live geometry and published synchronously — the painted
   * composer tracks the keyboard frame the browser just reported, with no
   * deferred vote that could lag and then snap.
   */
  const updateFromGeometry = () => {
    const target = measureTarget();

    /* A lone transient frame holds the current lift instead of dipping. */
    if (target == null) return;

    const focused = isFocused();
    const open = target > KEYBOARD_OPEN_THRESHOLD_PX;

    if (!sessionActive && (open && focused)) startSession();

    if (sessionActive) {
      if (open) {
        cancelCloseConfirm();
        if (finishTimer) { clearTimeout(finishTimer); finishTimer = 0; }
        if (phase === 'closing') setPhase('opening');
        /* Immediate mirror — progressive IME frames land 1:1, and a coarse
         * overlay jump lands whole: the composer never trails the keyboard
         * and therefore never has to catch up with a visible snap. */
        publishInset(target);
        setMode('overlay');
        if (Math.abs(target - (appliedInset > 0 ? appliedInset : 0)) <= 1) {
          setPhase('open');
        }
      } else if (target <= RESTORE_SLOP_PX) {
        /* Held, not published: a single restored frame must not dip the
         * composer. The confirm timer releases the lift only if the
         * restore persists. */
        if (phase === 'open' || phase === 'opening') scheduleCloseConfirm();
        else if (phase === 'closing' && !closeTimer && !finishTimer) scheduleCloseConfirm();
      }
      /* A visual-viewport pan can leave the coverage unchanged (same inset)
       * while moving the painted content: the transcript compensation must
       * run on every geometry event, not only on inset writes. */
      if (anchor.active) anchor.correct();
    } else {
      if (appliedInset !== 0) publishInset(0);
      if (phase !== 'closed') setPhase('closed');
      if (root.dataset.keyboardOpen !== 'false') setIntent(false);
    }
  };

  const onPointerDown = () => {
    /* No FLIP target to pre-arm anymore — pointerdown is kept for future
     * pre-baseline capture, but the controller no longer drives a parallel
     * presentation timeline that would race the browser's own animation. */
  };

  const onFocusIn = () => {
    if (blurTimer) {
      clearTimeout(blurTimer);
      blurTimer = 0;
    }
    clearNativeTimers();
    updateFromGeometry();
  };

  const onFocusOut = () => {
    if (!sessionActive) return;
    /* The IME dismiss button often keeps focus while the viewport
     * restores — geometry (not blur) owns the close. Blur only arms the
     * backstop for WebViews whose viewport never reports the restore. */
    setPhase('closing');
    updateFromGeometry();
    if (blurTimer) clearTimeout(blurTimer);
    blurTimer = setTimeout(() => {
      blurTimer = 0;
      if (sessionActive && !isFocused()) {
        cancelCloseConfirm();
        publishInset(0);
        finishSession();
      }
    }, BLUR_GRACE_MS);
  };

  const onGeometryEvent = () => {
    updateFromGeometry();
  };

  document.addEventListener('pointerdown', onPointerDown, true);
  if (viewport && typeof viewport.addEventListener === 'function') {
    viewport.addEventListener('resize', onGeometryEvent);
    viewport.addEventListener('scroll', onGeometryEvent);
  }
  window.addEventListener('resize', onGeometryEvent);
  window.addEventListener('scroll', onGeometryEvent, { passive: true });
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);
  document.addEventListener('visibilitychange', onGeometryEvent);

  publishInset(0);
  setPhase('closed');
  setIntent(false);
  setMode('unknown');
  try { delete root.dataset.keyboardMotion; } catch { /* cleanup */ }

  const controller: KeyboardLift = {
    get phase() { return phase; },
    get inset() { return appliedInset > 0 ? appliedInset : 0; },
    onInset(cb) {
      insetListeners.add(cb);
      return () => { insetListeners.delete(cb); };
    },
    notifyNativeKeyboard(kind, keyboardHeight) {
      if (kind === 'show') {
        if (blurTimer) {
          clearTimeout(blurTimer);
          blurTimer = 0;
        }
        if (closeTimer) {
          clearTimeout(closeTimer);
          closeTimer = 0;
        }
        if (finishTimer) {
          clearTimeout(finishTimer);
          finishTimer = 0;
        }
        if (nativeHideTimer) {
          clearTimeout(nativeHideTimer);
          nativeHideTimer = 0;
        }
        const hint = Number(keyboardHeight);
        nativeHint = Number.isFinite(hint) && hint > 0 ? hint : null;
        startSession();
        setMode('native-resize');
        setPhase('opening');
        updateFromGeometry();
        if (nativeOpenTimer) clearTimeout(nativeOpenTimer);
        nativeOpenTimer = setTimeout(() => {
          nativeOpenTimer = 0;
          if (sessionActive && phase === 'opening') {
            setPhase('open');
          }
        }, NATIVE_OPEN_SETTLE_MS);
        return;
      }

      if (nativeOpenTimer) {
        clearTimeout(nativeOpenTimer);
        nativeOpenTimer = 0;
      }
      nativeHint = null;
      if (!sessionActive) {
        publishInset(0);
        setIntent(false);
        setPhase('closed');
        return;
      }

      setPhase('closing');
      updateFromGeometry();
      if (nativeHideTimer) clearTimeout(nativeHideTimer);
      nativeHideTimer = setTimeout(() => {
        nativeHideTimer = 0;
        /* Some WebViews never report the dismiss geometry — release. */
        if (sessionActive) {
          cancelCloseConfirm();
          publishInset(0);
          finishSession();
        }
      }, NATIVE_HIDE_FALLBACK_MS);
    },
    destroy() {
      clearTimers();
      clearNativeTimers();
      anchor.end();
      insetListeners.clear();
      document.removeEventListener('pointerdown', onPointerDown, true);
      if (viewport && typeof viewport.removeEventListener === 'function') {
        viewport.removeEventListener('resize', onGeometryEvent);
        viewport.removeEventListener('scroll', onGeometryEvent);
      }
      window.removeEventListener('resize', onGeometryEvent);
      window.removeEventListener('scroll', onGeometryEvent);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('visibilitychange', onGeometryEvent);
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
