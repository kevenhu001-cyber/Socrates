/**
 * ui/keyboard — the keyboard lift controller.
 *
 * Keeps the composer above mobile virtual keyboards with one pipeline:
 *
 *     geometry event → measure travel → retarget lift → step → write vars
 *
 * The measured screen-space travel (geometry.ts) is only ever a *target*.
 * A rAF loop chases it through the spring in lift.ts, then projects the
 * painted value back to the layout inset the CSS consumes — split out the
 * part of the browser's own viewport pan that is already visible
 * (projectTravel), so a native pan can never appear as a jump.
 *
 * Outputs (all owned exclusively by this module):
 *   --keyboard-inset              layout-space coverage, drives
 *                                 .chat-view / #topicSetup padding-bottom
 *   --keyboard-pan-compensation   native pan not yet reached by the lift;
 *                                 CSS translates surfaces down by it
 *   --keyboard-visual-top         total visual-viewport pan, keeps top
 *                                 chrome pinned while the shell is frozen
 *   data-keyboard-open            intent: a keyboard target is active
 *   data-keyboard-phase           closed | opening | open | closing
 *   data-keyboard-motion="manual" while a session is frozen: suppresses
 *                                 the CSS transition so it cannot fight
 *                                 the per-frame spring writes
 *
 * External `--keyboard-inset` writes (older bridges, tests) are still
 * honoured: they bypass this controller entirely and animate through the
 * .chat-view CSS transition, with scroll.js re-anchoring a pinned reader.
 *
 * Focus is authoritative: the keyboard can only be open while a tracked
 * input holds focus, so a stale visualViewport report can never leave the
 * composer lifted after a real blur.
 */

import {
  getKeyboardInset,
  isEditableWithin,
  isTrackedInputFocused,
  measureKeyboard,
  projectTravel,
  KEYBOARD_OPEN_THRESHOLD_PX,
  MIN_STABLE_VISUAL_HEIGHT,
  type ViewportLike,
} from './geometry.ts';
import { LiftAnimator } from './lift.ts';
import { ShellFreeze } from './shell.ts';
import { TranscriptAnchor } from './anchor.ts';

/* Sampling window around each focus edge: some platforms mutate
 * visualViewport geometry every frame without dispatching per-frame
 * resize/scroll events. The tick loop stays alive for ~900ms around each
 * edge and is extended while the measured travel keeps moving, so those
 * platforms get tracked frame by frame instead of by one late jump. */
const POLL_EDGE_MS = 900;
const POLL_IDLE_MS = 240;
const POLL_EXTERNAL_MS = 400;

/* Anticipated lift: Android Chrome reports the keyboard's final geometry
 * in a single shot (visualViewport resize right around focusin, then a
 * scroll as it pans the visual viewport to reveal the covered composer).
 * That native pan is painted by the compositor a frame ahead of the
 * scroll event that would let us cancel it — the painted raw pan is the
 * instant-jump users see, and the compensation snap-back is the jitter.
 * Starting the spring at the touch edge with an estimated target moves
 * the composer inside the shrinking viewport before the browser needs to
 * pan at all; the first real geometry sample then replaces the estimate
 * mid-flight through the same continuous retarget path. */
const ANTICIPATE_MS = 1200;
const TOUCH_INTENT_MS = 1200;

/* Shell release: once the close motion has settled the frozen height can
 * go back, but only after the viewports themselves report the keyboard
 * fully gone — or after a grace period for platforms that never do. */
const RELEASE_RECHECK_MS = 50;
const RELEASE_GRACE_MS = 900;
const RELEASE_DELAY_MS = 160;

export type KeyboardPhase = 'closed' | 'opening' | 'open' | 'closing';

export interface KeyboardLift {
  readonly phase: KeyboardPhase;
  /** Last painted layout-space inset in px. */
  readonly inset: number;
  /** Subscribe to each applied inset write (turnAnchor's viewport hold). */
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

function prefersReducedMotion(): boolean {
  try {
    return typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function initKeyboardLift({
  inputs,
  input,
  container,
  root = typeof document !== 'undefined' ? document.documentElement : null,
}: KeyboardLiftOptions = {}): KeyboardLift {
  if (!root) return unavailableLift();
  /* The legacy frozen-height variable is no longer part of keyboard
     avoidance; clear it when hot reload or a soft navigation reuses the
     document. */
  try { root.style.removeProperty('--app-vh'); } catch { /* detached root */ }

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
  const lift = new LiftAnimator();
  const shell = new ShellFreeze();
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
  let tickFrame = 0;
  let pollUntil = 0;
  let releaseTimer: ReturnType<typeof setTimeout> | 0 = 0;
  /* Last applied output values — the write dedup keeps each painted frame
     to three property writes only when they actually change. */
  let appliedTravel = -1;
  let appliedInset = -1;
  let appliedPan = -1;
  /* Closed-shell geometry remembered while unfrozen: orientation changes,
     URL-bar collapses and window resizes all update it, so a keyboard
     session that begins after the layout viewport already shrank can
     still freeze to the pre-keyboard height. */
  let lastKnownShellHeight = 0;
  let lastKnownVisualHeight = 0;
  /* Floor for the measured travel while a native bridge has just reported
     keyboardWillShow — covers WebViews that report no geometry change. */
  let nativeHeightHint = 0;
  /* Anticipated-lift state (see ANTICIPATE_MS above): armed on a touch
     focus edge, consumed by the first real geometry sample, and expired
     on blur or timeout so a keyboard that never arrives settles back. */
  let anticipatedTravel = 0;
  let anticipatedUntil = 0;
  let touchIntentAt = 0;
  /* Settled travel of the previous session — keyboards keep their height
     across shows, so it is the best estimate for the next lift. */
  let lastKeyboardTravel = 0;
  /* A zero travel sample is only trusted after two consecutive reads.
     Real devices occasionally report one empty frame mid-session (an IME
     animation hiccup, a blur whose keyboard has not finished reporting),
     and acting on it makes the composer dip and re-rise — the exact
     stutter this controller exists to remove. Holding the target for one
     tick costs a worst-case ~16 ms of close latency, invisible inside the
     spring's settle time. */
  let zeroStreak = 0;
  const insetListeners = new Set<(layoutInset: number) => void>();

  const setPhase = (next: KeyboardPhase) => {
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

  /* Document scroll is a pan channel, not an error: viewportOffsetTop()
     already folds window.scrollY into the projection, so the composer
     stays glued while the browser pans the page under a frozen shell.
     Resetting scrollY per frame fought the browser's own pan loop and
     produced a visible per-frame tug-of-war on resize-mode platforms.
     Any residual document scroll is cleared once, when the session has
     fully closed. */
  const settleScroll = () => {
    if (typeof window !== 'undefined' && (window.scrollY !== 0 || window.scrollX !== 0)) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
    }
    /* Clear any scroll-into-view the browser performed on the composer's
       own scroll containers — the projection compensated it per frame
       during the session; at full close the residual is restored once. */
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
     projection lets --keyboard-pan-compensation cancel it in the same frame
     instead of leaving the composer teleported by the browser's reveal. */
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

  /* While the shell is frozen at its pre-keyboard height, the browser pans
     the visual viewport down to the focused composer — scrolling in-flow
     chrome pinned to the layout top (the top bar) off the visible edge.
     Publish the pan distance so CSS can translate that chrome back. */
  const writeVisualTop = () => {
    root.style.setProperty('--keyboard-visual-top', `${Math.max(0, Math.round(viewportOffsetTop()))}px`);
  };

  /* Bottom edge of the app shell in client coordinates. Falls back to
     innerHeight when the shell is missing, hidden, or not laid out yet
     (the composer cannot be focused then anyway). */
  const appShellBottom = () => {
    if (shell.frozen && shell.baselineHeight > 0) return shell.baselineHeight;
    const el = shellElement();
    try {
      if (el && typeof el.getBoundingClientRect === 'function') {
        const bottom = el.getBoundingClientRect().bottom + (Number(window.scrollY) || 0);
        if (Number.isFinite(bottom) && bottom > 0) return bottom;
      }
    } catch { /* detached node — use the fallback */ }
    return window.innerHeight || 0;
  };

  /* The spring's target for this sample. Focus is authoritative: a stale
     visualViewport report can never hold the lift up after a real blur. */
  const measureTarget = (focused: boolean): number => {
    if (!focused) return 0;
    const viewportHeight = Number(viewport?.height);
    /* Preserve the current target while the visual viewport is in its
       transient zero/tiny state — a closing keyboard must not flash the
       composer down and back up on one bad frame. */
    if (viewport && (!Number.isFinite(viewportHeight) || viewportHeight < MIN_STABLE_VISUAL_HEIGHT)) {
      return lift.target;
    }
    const appBottom = appShellBottom();
    const measured = measureKeyboard(appBottom, viewport, window.innerHeight).travel;
    /* A few WebViews keep visualViewport.height at its pre-keyboard value
       while shrinking innerHeight. Once the shell is frozen, that inner
       height delta is a valid second signal — but only when the visual
       viewport itself has not moved, or offsetTop/pan would be counted
       twice. */
    const visualChanged = shell.frozen
      && Number.isFinite(viewportHeight)
      && shell.baselineVisualHeight > 0
      && Math.abs(viewportHeight - shell.baselineVisualHeight) > 1;
    const innerCovered = shell.frozen && !visualChanged
      ? getKeyboardInset(appBottom, Number(window.innerHeight), 0)
      : 0;
    const geometry = Math.max(measured, innerCovered);
    /* A real geometry sample always outranks the estimate — and retires
       the anticipation for the rest of the session so the measurement
       owns the target from the first report onward. */
    if (geometry > 0) {
      anticipatedUntil = 0;
      return geometry;
    }
    /* Until the platform's first usable sample lands, hold the estimated
       keyboard travel so the spring starts at the focus edge instead of
       at the report edge. The native hint is a floor for WebViews that
       report no geometry at all — the moment the platform reports real
       geometry it wins, so a bridge that reports physical pixels can never
       hold the composer above the keyboard's true leading edge. */
    const anticipated = now() < anticipatedUntil ? anticipatedTravel : 0;
    return focused ? Math.max(nativeHeightHint, anticipated) : 0;
  };

  const coarsePointer = (): boolean => {
    try {
      return typeof window.matchMedia === 'function'
        && window.matchMedia('(pointer: coarse)').matches;
    } catch {
      return false;
    }
  };

  /* Best guess at the keyboard's travel before the platform reports real
     geometry: the previous session's settled value is exact for the same
     keyboard; the VirtualKeyboard boundingRect's height field is reliable
     on Chrome Android (its y/top coordinates are buggy, height is not);
     last resort is a window fraction, coarse-pointer devices only. */
  const estimateKeyboardTravel = (): number => {
    if (lastKeyboardTravel > 40) return lastKeyboardTravel;
    const vkRect = virtualKeyboard
      && (virtualKeyboard as unknown as { boundingRect?: { height?: number } }).boundingRect;
    const vkHeight = Number(vkRect?.height);
    if (Number.isFinite(vkHeight) && vkHeight > 40) {
      return Math.min(vkHeight, Math.max(1, appShellBottom()) * 0.62);
    }
    if (!coarsePointer()) return 0;
    const inner = Number(window.innerHeight) || 0;
    return Math.min(Math.max(inner * 0.36, 160), 440);
  };

  /* Arm the estimate on a touch focus edge. Requires a recent touch on a
     tracked editable: programmatic focus (desktop tests, autofocus) and
     mouse clicks never arm it, and a cancelled focus can never lift —
     measureTarget only consults the estimate while a tracked input is
     actually focused. */
  const armAnticipation = () => {
    if (now() - touchIntentAt > TOUCH_INTENT_MS) return;
    const estimate = estimateKeyboardTravel();
    if (estimate <= 0) return;
    anticipatedTravel = estimate;
    anticipatedUntil = now() + ANTICIPATE_MS;
  };

  /* One frame of output: project the painted travel against the live pan,
     write the CSS vars, then let subscribers correct their layout in the
     same frame. */
  const write = (paintedTravel: number) => {
    const painted = Number.isFinite(paintedTravel) ? Math.max(0, paintedTravel) : 0;
    const { layoutInset, panCompensation } = projectTravel(painted, composerPanOffset());
    if (
      Math.abs(painted - appliedTravel) < 0.01
      && Math.abs(layoutInset - appliedInset) < 0.01
      && Math.abs(panCompensation - appliedPan) < 0.01
    ) return;
    /* Preserve sub-pixel progress; three decimals keeps style text small. */
    root.style.setProperty('--keyboard-inset', `${Number(layoutInset.toFixed(3))}px`);
    root.style.setProperty('--keyboard-pan-compensation', `${Number(panCompensation.toFixed(3))}px`);
    appliedTravel = painted;
    appliedInset = layoutInset;
    appliedPan = panCompensation;
    /* A pan can grow inside a single chase frame without a fresh event. */
    writeVisualTop();
    for (const cb of insetListeners) {
      try { cb(layoutInset); } catch { /* subscriber faults stay isolated */ }
    }
  };

  const armPoll = (windowMs: number) => {
    pollUntil = Math.max(pollUntil, now() + windowMs);
  };

  /* Freeze the 100dvh shell before the browser's next layout pass. This is
     the compensation baseline; --keyboard-inset then moves the in-flow
     composer toward the visual viewport one frame at a time. */
  const beginSession = () => {
    if (releaseTimer) { clearTimeout(releaseTimer); releaseTimer = 0; }
    if (shell.frozen) return;
    const el = shellElement();
    if (!el || typeof el.getBoundingClientRect !== 'function') return;
    let height = 0;
    try { height = Number(el.getBoundingClientRect().height); } catch { /* keep zero */ }
    /* If the layout viewport already shrank before this focus, the live
       rect is the post-keyboard height — freezing it would lock the
       composer at its final position with no animation range left. The
       remembered pre-keyboard height re-expands the shell instead. */
    if (lastKnownShellHeight > height + 1) height = lastKnownShellHeight;
    const baselineHeight = Math.max(height, lastKnownShellHeight);
    const liveVisualHeight = Number(viewport?.height);
    const baselineVisualHeight = lastKnownVisualHeight >= MIN_STABLE_VISUAL_HEIGHT
      ? lastKnownVisualHeight
      : (Number.isFinite(liveVisualHeight) && liveVisualHeight >= MIN_STABLE_VISUAL_HEIGHT
        ? liveVisualHeight
        : baselineHeight);
    shell.freeze(el, baselineHeight, baselineVisualHeight);
    if (!shell.frozen) return;
    /* Suppress the small CSS fallback transition on .chat-view — it exists
       for external, non-focus --keyboard-inset writes, and layering it
       over the spring's per-frame writes would lag the lift by ~340ms. */
    try { root.dataset.keyboardMotion = 'manual'; } catch { /* detached root */ }
  };

  const maybeReleaseShell = () => {
    if (!shell.frozen) return;
    /* The freeze is a focus-session construct: it pre-arms on focus so the
       browser's resize lands on a frozen shell, and it stays armed while
       the composer surface holds focus (chrome buttons inside the wrap
       count — the session is still ours). A blur plus settled viewports
       (or the grace timeout) is what ends it. */
    if (isFocused() || lift.target > 0 || appliedTravel > 0) return;
    const graceElapsed = shell.startedAt > 0 && Date.now() - shell.startedAt > RELEASE_GRACE_MS;
    const settled = shell.viewportsSettled(Number(viewport?.height), Number(window.innerHeight));
    if (!settled && !graceElapsed) {
      if (!releaseTimer) {
        releaseTimer = setTimeout(() => { releaseTimer = 0; maybeReleaseShell(); }, RELEASE_RECHECK_MS);
      }
      return;
    }
    shell.unfreeze(shellElement());
    try { delete root.dataset.keyboardMotion; } catch { /* detached root */ }
  };

  const scheduleShellRelease = () => {
    if (!shell.frozen) return;
    if (releaseTimer) clearTimeout(releaseTimer);
    releaseTimer = setTimeout(() => { releaseTimer = 0; maybeReleaseShell(); }, RELEASE_DELAY_MS);
  };

  /* ── The single rAF pipeline ─────────────────────────────────────── */

  const tick = (timestamp: number) => {
    tickFrame = 0;
    const t = Number.isFinite(timestamp) ? timestamp : now();

    if (!shell.frozen) {
      /* Keep the closed-shell baseline current while unfrozen. */
      try {
        const live = shellElement()?.getBoundingClientRect?.().height;
        if (Number.isFinite(live) && (live as number) > 0) lastKnownShellHeight = live as number;
      } catch { /* detached shell */ }
      const liveVisualHeight = Number(viewport?.height);
      if (Number.isFinite(liveVisualHeight) && liveVisualHeight >= MIN_STABLE_VISUAL_HEIGHT) {
        lastKnownVisualHeight = liveVisualHeight;
      }
    }

    const focused = isFocused();
    /* The capture must precede the first write: a written inset re-anchors
       in the same frame, and that correction needs the reader's pre-write
       intent, not a post-write snapshot. */
    if (focused) anchor.begin();

    const sampled = measureTarget(focused);
    /* Eager freeze happens on the focus-intent/focus/native edges; this is
       the in-tick fallback for a keyboard that reports geometry without any
       of those events. Freezing only when travel is real keeps an idle
       desktop focus from holding (and churning) a frozen shell. */
    if (focused && !shell.frozen && sampled > KEYBOARD_OPEN_THRESHOLD_PX) beginSession();

    /* Single-frame zero glitch filter — see zeroStreak above. */
    let measured = sampled;
    if (measured > 0) {
      zeroStreak = 0;
    } else if (lift.target > 0) {
      zeroStreak += 1;
      if (zeroStreak < 2) measured = lift.target;
    }

    /* Sub-pixel retarget deadband: a wobbling viewport sample must not flip
       the stream/discrete regime or the phase flags every frame. A real
       direction change always exceeds 0.5px, and an exact 0 (keyboard fully
       gone) is always honoured so the session can settle. */
    if (measured !== lift.target
      && (measured === 0 || Math.abs(measured - lift.target) > 0.5)) {
      lift.retarget(measured, t, prefersReducedMotion());
      /* Publish intent at the edge of the transition; the phase stays
         distinct because a close intent must not let visual chrome react
         while the inset is still travelling back to zero. */
      if (measured > KEYBOARD_OPEN_THRESHOLD_PX) {
        setIntent(true);
        setPhase('opening');
      } else if (lift.value > KEYBOARD_OPEN_THRESHOLD_PX || appliedTravel > KEYBOARD_OPEN_THRESHOLD_PX) {
        setIntent(false);
        setPhase('closing');
      } else {
        setIntent(false);
        setPhase('closed');
      }
      /* Geometry is still moving — keep the sampling window open so
         platforms that mutate the viewport without per-frame events keep
         feeding this loop. */
      armPoll(POLL_IDLE_MS);
    }

    const step = lift.step(t);
    write(step.value);

    /* The correction is written inside the same frame that publishes a
       new inset, so the painted transcript never trails the composer by
       a frame. */
    if (anchor.active && (focused || phase === 'closing')) anchor.correct();

    if (step.settled) {
      if (lift.target > KEYBOARD_OPEN_THRESHOLD_PX) {
        setIntent(true);
        setPhase('open');
      } else {
        setIntent(false);
        setPhase('closed');
        /* With the lift at zero, any document scroll the browser used to
           pan under the frozen shell is residual — clear it once so the
           restored shell lands unscrolled. */
        settleScroll();
        maybeReleaseShell();
      }
    }

    /* A held zero must not let the loop die: the confirmation sample has
       to arrive next frame, or a lone glitch would wedge the session
       open forever. */
    if (!step.settled || now() < pollUntil || (zeroStreak > 0 && lift.target > 0)) {
      tickFrame = requestAnimationFrame(tick);
    }
  };

  const wake = () => {
    if (tickFrame || typeof requestAnimationFrame !== 'function') return;
    tickFrame = requestAnimationFrame(tick);
  };

  /* ── Event handlers ──────────────────────────────────────────────── */

  /* Arm the shell before the browser performs the default focus action.
     On resize-content platforms the layout viewport can shrink between
     pointerdown and focusin; waiting for focusin would leave the in-flow
     composer at its post-keyboard position before the lift owns the first
     frame. */
  const onFocusIntent = (event: Event) => {
    if (!isEditableWithin(event?.target, trackedInputs)) return;
    const pointerType = (event as PointerEvent).pointerType;
    if (event.type === 'touchstart' || pointerType === 'touch') {
      touchIntentAt = now();
      /* Arming at the intent edge (not just focusin) starts the motion
         one event earlier — the pointerdown→focus gap is already inside
         the IME window on fast devices. */
      armAnticipation();
    }
    beginSession();
    armPoll(POLL_EDGE_MS);
    wake();
    /* A cancelled pointer/touch gesture may never produce focusin. Do not
       leave the shell frozen in that case; the release gate sees the
       focused editor and ignores the timer when focus did land. */
    scheduleShellRelease();
  };

  const onFocusIn = () => {
    armAnticipation();
    beginSession();
    armPoll(POLL_EDGE_MS);
    wake();
  };

  const onFocusOut = () => {
    anticipatedUntil = 0;
    touchIntentAt = 0;
    armPoll(POLL_EDGE_MS);
    wake();
    scheduleShellRelease();
  };

  const onViewportGeometry = () => {
    /* visualViewport can pan before the next rAF. Re-project the already-
       painted travel immediately so the native pan is cancelled in the
       same event; waiting for the tick makes the composer visibly jump
       for one frame on iOS. */
    if (shell.frozen || isFocused()) write(lift.value);
    else writeVisualTop();
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
     scroll the page to reveal the focused composer). Re-project instead
     of resetting it — the projection absorbs the delta exactly. */
  window.addEventListener('scroll', onViewportGeometry, { passive: true });
  /* Chromium's VirtualKeyboard API reports the IME animation even while
     the layout viewport already resizes. overlaysContent stays off —
     enabling it would switch Chrome to overlay mode and leave every
     untracked input uncovered — so only the event timing is used. */
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
  document.addEventListener('pointerdown', onFocusIntent, { capture: true, passive: true });
  document.addEventListener('touchstart', onFocusIntent, { capture: true, passive: true });
  /* Returning from the background (tab switch, native app pause) can
     swallow the close-resize entirely; re-measure on visibility flips.
     The Capacitor bridge mirrors appStateChange into this same event. */
  const onVisibility = () => { armPoll(POLL_EXTERNAL_MS); wake(); };
  document.addEventListener('visibilitychange', onVisibility);

  /* Initial write: publish 0px vars and the closed phase so consumers
     never read a missing variable. */
  tick(now());

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
      if (kind === 'show') beginSession();
      else scheduleShellRelease();
      armPoll(POLL_EDGE_MS);
      wake();
    },
    destroy() {
      if (tickFrame) cancelAnimationFrame(tickFrame);
      tickFrame = 0;
      pollUntil = 0;
      if (releaseTimer) { clearTimeout(releaseTimer); releaseTimer = 0; }
      lift.reset();
      anchor.end();
      shell.unfreeze(shellElement());
      insetListeners.clear();
      appliedTravel = -1;
      appliedInset = -1;
      appliedPan = -1;
      try {
        root.style.removeProperty('--keyboard-inset');
        root.style.removeProperty('--keyboard-pan-compensation');
        root.style.removeProperty('--keyboard-visual-top');
      } catch { /* detached root */ }
      try { delete root.dataset.keyboardOpen; } catch { /* detached root */ }
      try { delete root.dataset.keyboardPhase; } catch { /* detached root */ }
      try { delete root.dataset.keyboardMotion; } catch { /* detached root */ }
      if (viewport && typeof viewport.removeEventListener === 'function') {
        viewport.removeEventListener('resize', onViewportGeometry);
        viewport.removeEventListener('scroll', onViewportGeometry);
      }
      window.removeEventListener('resize', onViewportGeometry);
      window.removeEventListener('scroll', onViewportGeometry);
      if (virtualKeyboard && typeof virtualKeyboard.removeEventListener === 'function') {
        virtualKeyboard.removeEventListener('geometrychange', wake);
      }
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('pointerdown', onFocusIntent, { capture: true });
      document.removeEventListener('touchstart', onFocusIntent, { capture: true });
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
