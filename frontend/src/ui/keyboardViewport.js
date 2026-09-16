import { smoothScrollToBottom } from './scroll.js';
import { decideKeyboardAnchorAction, KEYBOARD_PIN_SLACK } from './scrollDecision.ts';
import { getLastScrollIntentAt } from './scrollPill.js';
import { smoothDampStep } from './motion.js';

/*
 * Keep chat controls above mobile virtual keyboards.
 *
 * Browsers disagree on how the viewports react when a keyboard opens:
 *   - "resizes-visual" (iOS Safari, Chrome/Edge Android 108+): the layout
 *     viewport keeps its height; only window.visualViewport shrinks, and
 *     the browser may pan it (reported via offsetTop).
 *   - "resizes-content" (Firefox Android, Chrome Android <108, Capacitor
 *     WebView with Keyboard.resize:"native"): the layout viewport itself
 *     shrinks, so CSS `height:100dvh` on the app shell already avoids the
 *     keyboard with no JS help at all.
 *
 * Reading `innerHeight - visualViewport.height` under-measures in the
 * first mode on some builds, and any "max innerHeight ever seen" baseline
 * over-measures (double avoidance) whenever the layout viewport
 * legitimately shrinks — resize-mode keyboards, orientation changes,
 * desktop window resizes, a collapsing URL bar.
 *
 * The robust reference is the app shell's own rendered bottom edge in
 * client (layout-viewport) coordinates. The keyboard's top edge is the
 * visual viewport's bottom edge (offsetTop + height) in those same
 * coordinates, so
 *
 *     inset = appBottom − (visualViewport.offsetTop + visualViewport.height)
 *
 * is exactly how many CSS pixels of the app the keyboard covers:
 *   - overlay mode:  appBottom stays put             → inset = keyboard height
 *   - resize mode:   appBottom already moved up      → inset ≈ 0 (CSS did it)
 *   - stuck 100vh:   appBottom stuck at full height  → inset = keyboard height
 *
 * This module writes one CSS custom property (--keyboard-inset) plus
 * keyboard intent/phase flags. The composer's geometry never morphs with the
 * keyboard — chat-surface.css owns its shape, and this module only
 * publishes how much of the app the keyboard covers.
 * Browsers differ in how they report the keyboard's travel: some emit
 * many progressive samples, others a single discrete jump once the
 * keyboard is up, and some mutate the geometry without dispatching
 * per-frame events at all. So the measured inset is only ever a
 * *target*: a rAF loop chases it with a critically-damped spring
 * (smoothDampStep, ui/motion.js) whose ~100ms convergence lands a ~300px
 * keyboard inside the platform's own ~220-240ms IME window. Position
 * and velocity are continuous under every retarget — per-frame streams,
 * skipped samples, and mid-flight reversals all share one motion law,
 * so the composer never teleports and never restarts a tween mid-air.
 * While samples keep arriving, the measured stream velocity feeds a
 * lead of up to one smooth-time ahead of the target, so the composer
 * rides the keyboard's top edge instead of trailing it; the lead decays
 * the moment the stream goes stale and can never aim past the
 * remaining gap.
 *
 * The same controller anchors the transcript across the lift: a reader
 * following the bottom stays on the newest content, while a reader
 * inspecting history keeps their exact offset (visualViewport-driven
 * compensation, never a forced scroll to the bottom). The correction is
 * written inside the same frame that publishes a new inset — or inside
 * the resize/pan event itself — so the painted transcript never trails
 * the composer by a frame.
 */

/* Android/iOS WebViews can expose a 0–1px visual viewport for a transient
 * frame while the IME is opening or closing. It is not a usable geometry
 * sample; treating it as the keyboard top would lift the composer almost the
 * full height of the app. */
export const MIN_STABLE_VISUAL_VIEWPORT_HEIGHT = 96;

/* Chase dynamics for the keyboard lift. Two regimes share one spring:

 *   - stream: while progressive geometry samples keep arriving, the
 *     measured travel IS the keyboard's live leading edge. The chase must
 *     track it within a couple of frames (~45ms smooth time ≈ half the
 *     remaining gap per 60Hz frame), or the composer spends the whole
 *     lift below the keyboard's top edge — invisible until the very end,
 *     which reads as "teleported straight to the target". A hot spring
 *     still interpolates between coarse samples (no per-sample snap),
 *     and the arrival envelope below keeps it from overshooting past the
 *     real edge, so the composer can never float above the keyboard.
 *   - discrete: a lone jump report (first sample after silence, a
 *     direction flip, or a platform that emits only the final geometry)
 *     gets the looser ~100ms arc, which lands a ~300px keyboard inside
 *     the platform's own ~220-300ms IME window as a visible ease.

 * Velocity is a state variable, so a retarget mid-flight bends the
 * motion instead of restarting it — the continuity the previous eased
 * tween could not provide when coarse samples kept arriving. */
export const KEYBOARD_CHASE_SMOOTH_S = 0.24;
export const KEYBOARD_CHASE_STREAM_S = 0.16;

/* Do not let the spring consume the whole remaining gap in one frame.
 * Feed-forward keeps the composer close to a moving keyboard, but it can
 * otherwise reach the final target with visible velocity and be clamped to
 * a dead stop. This exponential arrival envelope preserves that tracking
 * through the middle of the lift, then guarantees a short, continuous
 * deceleration over the final few frames. */
export const KEYBOARD_ARRIVAL_S = 0.06;

/* During a live progressive stream the chase runs tightly and smoothly,
 * matching the keyboard's rising speed in lockstep without falling behind. */
export const KEYBOARD_ARRIVAL_STREAM_S = 0.06;

/* Minimum frames before settle is allowed to fire.
 * ~16 frames ensures smooth interpolation on both 60Hz and 120Hz displays. */
export const MIN_MOTION_FRAMES = 16;

/* A focused visual viewport can differ from the shell by a fractional pixel
 * because of device-pixel rounding. Treat the keyboard as open on the first
 * meaningful painted frame, rather than waiting until 50px into the lift
 * and changing the composer's internal layout halfway through the motion. */
export const KEYBOARD_OPEN_THRESHOLD_PX = 2;

/* The feed-forward lead uses the measured stream velocity to aim slightly
 * ahead of the target, cancelling the spring's natural lag while the
 * keyboard is still moving. When samples stop arriving the estimate is stale. */
export const KEYBOARD_STREAM_STALE_MS = 64;
export const KEYBOARD_STREAM_DECAY_S = 0.06;
export const KEYBOARD_STREAM_MAX_VELOCITY = 1500;

/* Transition-window geometry poll: some platforms mutate visualViewport
 * geometry every frame without dispatching per-frame resize/scroll
 * events. A rAF sampler opens for ~900ms around each focus edge and is
 * extended while the measured inset keeps moving, so those platforms get
 * tracked frame by frame instead of by one late discrete jump. */
export const KEYBOARD_POLL_EDGE_MS = 900;
export const KEYBOARD_POLL_IDLE_MS = 240;

/* Viewport implementations that expose the IME animation emit resize/scroll
 * samples roughly once per frame. A sample that arrives inside this window
 * in the same direction as the previous one is stream evidence — only
 * stream samples feed the chase's velocity estimate, so a lone jump starts
 * the spring from rest instead of inheriting a phantom lead. */
export const KEYBOARD_PROGRESSIVE_SAMPLE_MS = 120;

export function isProgressiveKeyboardSample(
  lastSampleAt,
  sampleAt,
  previousDirection,
  nextDirection,
) {
  if (!Number.isFinite(lastSampleAt) || !Number.isFinite(sampleAt) || lastSampleAt <= 0) return false;
  const gap = sampleAt - lastSampleAt;
  return gap >= 0
    && gap <= KEYBOARD_PROGRESSIVE_SAMPLE_MS
    && nextDirection !== 0
    && nextDirection === previousDirection;
}

export function getKeyboardInset(layoutHeight, visualHeight, visualOffsetTop = 0) {
  if (
    !Number.isFinite(layoutHeight) ||
    !Number.isFinite(visualHeight) ||
    layoutHeight <= 0 ||
    visualHeight <= 0
  ) {
    return 0;
  }

  /* offsetTop is a client-coordinate distance. Negative values can appear
   * during an overscroll/pan frame, but clamping them prevents counting the
   * same covered pixels twice and producing an over-large lift. */
  const offsetTop = Number.isFinite(visualOffsetTop) ? Math.max(0, visualOffsetTop) : 0;
  const visualBottom = Math.max(0, visualHeight + offsetTop);
  const covered = layoutHeight - visualBottom;
  return Math.min(layoutHeight, Math.max(0, covered));
}

export function limitKeyboardInsetArrival(current, proposed, target, dt, arrivalS = KEYBOARD_ARRIVAL_S) {
  if (
    !Number.isFinite(current)
    || !Number.isFinite(proposed)
    || !Number.isFinite(target)
    || !(dt > 0)
  ) return Number.isFinite(target) ? target : (Number.isFinite(current) ? current : 0);
  const gap = target - current;
  const step = proposed - current;
  if (gap === 0 || step === 0 || Math.sign(step) !== Math.sign(gap)) return proposed;
  const maxFraction = 1 - Math.exp(-dt / arrivalS);
  if (Math.abs(step) <= Math.abs(gap) * maxFraction) return proposed;
  return current + gap * maxFraction;
}

/* Pure measurement step, split out for unit tests. `appBottom` is the app
 * shell's getBoundingClientRect().bottom (client coordinates); `viewport`
 * is window.visualViewport or null; `innerHeight` is the fallback for
 * legacy WebViews without the VisualViewport API — resize-mode keyboards
 * still shrink innerHeight there, so the "stuck 100vh" case keeps
 * working, while overlay keyboards stay invisible (inset 0), matching
 * the previous degraded behaviour. */
export function measureKeyboardInset(appBottom, viewport, innerHeight) {
  const viewportHeight = Number(viewport?.height);
  if (viewport && Number.isFinite(viewportHeight)) {
    if (viewportHeight <= 0 || viewportHeight < MIN_STABLE_VISUAL_VIEWPORT_HEIGHT) return 0;
    const scale = Number(viewport.scale);
    // A zoomed visual viewport is not an IME occlusion measurement.
    if (Number.isFinite(scale) && Math.abs(scale - 1) > 0.05) return 0;
    return getKeyboardInset(appBottom, viewportHeight, Number(viewport.offsetTop) || 0);
  }
  return getKeyboardInset(appBottom, Number(innerHeight) || 0, 0);
}

/* Motion must be integrated in visual-screen coordinates, not in layout
 * coordinates. On iOS the browser is free to pan the visual viewport while
 * the IME opens. `offsetTop` can arrive as one late jump (and can wobble by a
 * few pixels), even when `height` changes progressively. If the spring chases
 * the layout inset directly, that pan is visible immediately and the spring
 * then chases the opposite correction: the composer appears to teleport and
 * jitter.
 *
 * The total screen-space keyboard travel is independent of that pan:
 *
 *     travel = appBottom - visualViewport.height
 *
 * Each painted frame converts the interpolated travel back to the required
 * layout inset by subtracting the *current* offsetTop. Browser pan + layout
 * inset therefore always equals the continuous spring value. */
export function measureKeyboardTravel(appBottom, viewport, innerHeight) {
  const viewportHeight = Number(viewport?.height);
  if (viewport && Number.isFinite(viewportHeight)) {
    if (viewportHeight <= 0 || viewportHeight < MIN_STABLE_VISUAL_VIEWPORT_HEIGHT) return 0;
    const scale = Number(viewport.scale);
    if (Number.isFinite(scale) && Math.abs(scale - 1) > 0.05) return 0;
    return getKeyboardInset(appBottom, viewportHeight, 0);
  }
  return getKeyboardInset(appBottom, Number(innerHeight) || 0, 0);
}

/* The tracked node is usually the React composer mount point, while the
 * actual focus lives on a nested contenteditable element. Checking only
 * `root.matches(':focus')` misses that relationship and makes the virtual
 * keyboard look closed even while the editor is active. Keep this helper
 * pure enough for unit tests and accept both direct and descendant focus. */
export function isTrackedInputFocused(trackedInputs, activeElement) {
  const active = activeElement ?? (
    typeof document !== 'undefined' ? document.activeElement : null
  );
  const inputs = Array.isArray(trackedInputs) ? trackedInputs : [];
  for (let i = 0; i < inputs.length; i += 1) {
    const el = inputs[i];
    if (!el) continue;
    if (active === el) return true;
    try {
      if (active && typeof el.contains === 'function' && el.contains(active)) return true;
      if (typeof el.matches === 'function' && el.matches(':focus-within')) return true;
    } catch (_) { /* detached/custom elements can throw */ }
  }
  return false;
}

export function initKeyboardViewport({ inputs, input, container, root = document.documentElement } = {}) {
  if (!root) return () => undefined;
  /* Clear the legacy frozen-height value when hot reload or a soft navigation
     reuses the document. It is no longer part of keyboard avoidance. */
  try { root.style.removeProperty('--app-vh'); } catch (_) { /* detached root */ }
  /* Pre-arm the manual-motion flag so the .34s CSS transition on .chat-view
     is dead from the very first frame — including the window before focusin
     fires, when a stray visualViewport.resize can already write
     --keyboard-inset once. Without this the first write could be carried
     by the CSS transition (which lands in one timeline) and then cut off
     mid-flight by the JS spring, reading as a snap. beginKeyboardSession
     still owns the same attribute, so this is just a fast-path. */
  try { root.dataset.keyboardMotion = 'manual'; } catch (_) { /* detached root */ }

  /* P_multi-input — `input` (single element) is the legacy shape; pass
   * `inputs` (single element, array of elements, or CSS selector) to
   * track more than one composer — e.g. the chat composer AND the
   * topic-setup composer. Without this, focus on a non-primary input
   * leaves data-keyboard-open stuck false and any layout keyed off
   * that attribute (e.g. .topic-input-wrap margin-top) never applies. */
  const trackedInputs = (() => {
    const source = inputs ?? input;
    if (!source) return [];
    if (typeof source === 'string') return Array.from(document.querySelectorAll(source));
    if (Array.isArray(source)) return source.filter(Boolean);
    return [source];
  })();

  const viewport = window.visualViewport;
  let updateFrame = 0;
  let anchorFrame = 0;
  let anchorRefreshTimer = 0;
  let motionFrame = 0;
  /* Frames spent in the current chase — the settle test below uses this to
     guarantee at least MIN_MOTION_FRAMES of interpolation before we are
     allowed to declare the target reached. Without it the spring can land
     at the target on frame 1 (the chase lead can eat the whole gap) and
     the loop ends before any visible motion — the snap the user reports. */
  let motionFrameCount = 0;
  let blurRecheckTimer = 0;
  /* -1 forces the first write to apply, so --keyboard-inset and
     data-keyboard-open are initialised even when the inset starts at 0. */
  let appliedInset = -1;
  let appliedTravel = -1;
  let appliedPanCompensation = -1;
  /* Chase state: the measured screen-space travel is only a target. The
     value is integrated by a critically-damped spring each frame and then
     projected to the layout inset CSS consumes
     (smoothDampStep), so it is continuous in position and velocity under
     every retarget. `paintedTravel` is the spring's float position —
     integrating the rounded `appliedInset` instead would trap the spring
     in a quantization well ~1px short of the target and never settle.
     Keeping that float also lets CSS receive sub-pixel progress instead of
     repeating integer positions near the ends of the curve.
     `chaseVelocity` is the spring's own velocity; `streamVelocity` is
     the low-passed measured keyboard speed used for the feed-forward
     lead. */
  let targetTravel = 0;
  let paintedTravel = 0;
  let chaseVelocity = 0;
  let streamVelocity = 0;
  /* True when the latest target-changing sample continued a same-direction
     stream — i.e. the platform is reporting the keyboard's leading edge
     frame-by-frame. Drives the stream/discrete smooth-time switch in
     stepMotion. Cleared by staleness in stepMotion and by any
     non-progressive sample. */
  let lastSampleProgressive = false;
  let lastMotionAt = 0;
  let lastTargetAt = 0;
  let chaseStartedAt = 0;
  let transitionDirection = 0;
  let geometryPollFrame = 0;
  let geometryPollUntil = 0;
  /* Reader position captured for the duration of a keyboard transition.
     The captured intent (bottom-follow vs history) is authoritative for
     the whole motion; per-frame geometry is not re-interpreted, so the
     first shrunk frame cannot strand a pinned reader or drag a history
     reader to the bottom. */
  let transcriptAnchor = null;
  /* Freeze the 100dvh shell for the keyboard session. Some browsers resize
     the layout viewport before dispatching their first geometry event; if we
     let that native resize through, the composer reaches its final position
     before the JS animation has a chance to run. The original inline height
     is restored only after the inset is back at zero and the viewport has
     settled. */
  let keyboardShellFrozen = false;
  let keyboardShellBaselineInnerHeight = 0;
  let keyboardShellBaselineVisualHeight = 0;
  let keyboardShellRestoreStyle = null;
  let keyboardShellReleaseTimer = 0;
  let keyboardSessionStartedAt = 0;
  let keyboardPhase = 'closed';
  /* Last shell height observed while the keyboard was fully closed. Some
     platforms shrink the layout viewport before dispatching focusin, so
     measuring at focus time would freeze the shell at the already-shrunken
     height: the measured travel would stay ~0, the native resize would
     silently own the whole lift, and the composer would appear to teleport
     to its final position. Freezing to max(live, last known) re-expands the
     shell in that case, restoring the full animation range. */
  let lastKnownShellHeight = 0;
  let lastKnownVisualHeight = 0;

  const setKeyboardPhase = (nextPhase) => {
    keyboardPhase = nextPhase;
    try {
      root.dataset.keyboardPhase = nextPhase;
    } catch (_) { /* detached root */ }
  };

  const setKeyboardIntent = (open) => {
    try {
      root.dataset.keyboardOpen = open ? 'true' : 'false';
    } catch (_) { /* detached root */ }
  };

  setKeyboardPhase('closed');
  setKeyboardIntent(false);

  const prefersReducedMotion = () => {
    try {
      return typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_) { return false; }
  };

  const stableMeasuredTravel = (focused) => {
    if (!focused) return 0;
    const viewportHeight = Number(viewport?.height);
    /* Preserve the last stable value while the visual viewport is in its
     * transient zero/tiny state. This keeps a closing keyboard from flashing
     * the composer down and back up, while an opening keyboard starts at 0
     * and adopts the first real sample on the next frame. */
    if (viewport && (!Number.isFinite(viewportHeight) || viewportHeight < MIN_STABLE_VISUAL_VIEWPORT_HEIGHT)) {
      return appliedTravel > 0 ? appliedTravel : 0;
    }
    const appBottom = appShellBottom();
    const measured = measureKeyboardTravel(appBottom, viewport, window.innerHeight);
    /* A few WebViews keep visualViewport.height at its pre-keyboard value
       while shrinking innerHeight. Once the shell is frozen, that inner
       height delta is a valid second signal. Only use it when the visual
       viewport itself has not moved; otherwise offsetTop/pan would be
       counted twice. */
    if (keyboardShellFrozen) {
      const visualChanged = Number.isFinite(viewportHeight)
        && keyboardShellBaselineVisualHeight > 0
        && Math.abs(viewportHeight - keyboardShellBaselineVisualHeight) > 1;
      if (!visualChanged) {
        return Math.max(measured, getKeyboardInset(appBottom, Number(window.innerHeight), 0));
      }
    }
    return measured;
  };

  /* ── Transcript scroll anchoring ────────────────────────────────────
   * The keyboard session is the anchoring lifetime: an anchor is captured
   * when the composer takes focus (before any keyboard geometry lands),
   * re-applied on every visualViewport resize/pan and after each layout
   * commit, and refreshed once the geometry is calm:
   *
   *   - bottom-follow: the latest answer is kept flush above the composer
   *     (snap, not a second animation that would amplify the lift);
   *   - history: the reader's content stays at the same visual position —
   *     a visualViewport pan is compensated in scrollTop and the captured
   *     offset is clamped to the new range, never forced to the bottom.
   *
   * Any wheel/touch/key gesture after the capture abandons the anchor —
   * a live gesture always wins — and the anchor is re-captured once the
   * gesture settles so the next keyboard change still compensates. */

  const ANCHOR_REFRESH_MS = 280;

  const transcriptList = () => {
    try {
      return typeof document !== 'undefined' ? document.getElementById('msgList') : null;
    } catch (_) { return null; }
  };

  const viewportOffsetTop = () => {
    const value = viewport ? Number(viewport.offsetTop) : 0;
    return Number.isFinite(value) ? value : 0;
  };

  /* While the shell is frozen at its pre-keyboard height, the browser pans
     the visual viewport down to the focused composer — scrolling in-flow
     chrome pinned to the layout top (the top bar) off the visible edge.
     Publish the pan distance (plus page scroll, for builds where the
     document can still move) so CSS can translate that chrome back onto
     the visible top edge without a layout change. */
  const writeVisualTop = () => {
    const top = viewportOffsetTop() + (Number(window.scrollY) || 0);
    root.style.setProperty('--keyboard-visual-top', `${Math.max(0, Math.round(top))}px`);
  };

  const captureTranscriptAnchor = () => {
    const list = transcriptList();
    if (!list || typeof list.getBoundingClientRect !== 'function') return null;
    const scrolledAway = Boolean(window.stateStore.read('_userScrolledAway'));
    const distance = list.scrollHeight - list.scrollTop - list.clientHeight;
    return {
      list,
      scrollTop: Number(list.scrollTop) || 0,
      offsetTop: viewportOffsetTop(),
      pinned: !scrolledAway && distance <= KEYBOARD_PIN_SLACK,
      intentAt: getLastScrollIntentAt(),
    };
  };

  const dropTranscriptAnchor = () => {
    if (anchorFrame) { cancelAnimationFrame(anchorFrame); anchorFrame = 0; }
    transcriptAnchor = null;
  };

  const clearTranscriptAnchor = () => {
    if (anchorRefreshTimer) { clearTimeout(anchorRefreshTimer); anchorRefreshTimer = 0; }
    dropTranscriptAnchor();
  };

  /* Re-capture from the settled geometry so later keyboard changes
     compensate from the reader's latest position instead of a stale one.
     Once the composer has lost focus and the close motion has settled,
     the anchor is no longer needed. */
  const scheduleAnchorRefresh = () => {
    if (anchorRefreshTimer) clearTimeout(anchorRefreshTimer);
    anchorRefreshTimer = setTimeout(() => {
      anchorRefreshTimer = 0;
      if (motionFrame) { scheduleAnchorRefresh(); return; }
      if (isInputFocused()) {
        transcriptAnchor = captureTranscriptAnchor();
        return;
      }
      clearTranscriptAnchor();
    }, ANCHOR_REFRESH_MS);
  };

  const beginTranscriptAnchor = () => {
    if (transcriptAnchor) return;
    transcriptAnchor = captureTranscriptAnchor();
    scheduleAnchorRefresh();
  };

  const restoreTranscriptAnchor = () => {
    anchorFrame = 0;
    const anchor = transcriptAnchor;
    if (!anchor || !anchor.list || anchor.list.isConnected === false) return;
    const list = anchor.list;
    /* A fresh send owns the transcript offset while its anchor holds the
       submitted prompt at the top (chat/turnAnchor.ts): that controller
       re-aligns on every layout change, and snapping to the bottom here
       would slide the prompt down by the whole viewport delta. Keep the
       captured snapshot current instead, so the first unheld geometry
       change compensates from the reader's real position. */
    const viewportOwnerHeld = Boolean(list.dataset && list.dataset.turnAnchorHold === 'true');
    const action = decideKeyboardAnchorAction(
      { scrollTop: anchor.scrollTop, pinned: anchor.pinned },
      {
        maxScrollTop: list.scrollHeight - list.clientHeight,
        scrolledAway: Boolean(window.stateStore.read('_userScrolledAway')),
        userIntentAfterCapture: getLastScrollIntentAt() > anchor.intentAt,
        panDelta: viewportOffsetTop() - anchor.offsetTop,
        viewportOwnerHeld,
      },
    );
    if (action.type === 'none') {
      if (viewportOwnerHeld && list.isConnected !== false) {
        transcriptAnchor = captureTranscriptAnchor();
        return;
      }
      /* A live gesture owns the scroll: drop the stale anchor but watch
         for calm so the next keyboard change re-anchors from the new
         reader position. */
      dropTranscriptAnchor();
      scheduleAnchorRefresh();
      return;
    }
    if (action.type === 'follow-bottom') {
      smoothScrollToBottom(list, { smooth: false });
      return;
    }
    if (Math.abs(action.top - list.scrollTop) > 0.5) {
      list.scrollTop = action.top;
    }
  };

  const scheduleTranscriptRestore = () => {
    if (anchorFrame || typeof window.requestAnimationFrame !== 'function') return;
    anchorFrame = window.requestAnimationFrame(restoreTranscriptAnchor);
  };

  const restoreTranscriptAnchorNow = () => {
    /* A deferred restore leaves one painted frame where flex has already
       shortened the transcript but scrollTop still describes the old
       viewport. During a keyboard transition that one frame is visible as
       a gap/jump. Cancel the fallback rAF and let the keyboard controller
       be the single synchronous scroll owner for this frame. */
    if (anchorFrame) {
      cancelAnimationFrame(anchorFrame);
      anchorFrame = 0;
    }
    restoreTranscriptAnchor();
  };

  /* One frame of the lift: write the current interpolated inset, then
     re-anchor in this same frame. Raising the in-flow composer shrinks
     the transcript's flex viewport; reading the list's metrics right
     after the write forces that layout synchronously, so the scroll
     correction paints together with the new padding instead of trailing
     the composer by one frame. The ResizeObserver path in scroll.js and
     the scheduled restore stay as fallbacks — both decisions are
     idempotent. */
  const writeInsetFrame = (travel) => {
    const paintedValue = Number.isFinite(travel) ? Math.max(0, travel) : 0;
    /* Convert the continuous screen-space travel to layout compensation.
       Filter sub-pixel pan wobble with a smooth deadband to prevent 60Hz visual jitter. */
    const rawOffset = viewportOffsetTop();
    let effectiveOffset = 0;
    if (Math.abs(rawOffset) >= 1.5) {
      effectiveOffset = rawOffset > 0 ? rawOffset - 1.5 : rawOffset + 1.5;
    }
    let layoutInset = Math.max(0, paintedValue - effectiveOffset);
    let panCompensation = Math.max(0, effectiveOffset - paintedValue);

    /* Monotonicity guarantee: while the keyboard is rising (targetTravel > appliedTravel),
       layoutInset must never regress backwards because of temporary viewportOffsetTop spikes.
       Similarly, panCompensation should only monotonically decrease to prevent vertical jitter.
       This completely eliminates elastic bouncing, rubber-banding, and jitter. */
    if (targetTravel > appliedTravel && appliedInset >= 0) {
      layoutInset = Math.max(appliedInset, layoutInset);
      if (appliedPanCompensation >= 0) {
        panCompensation = Math.min(appliedPanCompensation, panCompensation);
      }
    } else if (targetTravel < appliedTravel && appliedInset >= 0) {
      layoutInset = Math.min(appliedInset, layoutInset);
      if (appliedPanCompensation >= 0) {
        panCompensation = Math.max(appliedPanCompensation, panCompensation);
      }
    }

    if (
      Math.abs(paintedValue - appliedTravel) < 0.01
      && Math.abs(layoutInset - appliedInset) < 0.01
      && Math.abs(panCompensation - appliedPanCompensation) < 0.01
    ) return;
    /* Preserve sub-pixel progress. Integer writes repeat values near both
       ends of the spring and make a smooth curve look like a staircase on
       high-DPR phones. Three decimals is stable without growing style text. */
    const cssInset = Number(layoutInset.toFixed(3));
    const cssPanCompensation = Number(panCompensation.toFixed(3));
    root.style.setProperty('--keyboard-inset', `${cssInset}px`);
    root.style.setProperty('--keyboard-pan-compensation', `${cssPanCompensation}px`);
    const insetDelta = Math.abs(layoutInset - appliedInset);
    appliedInset = layoutInset;
    appliedTravel = paintedValue;
    appliedPanCompensation = panCompensation;
    /* A pan can grow inside a single chase frame without a fresh event —
       keep the top-chrome offset current on the same frame cadence. */
    writeVisualTop();
    /* The keyboard transition owns this scroll correction. Avoid forced
       synchronous layout (layout thrashing) on fractional sub-pixel deltas:
       only force layout synchronously when delta >= 1.5px or settling, and
       schedule a deferred restore otherwise. */
    if (transcriptAnchor && (isInputFocused() || keyboardPhase === 'closing')) {
      if (insetDelta >= 1.5 || Math.abs(paintedValue - targetTravel) < 0.5) {
        restoreTranscriptAnchorNow();
      } else {
        scheduleTranscriptRestore();
      }
    }
  };

  const stepMotion = (now) => {
    motionFrame = 0;
    motionFrameCount += 1;
    const dt = lastMotionAt > 0
      ? Math.min(0.064, Math.max(0.001, (now - lastMotionAt) / 1000))
      : 1 / 60;
    lastMotionAt = now;
    const painted = paintedTravel;
    /* Once samples stop arriving mid-travel the measured velocity is
       stale: decay it so the chase lead unwinds instead of holding the
       composer on a target that has already settled. */
    if (lastTargetAt > 0 && now - lastTargetAt > KEYBOARD_STREAM_STALE_MS) {
      streamVelocity *= Math.exp(-dt / KEYBOARD_STREAM_DECAY_S);
      if (
        now - lastTargetAt > KEYBOARD_PROGRESSIVE_SAMPLE_MS
        || Math.abs(streamVelocity) < 1
      ) streamVelocity = 0;
    }
    /* Stream tracking: while progressive samples keep arriving the target
       is the keyboard's live leading edge — chase it smoothly and responsively
       so the composer moves in lockstep with the IME without lagging behind. */
    const streamAlive = lastSampleProgressive
      && lastTargetAt > 0
      && now - lastTargetAt <= KEYBOARD_PROGRESSIVE_SAMPLE_MS;
    const smoothTime = streamAlive ? KEYBOARD_CHASE_STREAM_S : KEYBOARD_CHASE_SMOOTH_S;
    /* Direct critically damped step to targetTravel.
       Removing the dynamic lead eliminates target oscillations and elastic bounce. */
    const next = smoothDampStep(
      painted,
      targetTravel,
      chaseVelocity,
      smoothTime,
      dt,
    );
    chaseVelocity = next.velocity;
    /* Arrival envelope prevents abrupt stops near target. */
    let landed = limitKeyboardInsetArrival(
      painted,
      next.value,
      targetTravel,
      dt,
      streamAlive ? KEYBOARD_ARRIVAL_STREAM_S : KEYBOARD_ARRIVAL_S,
    );
    if (landed === targetTravel) {
      chaseVelocity = 0;
    }
    paintedTravel = landed;
    writeInsetFrame(landed);
    const reachedTarget = landed === targetTravel
      || (Math.abs(targetTravel - landed) < 0.5 && Math.abs(chaseVelocity) < 15);
    const settled = reachedTarget && motionFrameCount >= MIN_MOTION_FRAMES;
    if (settled) {
      paintedTravel = targetTravel;
      writeInsetFrame(targetTravel);
      if (targetTravel > KEYBOARD_OPEN_THRESHOLD_PX) {
        setKeyboardIntent(true);
        setKeyboardPhase('open');
      } else {
        setKeyboardIntent(false);
        setKeyboardPhase('closed');
      }
      chaseVelocity = 0;
      streamVelocity = 0;
      motionFrameCount = 0;
      chaseStartedAt = 0;
      maybeReleaseKeyboardShell();
      return;
    }
    motionFrame = requestAnimationFrame(stepMotion);
  };

  /* The visible keyboard lift is owned by this rAF loop. CSS only consumes
     the already-interpolated value; it must not run a second transition on
     top of these writes or the composer will lag behind the keyboard. */
  const applyTravel = (travel) => {
    const nextTarget = Number.isFinite(travel) ? Math.max(0, travel) : 0;
    /* Publish intent at the edge of the transition, but keep all geometry
       on the spring's rAF timeline. The phase is separate because a close
       intent must not let scroll.js or visual-only chrome react while the
       inset is still travelling back to zero. */
    /* A repeated application of the current target must not disturb the
       chase — the rAF loop is already converging on it (or has arrived). */
    if (
      nextTarget === targetTravel
      && (motionFrame !== 0 || appliedTravel === nextTarget)
    ) {
      /* offsetTop may have changed without a height change. Re-project the
         current spring position so that native pan never becomes a visible
         jump. */
      writeInsetFrame(paintedTravel);
      return;
    }

    const now = (typeof performance !== 'undefined' && performance.now)
      ? performance.now()
      : Date.now();
    const streamDirection = Math.sign(nextTarget - targetTravel);

    if (nextTarget !== targetTravel) {
      if (nextTarget > KEYBOARD_OPEN_THRESHOLD_PX) {
        setKeyboardIntent(true);
        /* A new sample means the keyboard is still moving. Do not promote
           the phase to `open` just because an earlier frame crossed 2px;
           progressive samples can continue arriving for the whole IME
           animation and scroll.js must stay out of that timeline. */
        setKeyboardPhase('opening');
      } else if (paintedTravel > KEYBOARD_OPEN_THRESHOLD_PX || targetTravel > KEYBOARD_OPEN_THRESHOLD_PX) {
        /* Close intent is published immediately, but the `closing` phase
           keeps visual-only chrome hidden until the spring has actually
           reached the resting position. scroll.js also uses this phase to
           stay out of the keyboard controller's scroll timeline. */
        setKeyboardIntent(false);
        setKeyboardPhase('closing');
      } else {
        setKeyboardIntent(false);
        setKeyboardPhase('closed');
      }
      /* Feed-forward velocity: only a sample that continues an
         established same-direction stream carries the keyboard's
         measured speed into the lead. A lone jump (first report, long
         silence, or a direction flip) leaves the estimate at zero, so
         the spring starts from rest and stays smooth instead of
         inheriting a phantom lead that would overshoot. */
      const progressive = isProgressiveKeyboardSample(
        lastTargetAt,
        now,
        transitionDirection,
        streamDirection,
      );
      if (progressive) {
        const dtSample = Math.max(0.016, (now - lastTargetAt) / 1000);
        const raw = (nextTarget - targetTravel) / dtSample;
        const clamped = Math.max(
          -KEYBOARD_STREAM_MAX_VELOCITY,
          Math.min(KEYBOARD_STREAM_MAX_VELOCITY, raw),
        );
        const blend = Math.min(0.4, (now - lastTargetAt) / 60);
        streamVelocity += (clamped - streamVelocity) * blend;
        lastSampleProgressive = true;
      } else {
        streamVelocity = 0;
        lastSampleProgressive = false;
      }
      targetTravel = nextTarget;
      lastTargetAt = now;
      chaseStartedAt = now;
      if (streamDirection) transitionDirection = streamDirection;
      /* The geometry is still moving — keep the sampling window open so
         platforms that mutate the viewport without per-frame events keep
         feeding this tracker. */
      extendGeometryPoll(KEYBOARD_POLL_IDLE_MS);
    }

    /* Reduced-motion (and no-rAF) builds skip the interpolation entirely:
       the spring is the only animation, so a snap is a direct write. */
    if (prefersReducedMotion() || typeof window.requestAnimationFrame !== 'function') {
      if (motionFrame) { cancelAnimationFrame(motionFrame); motionFrame = 0; }
      paintedTravel = nextTarget;
      chaseVelocity = 0;
      streamVelocity = 0;
      motionFrameCount = 0;
      chaseStartedAt = 0;
      writeInsetFrame(nextTarget);
      setKeyboardPhase(nextTarget > KEYBOARD_OPEN_THRESHOLD_PX ? 'open' : 'closed');
      setKeyboardIntent(nextTarget > KEYBOARD_OPEN_THRESHOLD_PX);
      return;
    }
    if (!motionFrame) {
      lastMotionAt = now;
      chaseStartedAt = now;
      /* A new chase session restarts the frame counter so the MIN_MOTION_FRAMES
         floor always protects the visible ramp — even if the previous
         session was interrupted before settling. */
      motionFrameCount = 0;
      motionFrame = requestAnimationFrame(stepMotion);
    }
  };

  /* Per-frame geometry sampler for platforms whose visualViewport values
     change without per-frame events. The window opens around each focus
     edge and stays open while the measured inset keeps changing (each
     new target extends it), then the loop stops itself — no permanent
     rAF during an idle keyboard session. */
  const pollKeyboardGeometry = () => {
    geometryPollFrame = 0;
    const now = (typeof performance !== 'undefined' && performance.now)
      ? performance.now()
      : Date.now();
    if (now >= geometryPollUntil) return;
    applyTravel(stableMeasuredTravel(isInputFocused()));
    if (
      !geometryPollFrame
      && typeof window.requestAnimationFrame === 'function'
      && geometryPollUntil > ((typeof performance !== 'undefined' && performance.now)
        ? performance.now()
        : Date.now())
    ) {
      geometryPollFrame = window.requestAnimationFrame(pollKeyboardGeometry);
    }
  };

  const extendGeometryPoll = (windowMs) => {
    const now = (typeof performance !== 'undefined' && performance.now)
      ? performance.now()
      : Date.now();
    geometryPollUntil = Math.max(geometryPollUntil, now + windowMs);
    if (!geometryPollFrame && typeof window.requestAnimationFrame === 'function') {
      geometryPollFrame = window.requestAnimationFrame(pollKeyboardGeometry);
    }
  };

  /* Bottom edge of the app shell in client coordinates. Falls back to
     innerHeight when the shell is missing, hidden, or not laid out yet
     (rect.bottom = 0 — the composer cannot be focused then anyway). */
  const appShellBottom = () => {
    if (keyboardShellFrozen && keyboardShellBaselineInnerHeight > 0) {
      return keyboardShellBaselineInnerHeight;
    }
    const appEl = container
      || (typeof document !== 'undefined' ? document.getElementById('appShell') : null)
      || root;
    try {
      if (appEl && typeof appEl.getBoundingClientRect === 'function') {
        const bottom = appEl.getBoundingClientRect().bottom + (Number(window.scrollY) || 0);
        if (Number.isFinite(bottom) && bottom > 0) return bottom;
      }
    } catch (_) { /* detached node — use the fallback */ }
    return window.innerHeight || 0;
  };

  const isInputFocused = () => isTrackedInputFocused(trackedInputs);

  const isTrackedEditableTarget = (eventTarget) => {
    let target = eventTarget;
    try {
      if (target && target.nodeType !== 1) target = target.parentElement;
      const editor = target?.closest?.('[contenteditable="true"], textarea, input');
      if (!editor) return false;
      return trackedInputs.some((tracked) => tracked && (
        tracked === editor || tracked.contains?.(editor)
      ));
    } catch (_) { return false; }
  };

  const keyboardShellElement = () => container
    || (typeof document !== 'undefined' ? document.getElementById('appShell') : null)
    || root;

  const beginKeyboardSession = () => {
    if (keyboardShellReleaseTimer) {
      clearTimeout(keyboardShellReleaseTimer);
      keyboardShellReleaseTimer = 0;
    }
    /* This attribute disables the small CSS fallback transition on
       .chat-view. The real keyboard session is always driven by the JS
       frames below; the fallback remains available for external, non-focus
       style writes used by older bridges. */
    try { root.dataset.keyboardMotion = 'manual'; } catch (_) { /* detached root */ }
    if (keyboardShellFrozen) return;

    const shell = keyboardShellElement();
    if (!shell || typeof shell.getBoundingClientRect !== 'function') return;
    let height = 0;
    try { height = Number(shell.getBoundingClientRect().height); } catch (_) { /* keep zero */ }
    /* If the layout viewport already shrank before this focus (some
       platforms dispatch the first resize ahead of focusin), the live
       rect is the post-keyboard height — freezing it would lock the
       composer at its final position with no animation range left. The
       remembered pre-keyboard height re-expands the shell instead. */
    if (lastKnownShellHeight > height + 1) height = lastKnownShellHeight;
    if (!Number.isFinite(height) || height <= 0) return;
    const baselineHeight = Math.max(height, lastKnownShellHeight);
    const liveVisualHeight = Number(viewport?.height);
    const baselineVisualHeight = lastKnownVisualHeight >= MIN_STABLE_VISUAL_VIEWPORT_HEIGHT
      ? lastKnownVisualHeight
      : (Number.isFinite(liveVisualHeight) && liveVisualHeight >= MIN_STABLE_VISUAL_VIEWPORT_HEIGHT
        ? liveVisualHeight
        : baselineHeight);

    const style = shell.style;
    keyboardShellRestoreStyle = {
      value: style.getPropertyValue('height'),
      priority: style.getPropertyPriority('height'),
    };
    /* `innerHeight` may already be the post-keyboard value here. The shell
       height (or the closed-shell snapshot) is the actual layout baseline;
       using live innerHeight reintroduced the zero-animation-range bug. */
    keyboardShellBaselineInnerHeight = baselineHeight;
    keyboardShellBaselineVisualHeight = baselineVisualHeight;
    keyboardSessionStartedAt = Date.now();
    keyboardShellFrozen = true;
    /* Lock the pre-keyboard geometry before the browser's next layout pass.
       This is the compensation baseline; --keyboard-inset then moves the
       in-flow composer toward the visual viewport one frame at a time. */
    style.setProperty('height', `${baselineHeight}px`, keyboardShellRestoreStyle.priority);
  };

  const keyboardViewportSettled = () => {
    if (!keyboardShellFrozen) return true;
    const currentVisualHeight = Number(viewport?.height);
    const currentInnerHeight = Number(window.innerHeight);
    const visualSettled = !Number.isFinite(currentVisualHeight)
      || keyboardShellBaselineVisualHeight <= 0
      || currentVisualHeight >= keyboardShellBaselineVisualHeight - 1;
    const innerSettled = !Number.isFinite(currentInnerHeight)
      || keyboardShellBaselineInnerHeight <= 0
      || currentInnerHeight >= keyboardShellBaselineInnerHeight - 1;
    return visualSettled && innerSettled;
  };

  const restoreKeyboardShell = () => {
    if (!keyboardShellFrozen) return;
    const shell = keyboardShellElement();
    try {
      if (shell?.style && keyboardShellRestoreStyle) {
        if (keyboardShellRestoreStyle.value) {
          shell.style.setProperty(
            'height',
            keyboardShellRestoreStyle.value,
            keyboardShellRestoreStyle.priority,
          );
        } else {
          shell.style.removeProperty('height');
        }
      }
    } catch (_) { /* detached shell */ }
    keyboardShellFrozen = false;
    keyboardShellBaselineInnerHeight = 0;
    keyboardShellBaselineVisualHeight = 0;
    keyboardShellRestoreStyle = null;
    keyboardSessionStartedAt = 0;
    try { delete root.dataset.keyboardMotion; } catch (_) { /* detached root */ }
  };

  const maybeReleaseKeyboardShell = () => {
    if (!keyboardShellFrozen) return;
    if (isInputFocused() || targetTravel > 0 || motionFrame || appliedTravel > 0) return;
    const graceElapsed = keyboardSessionStartedAt > 0
      && Date.now() - keyboardSessionStartedAt > 900;
    if (!keyboardViewportSettled() && !graceElapsed) {
      if (!keyboardShellReleaseTimer) {
        keyboardShellReleaseTimer = setTimeout(() => {
          keyboardShellReleaseTimer = 0;
          maybeReleaseKeyboardShell();
        }, 50);
      }
      return;
    }
    restoreKeyboardShell();
  };

  const scheduleKeyboardShellRelease = () => {
    if (!keyboardShellFrozen) return;
    if (keyboardShellReleaseTimer) clearTimeout(keyboardShellReleaseTimer);
    keyboardShellReleaseTimer = setTimeout(() => {
      keyboardShellReleaseTimer = 0;
      maybeReleaseKeyboardShell();
    }, 160);
  };

  /* P_topic-disclaimer-hide — set data-topic-composer-focused on <html>
     when the topic-setup composer (not the in-chat one) holds focus, so
     CSS can hide the bottom-pinned disclaimer while the topic input is
     active. The previous disclaimer-hide rule fired only on keyboard
     open or ≤500px viewports; a focused-but-not-yet-keyboard-open state
     left the disclaimer overlapping the topic input on mid-size
     phones. The data attribute is owned by this module because
     initKeyboardViewport is already the source of truth for focus-
     driven layout attributes (it owns data-keyboard-open). */
  const topicComposerRoot = (typeof document !== 'undefined')
    ? document.getElementById('topicComposerRoot')
    : null;
  const topicInputWrap = (typeof document !== 'undefined')
    ? document.getElementById('topicInputWrap')
    : null;
  const applyTopicComposerFocused = (focused) => {
    try {
      const active = typeof document !== 'undefined' ? document.activeElement : null;
      let topicFocused = false;
      if (focused && active) {
        if (topicComposerRoot && (active === topicComposerRoot || topicComposerRoot.contains?.(active))) {
          topicFocused = true;
        } else if (topicInputWrap && (active === topicInputWrap || topicInputWrap.contains?.(active))) {
          topicFocused = true;
        }
      }
      root.dataset.topicComposerFocused = topicFocused ? 'true' : 'false';
    } catch (_) { /* detached — leave attribute untouched */ }
  };

  /* The topic landing is its own scroll container. When the keyboard covers
     the lower part of the shell, move only the topic scroller when the
     focused editor falls outside the visual viewport. */
  const ensureTopicComposerVisible = () => {
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    if (!active) return;
    let tracked = null;
    for (let i = 0; i < trackedInputs.length; i += 1) {
      const candidate = trackedInputs[i];
      if (!candidate) continue;
      try {
        if (candidate === active || candidate.contains?.(active)) {
          tracked = candidate;
          break;
        }
      } catch (_) { /* detached composer */ }
    }
    if (!tracked) return;
    const topic = tracked.closest?.('#topicSetup, .topic-setup');
    if (!topic || typeof topic.getBoundingClientRect !== 'function') return;
    const composer = tracked.closest?.('.topic-input-wrap') || tracked;
    if (!composer || typeof composer.getBoundingClientRect !== 'function') return;

    const offsetTop = viewport ? Number(viewport.offsetTop) || 0 : 0;
    const viewportHeight = viewport && Number(viewport.height) > 0
      ? Number(viewport.height)
      : Number(window.innerHeight);
    if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) return;
    const visibleTop = offsetTop + 8;
    const visibleBottom = offsetTop + viewportHeight - 16;
    const rect = composer.getBoundingClientRect();
    let delta = 0;
    if (rect.bottom > visibleBottom) delta = rect.bottom - visibleBottom;
    else if (rect.top < visibleTop) delta = rect.top - visibleTop;
    if (Math.abs(delta) < 1) return;
    const maxScrollTop = Math.max(0, topic.scrollHeight - topic.clientHeight);
    topic.scrollTop = Math.min(maxScrollTop, Math.max(0, topic.scrollTop + delta));
  };

  let topicEnsureFrame = 0;
  const scheduleTopicEnsure = () => {
    if (topicEnsureFrame || typeof window.requestAnimationFrame !== 'function') return;
    topicEnsureFrame = window.requestAnimationFrame(() => {
      topicEnsureFrame = 0;
      /* P_topic-kb-avoid — when the keyboard is open, #topicSetup consumes
         the animated --keyboard-inset as padding-bottom, so the composer
         rises smoothly frame-by-frame. ensureTopicComposerVisible does an
         instant scrollTop assignment that would fight that animation
         (jumping the content on every frame until the padding catches up).
         Skip it whenever a keyboard target is active; the padding is the
         sole avoidance mechanism in that state. The function remains the
         fallback for focus-without-keyboard (desktop, tap-to-focus on a
         partially off-screen input) where targetTravel is 0. */
      if (isInputFocused() && targetTravel <= 0 && !keyboardShellFrozen) ensureTopicComposerVisible();
    });
  };

  const update = () => {
    /* P_kb-stuck — the input bar must never stay lifted after the
       keyboard closes. Some Android keyboards (Samsung, Gboard in
       certain WebView builds) dismiss without firing a paired
       `visualViewport.resize`, leaving viewport.height stale. The
       keyboard can only be open while a tracked input has focus, so
       the activeElement check is authoritative — visualViewport can
       be stale but focus cannot. */
    /* While the shell is unfrozen (keyboard fully closed), keep the
       pre-keyboard height baseline current — orientation changes, URL-bar
       collapses and window resizes all flow through this update path. */
    if (!keyboardShellFrozen) {
      try {
        const live = keyboardShellElement()?.getBoundingClientRect?.().height;
        if (Number.isFinite(live) && live > 0) lastKnownShellHeight = live;
      } catch (_) { /* detached shell */ }
      const liveVisualHeight = Number(viewport?.height);
      if (Number.isFinite(liveVisualHeight) && liveVisualHeight >= MIN_STABLE_VISUAL_VIEWPORT_HEIGHT) {
        lastKnownVisualHeight = liveVisualHeight;
      }
    }
    const focused = isInputFocused();
    if (focused) beginKeyboardSession();
    /* Anchoring follows the whole keyboard session: focus happens before
       the first geometry change, so capturing covers layout-resize
       keyboards (Android/Capacitor, --keyboard-inset stays 0) as well as
       overlay keyboards. The capture must precede applyTravel: a written
       inset re-anchors in the same frame, and that correction needs the
       reader's pre-write intent, not a post-write snapshot. */
    if (focused) beginTranscriptAnchor();
    applyTravel(stableMeasuredTravel(focused));
    writeVisualTop();
    applyTopicComposerFocused(focused);
    if (focused) scheduleTopicEnsure();
    /* Every visualViewport resize/pan re-applies the captured reader
       position after the layout commit — a deferred fallback for the
       same-frame corrections in writeInsetFrame and onViewportGeometry. */
    if (focused || transcriptAnchor) {
      beginTranscriptAnchor();
      scheduleTranscriptRestore();
      scheduleAnchorRefresh();
    }
    if (!focused) maybeReleaseKeyboardShell();
  };

  const schedule = () => {
    if (updateFrame) return;
    updateFrame = window.requestAnimationFrame(() => {
      updateFrame = 0;
      update();
    });
  };

  /* Arm the shell before the browser performs the default focus action. On
     resize-content platforms the layout viewport can shrink between
     pointerdown and focusin; waiting for focusin leaves the in-flow composer
     at its post-keyboard position before the rAF chase owns the first frame.
     This listener is capture-only and does not prevent focus, it merely takes
     the closed geometry snapshot early enough for the keyboard session. */
  const onFocusIntent = (event) => {
    if (!isTrackedEditableTarget(event?.target)) return;
    beginKeyboardSession();
    extendGeometryPoll(KEYBOARD_POLL_EDGE_MS);
    /* A cancelled pointer/touch gesture may never produce focusin/focusout.
       Do not leave the shell frozen in that case; a real focus keeps this
       timer harmless because maybeReleaseKeyboardShell sees the focused
       editor and waits for the normal keyboard session. */
    scheduleKeyboardShellRelease();
  };

  const onFocusIn = () => {
    beginKeyboardSession();
    /* Open the geometry sampling window for the whole open animation:
       even platforms that never dispatch per-frame events still get
       tracked frame by frame while the keyboard travels. */
    extendGeometryPoll(KEYBOARD_POLL_EDGE_MS);
    schedule();
    /* Mirror the focus state to data-topic-composer-focused synchronously
       so the disclaimer disappears on the same frame the topic input
       takes focus. */
    applyTopicComposerFocused(isInputFocused());
  };

  const onBlur = () => {
    schedule();
    scheduleKeyboardShellRelease();
    /* Same window for the close animation: the keyboard can sink without
       a single visualViewport event on some Android WebView builds. */
    extendGeometryPoll(KEYBOARD_POLL_EDGE_MS);
    /* Late re-check: some platforms fire blur BEFORE the close-resize
       (so the measured inset is still large) and then resize fires
       ~50-200ms later. Others fire resize before blur. */
    if (blurRecheckTimer) clearTimeout(blurRecheckTimer);
    blurRecheckTimer = setTimeout(() => { blurRecheckTimer = 0; schedule(); }, 150);
  };

  const onViewportGeometry = () => {
    /* visualViewport can pan before the next rAF. Project the already-painted
       travel immediately so the native pan is cancelled in the same event;
       waiting for update() makes the composer visibly jump for one frame on
       iOS. The next rAF still measures the new height and advances the
       spring. */
    if (keyboardShellFrozen || isInputFocused()) writeInsetFrame(paintedTravel);
    else writeVisualTop();
    schedule();
    if (!transcriptAnchor) return;
    const anchorList = transcriptAnchor.list;
    if (anchorList && anchorList.dataset && anchorList.dataset.turnAnchorHold === 'true') return;
    scheduleTranscriptRestore();
  };

  if (viewport) {
    // iOS Safari can pan the visual viewport without a paired resize event.
    viewport.addEventListener('resize', onViewportGeometry);
    viewport.addEventListener('scroll', onViewportGeometry);
  }
  window.addEventListener('resize', onViewportGeometry);
  /* Chromium's VirtualKeyboard API reports the IME animation even while
     the layout viewport already resizes. overlaysContent stays off —
     enabling it would switch Chrome to overlay mode and leave every
     untracked input (settings, exam fields) uncovered — so only the
     event timing is used, as an extra per-frame sampling trigger into
     the same update() pipeline. Absent on other engines. */
  const virtualKeyboard = (typeof navigator !== 'undefined' && navigator.virtualKeyboard) || null;
  if (virtualKeyboard && typeof virtualKeyboard.addEventListener === 'function') {
    virtualKeyboard.addEventListener('geometrychange', schedule);
  }
  /* focusout on document catches focus moving to ANY element (not just
     input.blur). This is the path that fires when the user dismisses
     the keyboard by tapping a message or the page background, where
     blur may or may not fire depending on the platform. */
  /* focus/blur do not bubble from the nested Tiptap editor to the React
     mount point. focusin/focusout do, and the document-level listener also
     covers an editor that mounts after this initializer has run. */
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onBlur);
  document.addEventListener('pointerdown', onFocusIntent, { capture: true, passive: true });
  document.addEventListener('touchstart', onFocusIntent, { capture: true, passive: true });
  /* Returning from the background (tab switch, native app pause) can
     swallow the close-resize entirely; re-measure on visibility flips.
     The Capacitor bridge mirrors appStateChange into this same event. */
  document.addEventListener('visibilitychange', schedule);
  update();

  return () => {
    if (updateFrame) window.cancelAnimationFrame(updateFrame);
    if (motionFrame) window.cancelAnimationFrame(motionFrame);
    if (topicEnsureFrame) window.cancelAnimationFrame(topicEnsureFrame);
    if (geometryPollFrame) window.cancelAnimationFrame(geometryPollFrame);
    geometryPollUntil = 0;
    if (blurRecheckTimer) clearTimeout(blurRecheckTimer);
    if (keyboardShellReleaseTimer) clearTimeout(keyboardShellReleaseTimer);
    keyboardShellReleaseTimer = 0;
    paintedTravel = 0;
    chaseVelocity = 0;
    streamVelocity = 0;
    keyboardPhase = 'closed';
    restoreKeyboardShell();
    clearTranscriptAnchor();
    try {
      root.style.removeProperty('--keyboard-inset');
      root.style.removeProperty('--keyboard-pan-compensation');
      root.style.removeProperty('--keyboard-visual-top');
    } catch (_) { /* detached root */ }
    try { delete root.dataset.keyboardOpen; } catch (_) { /* detached root */ }
    try { delete root.dataset.keyboardPhase; } catch (_) { /* detached root */ }
    try { delete root.dataset.keyboardMotion; } catch (_) { /* detached root */ }
    try { delete root.dataset.topicComposerFocused; } catch (_) { /* detached root */ }
    if (viewport) {
      viewport.removeEventListener('resize', onViewportGeometry);
      viewport.removeEventListener('scroll', onViewportGeometry);
    }
    window.removeEventListener('resize', onViewportGeometry);
    if (virtualKeyboard && typeof virtualKeyboard.removeEventListener === 'function') {
      virtualKeyboard.removeEventListener('geometrychange', schedule);
    }
    document.removeEventListener('focusin', onFocusIn);
    document.removeEventListener('focusout', onBlur);
    document.removeEventListener('pointerdown', onFocusIntent, { capture: true });
    document.removeEventListener('touchstart', onFocusIntent, { capture: true });
    document.removeEventListener('visibilitychange', schedule);
  };
}
