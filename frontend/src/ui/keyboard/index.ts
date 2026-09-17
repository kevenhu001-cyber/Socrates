/**
 * ui/keyboard — the keyboard lift controller.
 *
 * Keeps the in-flow composer above mobile virtual keyboards with a direct
 * 1:1 follower (the same approach as Open WebUI):
 *
 *     geometry event → measure against the live shell → write --keyboard-inset
 *
 * Two complementary mechanisms share the work:
 *
 *   - Native (Chrome/Edge Android 108+ via `interactive-widget=resizes-content`,
 *     Firefox Android, Capacitor `Keyboard.resize: "native"`): the layout
 *     viewport itself shrinks above the keyboard, so the 100dvh flex column
 *     reflows on the compositor with zero JS motion. The live-shell
 *     measurement below reads ~0 there, so no inset is ever added twice.
 *   - Overlay (iOS Safari, older WebViews, Samsung builds that never resize):
 *     the layout viewport stays put while window.visualViewport shrinks
 *     (and pans). Each visualViewport resize/scroll event is mirrored
 *     straight into `--keyboard-inset` in one rAF-coalesced write, so the
 *     composer tracks the keyboard's own per-frame animation curve with no
 *     interpolation lag, no estimated lift, and no corrective snap.
 *
 * Deliberately NOT done here (all former sources of visible jump/stutter):
 * spring interpolation (trails the IME by ~100-270ms, then snaps), shell
 * height freezing (fights the browser's native resize and thrashes layout),
 * anticipated/estimated lifts (wrong height corrected mid-flight), and
 * compositor transforms on the shell (mis-positioned on recent iOS).
 *
 * Outputs (all owned exclusively by this module):
 *   --keyboard-inset              layout-space coverage, drives
 *                                 .chat-view / #topicSetup padding-bottom
 *   data-keyboard-open            true while a published inset is active
 *   data-keyboard-phase           open | closing | closed
 *
 * External `--keyboard-inset` writes (older bridges, tests) are still
 * honoured: they bypass this controller entirely, with scroll.js
 * re-anchoring a pinned reader.
 *
 * Open needs focus; close follows the viewport: the value tracks the live
 * visualViewport even after blur (the keyboard slides away over ~250ms and
 * the composer must slide with it, not snap on blur). A blur grace timer
 * and the Capacitor hide signal force the close on platforms that never
 * report the restore geometry, so a stale report can never leave the
 * composer lifted.
 */

import {
  isTrackedInputFocused,
  measureKeyboard,
  KEYBOARD_OPEN_THRESHOLD_PX,
  MIN_STABLE_VISUAL_HEIGHT,
  type ViewportLike,
} from './geometry.ts';
import { TranscriptAnchor } from './anchor.ts';

/* A lone zero sample is held for one extra frame. Real devices emit a
 * transient empty frame mid-session (an IME reporting hiccup); acting on
 * it dips the composer and re-rises — a visible stutter. A real close
 * keeps reporting zero, so holding one frame costs at most ~16ms of close
 * latency while swallowing the glitch. */
const ZERO_HOLD_MS = 32;

/* After blur, the close still follows the viewport's own restore animation.
 * Platforms that never report it (some Samsung builds) get force-closed
 * here so the composer cannot stick above a dismissed keyboard. */
const BLUR_GRACE_MS = 900;

export type KeyboardPhase = 'closed' | 'opening' | 'open' | 'closing';

export interface KeyboardLift {
  readonly phase: KeyboardPhase;
  /** Last published layout-space inset in px. */
  readonly inset: number;
  /** Subscribe to each published inset write (turnAnchor's viewport hold). */
  onInset(cb: (layoutInset: number) => void): () => void;
  /** Native bridge signal: Capacitor keyboardWillShow / keyboardWillHide. */
  notifyNativeKeyboard(kind: 'show' | 'hide', keyboardHeight?: number): void;
  destroy(): void;
}

export interface KeyboardLiftOptions {
  /** Composer roots to track: element, array of elements, or selector. */
  inputs?: HTMLElement | HTMLElement[] | string;
  /** Legacy single-element form of `inputs`. */
  input?: HTMLElement;
  /** The app shell element (defaults to #appShell). */
  container?: HTMLElement | null;
  root?: HTMLElement | null;
}

let active: KeyboardLift | null = null;

/** The most recently initialised lift — null before boot or after destroy. */
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
  if (!root) return unavailableLift();

  const trackedInputs = (() => {
    const source = inputs ?? input;
    if (!source) return [] as HTMLElement[];
    if (typeof source === 'string') {
      return Array.from(document.querySelectorAll<HTMLElement>(source));
    }
    return (Array.isArray(source) ? source : [source]).filter(Boolean);
  })();

  const viewport = (typeof window !== 'undefined' ? window.visualViewport : null) as
    (ViewportLike & EventTarget) | null;
  const anchor = new TranscriptAnchor({
    listFor: () => {
      try {
        return typeof document !== 'undefined' ? document.getElementById('msgList') : null;
      } catch {
        return null;
      }
    },
    viewportOffset: () => composerPanOffset(),
    stillActive: () => isFocused() || phase === 'closing',
  });

  let phase: KeyboardPhase = 'closed';
  let frame = 0;
  let blurTimer: ReturnType<typeof setTimeout> | 0 = 0;
  let holdTimer: ReturnType<typeof setTimeout> | 0 = 0;
  /** Last published inset (integer px). -1 forces the first write. */
  let appliedInset = -1;
  /** True once this session has published a non-zero inset. */
  let sessionActive = false;
  /** Timestamp of the last non-zero computed sample (glitch hold). */
  let lastNonZeroAt = 0;
  /* Floor for the computed inset while a native bridge has just reported
     keyboardWillShow — covers WebViews that report no geometry change. */
  let nativeHeightHint = 0;
  const insetListeners = new Set<(layoutInset: number) => void>();

  const setPhase = (next: KeyboardPhase) => {
    if (next === phase && root.dataset.keyboardPhase === next) return;
    phase = next;
    try { root.dataset.keyboardPhase = next; } catch { /* detached root */ }
  };
  const setIntent = (open: boolean) => {
    try { root.dataset.keyboardOpen = open ? 'true' : 'false'; } catch { /* detached root */ }
  };
  setPhase('closed');
  setIntent(false);

  const shellElement = (): HTMLElement | null => (
    container
    || (typeof document !== 'undefined' ? document.getElementById('appShell') : null)
    || root
  );

  const isFocused = () => isTrackedInputFocused(trackedInputs);

  /* Document scroll is a pan channel, not an error: folding window.scrollY
     into the pan offset keeps the composer glued while the browser pans the
     page on resize-mode platforms. Residual scroll is cleared once, when
     the session fully closes. */
  const settleScroll = () => {
    if (typeof window !== 'undefined' && (window.scrollY !== 0 || window.scrollX !== 0)) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
    }
    for (const id of ['mainContent', 'topicSetup']) {
      try {
        const el = document.getElementById(id);
        if (el && el.scrollTop) el.scrollTop = 0;
      } catch { /* detached */ }
    }
  };

  const viewportOffsetTop = () => {
    const vp = viewport && Number.isFinite(Number(viewport.offsetTop)) ? Number(viewport.offsetTop) : 0;
    const sy = (typeof window !== 'undefined' && Number.isFinite(Number(window.scrollY))) ? Number(window.scrollY) : 0;
    const total = vp + sy;
    return Number.isFinite(total) ? Math.max(0, total) : 0;
  };

  /* Scroll-into-view on the composer's own scrollable ancestors is a third
     displacement channel that neither offsetTop nor window.scrollY reports:
     .topic-setup is overflow:auto and .main-content is overflow:hidden —
     both still scroll programmatically. Folding their scrollTop into the
     pan offset absorbs the reveal in the same write instead of leaving the
     composer teleported by it. */
  const composerContainerScroll = () => {
    let px = 0;
    try {
      const mainEl = typeof document !== 'undefined' ? document.getElementById('mainContent') : null;
      if (mainEl) px += Number(mainEl.scrollTop) || 0;
      const topicEl = typeof document !== 'undefined' ? document.getElementById('topicSetup') : null;
      if (topicEl) px += Number(topicEl.scrollTop) || 0;
    } catch { /* detached */ }
    return Number.isFinite(px) && px > 0 ? px : 0;
  };

  /* Total displacement applied to the composer surfaces by native channels:
     visual-viewport pan + document scroll + container scroll-into-view. The
     transcript anchor compensates the same total so both surfaces agree. */
  const composerPanOffset = () => viewportOffsetTop() + composerContainerScroll();

  /* Bottom edge of the app shell in client coordinates, read LIVE on every
     frame (never frozen). On resizes-content platforms this edge has
     already moved up with the keyboard, so the measured travel is ~0 and
     the browser's native animation owns the motion alone. Falls back to
     innerHeight when the shell is missing or not laid out yet. */
  const appShellBottom = () => {
    const el = shellElement();
    try {
      if (el && typeof el.getBoundingClientRect === 'function') {
        const bottom = el.getBoundingClientRect().bottom + (Number(window.scrollY) || 0);
        if (Number.isFinite(bottom) && bottom > 0) return bottom;
      }
    } catch { /* detached node — use the fallback */ }
    return window.innerHeight || 0;
  };

  /* The inset for this frame, measured — never interpolated. Focus gates
     the open direction only: once a session is active the close follows
     the viewport's own restore animation even across blur, so the composer
     slides down with the keyboard instead of snapping on blur. */
  const measureTarget = (focused: boolean): number => {
    const viewportHeight = Number(viewport?.height);
    /* A transient zero/tiny viewport is not a usable sample — hold the
       last value instead of flashing the composer (see ZERO_HOLD_MS). */
    if (viewport && (!Number.isFinite(viewportHeight) || viewportHeight < MIN_STABLE_VISUAL_HEIGHT)) {
      return appliedInset > 0 ? appliedInset : 0;
    }
    /* Pinch-zoom shrinks the visual viewport without any keyboard — never
       treat it as occlusion (same guard as measureKeyboard). */
    const scale = Number(viewport?.scale);
    if (Number.isFinite(scale) && Math.abs(scale - 1) > 0.05) {
      return appliedInset > 0 ? appliedInset : 0;
    }
    const appBottom = appShellBottom();
    let travel = measureKeyboard(appBottom, viewport, window.innerHeight).travel;
    if (travel <= 0 && viewport) {
      /* Legacy WebViews can leave visualViewport.height stuck at its
         pre-keyboard value while shrinking innerHeight. That layout delta
         is a valid second signal — but only when the visual viewport
         itself reports no coverage, so offsetTop/pan is never counted
         twice. (Without a viewport, measureKeyboard already used the
         innerHeight fallback.) */
      travel = Math.max(0, appBottom - (Number(window.innerHeight) || 0));
    }
    const inset = Math.max(0, travel - composerPanOffset());
    if (inset > 0) return inset;
    /* No measurable geometry: the native hint is a floor for WebViews that
       report nothing at all — but only while focused. The moment the
       platform reports real geometry it wins, so a bridge answering in
       physical pixels can never hold the composer above the keyboard's
       true leading edge. */
    return focused ? nativeHeightHint : 0;
  };

  /* One coalesced frame: measure live, publish 1:1, then let subscribers
     correct their layout in the same frame. Integer px keeps style text
     stable and avoids sub-pixel layout churn every frame. */
  const publish = (focused: boolean) => {
    /* The capture must precede the write: a written inset re-anchors in
       the same frame, and that correction needs the reader's pre-write
       intent, not a post-write snapshot. */
    if (focused) anchor.begin();

    const sampled = measureTarget(focused);
    let next = Math.max(0, Math.round(sampled));
    if (next === 0 && appliedInset > 0 && now() - lastNonZeroAt < ZERO_HOLD_MS) {
      next = appliedInset;
      /* Re-check once the hold window lapses even if no new geometry
         event arrives — otherwise a real close delivered as a single
         sample would stick at the held value forever. */
      if (!holdTimer) {
        holdTimer = setTimeout(() => { holdTimer = 0; wake(); }, ZERO_HOLD_MS);
      }
    } else if (next > 0) {
      lastNonZeroAt = now();
    }
    /* Opening needs focus; an active session keeps following the viewport
       across blur until it reports the restore (or the grace timer fires).
       Geometry while unfocused and session-less is never ours (rotation,
       URL-bar, pinch-zoom guard in measureKeyboard). */
    if (next > 0 && !focused && !sessionActive) next = 0;

    if (next !== appliedInset) {
      appliedInset = next;
      root.style.setProperty('--keyboard-inset', `${next}px`);
      for (const cb of insetListeners) {
        try { cb(next); } catch { /* subscriber faults stay isolated */ }
      }
    }

    const open = appliedInset > KEYBOARD_OPEN_THRESHOLD_PX;
    if (open) {
      sessionActive = true;
      setIntent(true);
      setPhase(focused ? 'open' : 'closing');
    } else {
      const wasActive = sessionActive;
      setIntent(false);
      setPhase('closed');
      sessionActive = false;
      if (wasActive) {
        /* The lift is back at zero: any document scroll the browser used
           to pan is residual — clear it once so the shell lands
           unscrolled. */
        settleScroll();
      }
    }

    /* The correction is written inside the same frame that publishes a
       new inset, so the painted transcript never trails the composer by
       a frame. */
    if (anchor.active && (focused || phase === 'closing')) anchor.correct();
  };

  const onFrame = () => {
    frame = 0;
    publish(isFocused());
  };

  const wake = () => {
    if (frame || typeof requestAnimationFrame !== 'function') {
      /* No rAF (non-DOM test envs): publish synchronously so the state
         machine stays testable without a frame pump. */
      if (typeof requestAnimationFrame !== 'function') publish(isFocused());
      return;
    }
    frame = requestAnimationFrame(onFrame);
  };

  /* ── Event handlers ──────────────────────────────────────────────── */

  const onFocusIn = () => {
    if (blurTimer) { clearTimeout(blurTimer); blurTimer = 0; }
    wake();
  };

  /* Forced close for platforms that never report the restore geometry
     (stale visualViewport after blur, Samsung dismiss without resize).
     The normal path never needs this: the close follows the viewport's
     own per-frame restore animation through publish(). */
  const forceClose = () => {
    if (!sessionActive) return;
    appliedInset = 0;
    root.style.setProperty('--keyboard-inset', '0px');
    for (const cb of insetListeners) {
      try { cb(0); } catch { /* isolated */ }
    }
    setIntent(false);
    setPhase('closed');
    sessionActive = false;
    settleScroll();
    wake();
  };

  const onFocusOut = () => {
    if (blurTimer) clearTimeout(blurTimer);
    /* The close follows the viewport's restore animation; this timer only
       fires on platforms that never report it. */
    blurTimer = setTimeout(() => {
      blurTimer = 0;
      if (sessionActive && !isFocused()) forceClose();
    }, BLUR_GRACE_MS);
    wake();
  };

  const onViewportGeometry = () => {
    wake();
    /* The transcript correction must land in this same task — a deferred
       (next-rAF) restore leaves the transcript one frame behind the pan
       on every event, which reads as continuous judder while iOS pans. */
    if (anchor.active) anchor.correct();
  };

  if (viewport && typeof viewport.addEventListener === 'function') {
    /* iOS Safari can pan the visual viewport without a paired resize. */
    viewport.addEventListener('resize', onViewportGeometry);
    viewport.addEventListener('scroll', onViewportGeometry);
  }
  window.addEventListener('resize', onViewportGeometry);
  /* Document scroll is one of the pan channels (resize-mode platforms
     scroll the page to reveal the focused composer). The live measurement
     absorbs the delta exactly — never reset it per frame. */
  window.addEventListener('scroll', onViewportGeometry, { passive: true });
  /* The composer's own scrollable ancestors can move under a browser
     scroll-into-view without any window/visualViewport event firing
     (notably .topic-setup revealing a below-fold landing input). Their
     scrollTop is folded into the pan offset, so listen directly —
     otherwise the published inset goes stale until the next viewport
     event and the correction lands as a visible jump. */
  const scrolledAncestors: HTMLElement[] = [];
  try {
    for (const id of ['mainContent', 'topicSetup']) {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('scroll', onViewportGeometry, { passive: true });
        scrolledAncestors.push(el);
      }
    }
  } catch { /* detached */ }
  /* Chromium's VirtualKeyboard API reports the IME animation timing.
     overlaysContent stays off — enabling it would switch Chrome to
     overlay mode and leave every untracked input uncovered — so only the
     event timing is used. The reported height is intentionally ignored:
     it overshoots mid-animation on current Chrome builds. */
  const virtualKeyboard = (typeof navigator !== 'undefined'
    ? (navigator as Navigator & { virtualKeyboard?: EventTarget }).virtualKeyboard
    : undefined) ?? null;
  if (virtualKeyboard && typeof virtualKeyboard.addEventListener === 'function') {
    virtualKeyboard.addEventListener('geometrychange', wake);
  }
  /* focusin/focusout bubble from the nested Tiptap editor to the document;
     focus/blur do not, and a document-level listener also covers an editor
     that mounts after this initializer has run. */
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);
  /* Returning from the background (tab switch, native app pause) can
     swallow the close-resize entirely; re-measure on visibility flips.
     The Capacitor bridge mirrors appStateChange into this same event. */
  const onVisibility = () => { wake(); };
  document.addEventListener('visibilitychange', onVisibility);

  /* Initial publish: 0px vars and the closed phase so consumers never
     read a missing variable. */
  publish(isFocused());

  const controller: KeyboardLift = {
    get phase() { return phase; },
    get inset() { return appliedInset > 0 ? appliedInset : 0; },
    onInset(cb) {
      insetListeners.add(cb);
      return () => { insetListeners.delete(cb); };
    },
    notifyNativeKeyboard(kind, keyboardHeight) {
      /* Capacitor's Keyboard plugin delivers the signal ahead of (or
         instead of) a visualViewport resize on some Android builds. The
         reported height is capped at ~62% of the shell: a bridge that
         answers in physical pixels (density unscaled) must not lift the
         composer off the top of the screen. */
      const cap = Math.max(0, appShellBottom()) * 0.62;
      nativeHeightHint = kind === 'show'
        ? Math.min(Math.max(0, Number(keyboardHeight) || 0), cap)
        : 0;
      if (kind === 'hide') {
        if (blurTimer) clearTimeout(blurTimer);
        blurTimer = setTimeout(() => { blurTimer = 0; forceClose(); }, 200);
      }
      wake();
    },
    destroy() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (blurTimer) { clearTimeout(blurTimer); blurTimer = 0; }
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = 0; }
      anchor.end();
      insetListeners.clear();
      appliedInset = -1;
      sessionActive = false;
      nativeHeightHint = 0;
      lastNonZeroAt = 0;
      try {
        root.style.removeProperty('--keyboard-inset');
      } catch { /* detached root */ }
      try { delete root.dataset.keyboardOpen; } catch { /* detached root */ }
      try { delete root.dataset.keyboardPhase; } catch { /* detached root */ }
      if (viewport && typeof viewport.removeEventListener === 'function') {
        viewport.removeEventListener('resize', onViewportGeometry);
        viewport.removeEventListener('scroll', onViewportGeometry);
      }
      window.removeEventListener('resize', onViewportGeometry);
      window.removeEventListener('scroll', onViewportGeometry);
      for (const el of scrolledAncestors) {
        try { el.removeEventListener('scroll', onViewportGeometry); } catch { /* detached */ }
      }
      if (virtualKeyboard && typeof virtualKeyboard.removeEventListener === 'function') {
        virtualKeyboard.removeEventListener('geometrychange', wake);
      }
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('visibilitychange', onVisibility);
      if (active === controller) active = null;
    },
  };
  active = controller;
  return controller;
}

/* Returned when the root element is unavailable (non-DOM test envs). */
function unavailableLift(): KeyboardLift {
  return {
    phase: 'closed',
    inset: 0,
    onInset: () => () => undefined,
    notifyNativeKeyboard: () => undefined,
    destroy: () => undefined,
  };
}
