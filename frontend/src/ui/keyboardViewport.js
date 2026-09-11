import { smoothScrollToBottom } from './scroll.js';
import { decideKeyboardAnchorAction, KEYBOARD_PIN_SLACK } from './scrollDecision.ts';
import { getLastScrollIntentAt } from './scrollPill.js';

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
 * This module writes one CSS custom property (--keyboard-inset) plus a
 * data-keyboard-open flag. Layout follows that one measured value.
 * Browsers differ in how they report the keyboard's travel: some emit
 * many progressive samples (the composer can follow them 1:1), others
 * a single discrete jump once the keyboard is up. A short ease-out
 * glide toward the latest measurement — owned here, nowhere else in
 * CSS or JS — turns both shapes into one smooth, continuous lift and
 * prevents the composer from snapping ahead of the keyboard or
 * flashing between intermediate positions.
 *
 * The same controller anchors the transcript across the lift: a reader
 * following the bottom stays on the newest content, while a reader
 * inspecting history keeps their exact offset (visualViewport-driven
 * compensation, never a forced scroll to the bottom).
 */

/* Android/iOS WebViews can expose a 0–1px visual viewport for a transient
 * frame while the IME is opening or closing. It is not a usable geometry
 * sample; treating it as the keyboard top would lift the composer almost the
 * full height of the app. */
export const MIN_STABLE_VISUAL_VIEWPORT_HEIGHT = 96;

/* Duration of the composer lift when the measured inset arrives as a
 * discrete jump (Android overlay keyboards report the final size in one
 * event). Kept close to the platform keyboard animation so the input
 * rides the keyboard's own motion instead of snapping or lagging. */
export const KEYBOARD_LIFT_MS = 220;

/* Pure ease-out cubic, split out for unit tests. */
export function easeKeyboardLift(t) {
  const x = Math.min(1, Math.max(0, Number(t) || 0));
  return 1 - (1 - x) * (1 - x) * (1 - x);
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
  const covered = Math.round(layoutHeight - visualBottom);
  return Math.min(layoutHeight, Math.max(0, covered));
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
  if (!root) return () => {};
  /* Clear the legacy frozen-height value when hot reload or a soft navigation
     reuses the document. It is no longer part of keyboard avoidance. */
  try { root.style.removeProperty('--app-vh'); } catch (_) { /* detached root */ }

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
  let blurRecheckTimer = 0;
  /* -1 forces the first write to apply, so --keyboard-inset and
     data-keyboard-open are initialised even when the inset starts at 0. */
  let appliedInset = -1;
  /* Interpolation state: the measured inset is the motion target; the
     value exposed to CSS glides toward it over KEYBOARD_LIFT_MS. */
  let targetInset = 0;
  let motionFrom = 0;
  let motionStart = 0;
  /* Reader position captured for the duration of a keyboard transition.
     The captured intent (bottom-follow vs history) is authoritative for
     the whole motion; per-frame geometry is not re-interpreted, so the
     first shrunk frame cannot strand a pinned reader or drag a history
     reader to the bottom. */
  let transcriptAnchor = null;

  const prefersReducedMotion = () => {
    try {
      return typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_) { return false; }
  };

  const stableMeasuredInset = (focused) => {
    if (!focused) return 0;
    const viewportHeight = Number(viewport?.height);
    /* Preserve the last stable value while the visual viewport is in its
     * transient zero/tiny state. This keeps a closing keyboard from flashing
     * the composer down and back up, while an opening keyboard starts at 0
     * and adopts the first real sample on the next frame. */
    if (viewport && (!Number.isFinite(viewportHeight) || viewportHeight < MIN_STABLE_VISUAL_VIEWPORT_HEIGHT)) {
      return appliedInset > 0 ? appliedInset : 0;
    }
    return measureKeyboardInset(appShellBottom(), viewport, window.innerHeight);
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
    const action = decideKeyboardAnchorAction(
      { scrollTop: anchor.scrollTop, pinned: anchor.pinned },
      {
        maxScrollTop: list.scrollHeight - list.clientHeight,
        scrolledAway: Boolean(window.stateStore.read('_userScrolledAway')),
        userIntentAfterCapture: getLastScrollIntentAt() > anchor.intentAt,
        panDelta: viewportOffsetTop() - anchor.offsetTop,
      },
    );
    if (action.type === 'none') {
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

  /* One frame of the lift: write the current interpolated value and
     re-anchor the transcript after the flex layout commits. */
  const writeInsetFrame = (inset) => {
    const roundedInset = Number.isFinite(inset) ? Math.max(0, Math.round(inset)) : 0;
    if (roundedInset === appliedInset) return;
    root.style.setProperty('--keyboard-inset', `${roundedInset}px`);
    /* Raising the in-flow composer shrinks the transcript's flex viewport.
     * Re-anchor on the next frame, once the new height is measured. */
    if (transcriptAnchor) scheduleTranscriptRestore();
    appliedInset = roundedInset;
  };

  const stepMotion = (now) => {
    motionFrame = 0;
    const elapsed = now - motionStart;
    const t = KEYBOARD_LIFT_MS > 0 ? elapsed / KEYBOARD_LIFT_MS : 1;
    if (t >= 1) {
      writeInsetFrame(targetInset);
      return;
    }
    const value = motionFrom + (targetInset - motionFrom) * easeKeyboardLift(t);
    writeInsetFrame(value);
    motionFrame = requestAnimationFrame(stepMotion);
  };

  const applyInset = (inset) => {
    const roundedTarget = Number.isFinite(inset) ? Math.max(0, Math.round(inset)) : 0;

    /* Discrete layout states key off the settled measurement, not the
     * in-flight interpolated value, so they flip exactly once per
     * keyboard open/close. */
    root.dataset.keyboardOpen = roundedTarget > 50 ? 'true' : 'false';

    if (roundedTarget === targetInset && motionFrame === 0 && appliedInset === roundedTarget) return;
    targetInset = roundedTarget;

    /* Progressive viewports (iOS) deliver many small steps; a short glide
     * between samples keeps the motion continuous there too. Discrete
     * viewports (most Android builds) get the whole lift from the
     * interpolation. Reduced motion snaps. */
    if (prefersReducedMotion() || typeof window.requestAnimationFrame !== 'function') {
      if (motionFrame) { cancelAnimationFrame(motionFrame); motionFrame = 0; }
      writeInsetFrame(roundedTarget);
      return;
    }
    motionFrom = appliedInset < 0 ? 0 : appliedInset;
    motionStart = (typeof performance !== 'undefined' && performance.now)
      ? performance.now()
      : Date.now();
    if (!motionFrame) motionFrame = requestAnimationFrame(stepMotion);
  };

  /* Bottom edge of the app shell in client coordinates. Falls back to
     innerHeight when the shell is missing, hidden, or not laid out yet
     (rect.bottom = 0 — the composer cannot be focused then anyway). */
  const appShellBottom = () => {
    const appEl = container
      || (typeof document !== 'undefined' ? document.getElementById('appShell') : null)
      || root;
    try {
      if (appEl && typeof appEl.getBoundingClientRect === 'function') {
        const bottom = appEl.getBoundingClientRect().bottom;
        if (Number.isFinite(bottom) && bottom > 0) return bottom;
      }
    } catch (_) { /* detached node — use the fallback */ }
    return window.innerHeight || 0;
  };

  const isInputFocused = () => isTrackedInputFocused(trackedInputs);

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
      if (isInputFocused()) ensureTopicComposerVisible();
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
    const focused = isInputFocused();
    applyInset(stableMeasuredInset(focused));
    applyTopicComposerFocused(focused);
    if (focused) scheduleTopicEnsure();
    /* Anchoring follows the whole keyboard session: focus happens before
       the first geometry change, so capturing here covers layout-resize
       keyboards (Android/Capacitor, --keyboard-inset stays 0) as well as
       overlay keyboards. Every visualViewport resize/pan re-applies the
       captured reader position after the layout commit. */
    if (focused || transcriptAnchor) {
      beginTranscriptAnchor();
      scheduleTranscriptRestore();
      scheduleAnchorRefresh();
    }
  };

  const schedule = () => {
    if (updateFrame) return;
    updateFrame = window.requestAnimationFrame(() => {
      updateFrame = 0;
      update();
    });
  };

  const onFocusIn = () => {
    schedule();
    /* Mirror the focus state to data-topic-composer-focused synchronously
       so the disclaimer disappears on the same frame the topic input
       takes focus (the deferred schedule() runs after a rAF, which is
       enough to flicker the disclaimer across the screen during a fast
       tap-to-focus on iOS). */
    applyTopicComposerFocused(isInputFocused());
  };

  const onBlur = () => {
    schedule();
    /* Late re-check: some platforms fire blur BEFORE the close-resize
       (so the measured inset is still large) and then resize fires
       ~50-200ms later. Others fire resize before blur. Either way,
       schedule one more update shortly after to catch the late settle —
       and if the resize never arrives (the stuck-keyboard bug), the
       focus check in update() forces the inset to 0 anyway. */
    if (blurRecheckTimer) clearTimeout(blurRecheckTimer);
    blurRecheckTimer = setTimeout(() => { blurRecheckTimer = 0; schedule(); }, 150);
  };

  if (viewport) {
    // iOS Safari can pan the visual viewport without a paired resize event.
    viewport.addEventListener('resize', schedule);
    viewport.addEventListener('scroll', schedule);
  }
  window.addEventListener('resize', schedule);
  /* focusout on document catches focus moving to ANY element (not just
     input.blur). This is the path that fires when the user dismisses
     the keyboard by tapping a message or the page background, where
     blur may or may not fire depending on the platform. */
  /* focus/blur do not bubble from the nested Tiptap editor to the React
     mount point. focusin/focusout do, and the document-level listener also
     covers an editor that mounts after this initializer has run. */
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onBlur);
  /* Returning from the background (tab switch, native app pause) can
     swallow the close-resize entirely; re-measure on visibility flips.
     The Capacitor bridge mirrors appStateChange into this same event. */
  document.addEventListener('visibilitychange', schedule);
  update();

  return () => {
    if (updateFrame) window.cancelAnimationFrame(updateFrame);
    if (motionFrame) window.cancelAnimationFrame(motionFrame);
    if (topicEnsureFrame) window.cancelAnimationFrame(topicEnsureFrame);
    if (blurRecheckTimer) clearTimeout(blurRecheckTimer);
    clearTranscriptAnchor();
    try { root.style.removeProperty('--keyboard-inset'); } catch (_) { /* detached root */ }
    try { delete root.dataset.keyboardOpen; } catch (_) { /* detached root */ }
    try { delete root.dataset.topicComposerFocused; } catch (_) { /* detached root */ }
    if (viewport) {
      viewport.removeEventListener('resize', schedule);
      viewport.removeEventListener('scroll', schedule);
    }
    window.removeEventListener('resize', schedule);
    document.removeEventListener('focusin', onFocusIn);
    document.removeEventListener('focusout', onBlur);
    document.removeEventListener('visibilitychange', schedule);
  };
}
