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
 * data-keyboard-open flag. Layout AND animation are left to CSS
 * (.chat-view transitions its padding-bottom); there is deliberately no
 * JS interpolation loop, so there is a single source of motion and no
 * double-smoothed lag or flicker.
 */

export function getKeyboardInset(layoutHeight, visualHeight, visualOffsetTop = 0) {
  if (!Number.isFinite(layoutHeight) || !Number.isFinite(visualHeight)) return 0;
  return Math.max(0, Math.round(layoutHeight - (visualHeight + Math.max(0, visualOffsetTop))));
}

/* Pure measurement step, split out for unit tests. `appBottom` is the app
 * shell's getBoundingClientRect().bottom (client coordinates); `viewport`
 * is window.visualViewport or null; `innerHeight` is the fallback for
 * legacy WebViews without the VisualViewport API — resize-mode keyboards
 * still shrink innerHeight there, so the "stuck 100vh" case keeps
 * working, while overlay keyboards stay invisible (inset 0), matching
 * the previous degraded behaviour. */
export function measureKeyboardInset(appBottom, viewport, innerHeight) {
  if (!viewport) return getKeyboardInset(appBottom, innerHeight ?? 0, 0);
  return getKeyboardInset(appBottom, viewport.height, viewport.offsetTop);
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
  let pinFrame = 0;
  let blurRecheckTimer = 0;
  /* -1 forces the first applyInset() to write, so --keyboard-inset and
     data-keyboard-open are initialised even when the inset starts at 0. */
  let appliedInset = -1;
  /* P_topic-kb-stable — last keyboard-closed shell height written to
     --app-vh, plus the width it was measured at (rotation detector). */
  let appliedStableVh = -1;
  let stableVhWidth = -1;

  const applyInset = (inset) => {
    const roundedInset = Math.round(inset);
    if (roundedInset === appliedInset) return;
    const list = typeof document !== 'undefined'
      ? document.getElementById('msgList')
      : null;
    const readerMovedAway = Boolean(window.state && window.state._userScrolledAway);
    const wasPinned = Boolean(
      list
      && !readerMovedAway
      && list.scrollHeight - list.scrollTop - list.clientHeight <= 96
    );

    root.style.setProperty('--keyboard-inset', `${roundedInset}px`);
    root.dataset.keyboardOpen = roundedInset > 50 ? 'true' : 'false';

    /* Raising the in-flow composer shrinks the transcript's flex viewport.
     * Preserve the bottom anchor only for a reader who was already following
     * the latest message; otherwise the smaller viewport can make them appear
     * to have scrolled away and subsequent stream updates stop following. */
    if (wasPinned && list) {
      if (pinFrame) cancelAnimationFrame(pinFrame);
      pinFrame = requestAnimationFrame(() => {
        pinFrame = 0;
        if (!window.state || !window.state._userScrolledAway) {
          /* Smooth the re-pin so the transcript glides up with the
             composer instead of snapping when the keyboard opens. */
          list.classList.add('smooth-scroll');
          list.scrollTop = list.scrollHeight;
          setTimeout(function() {
            try { list.classList.remove('smooth-scroll'); } catch (_) {}
          }, 400);
        }
      });
    }
    appliedInset = roundedInset;
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

  const update = () => {
    /* P_kb-stuck — the input bar must never stay lifted after the
       keyboard closes. Some Android keyboards (Samsung, Gboard in
       certain WebView builds) dismiss without firing a paired
       `visualViewport.resize`, leaving viewport.height stale. The
       keyboard can only be open while a tracked input has focus, so
       the activeElement check is authoritative — visualViewport can
       be stale but focus cannot. */
    const focused = isInputFocused();
    applyInset(
      focused
        ? measureKeyboardInset(appShellBottom(), viewport, window.innerHeight)
        : 0,
    );
  };

  const schedule = () => {
    if (updateFrame) return;
    updateFrame = window.requestAnimationFrame(() => {
      updateFrame = 0;
      update();
    });
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
  document.addEventListener('focusin', schedule);
  document.addEventListener('focusout', onBlur);
  /* Returning from the background (tab switch, native app pause) can
     swallow the close-resize entirely; re-measure on visibility flips.
     The Capacitor bridge mirrors appStateChange into this same event. */
  document.addEventListener('visibilitychange', schedule);
  update();

  return () => {
    if (updateFrame) window.cancelAnimationFrame(updateFrame);
    if (pinFrame) window.cancelAnimationFrame(pinFrame);
    if (blurRecheckTimer) clearTimeout(blurRecheckTimer);
    try { root.style.removeProperty('--app-vh'); } catch (_) { /* detached root */ }
    if (viewport) {
      viewport.removeEventListener('resize', schedule);
      viewport.removeEventListener('scroll', schedule);
    }
    window.removeEventListener('resize', schedule);
    document.removeEventListener('focusin', schedule);
    document.removeEventListener('focusout', onBlur);
    document.removeEventListener('visibilitychange', schedule);
  };
}
