/*
 * Keep chat controls above mobile virtual keyboards.
 *
 * Browsers do not agree on whether the layout viewport shrinks when a
 * keyboard opens. Reading only `innerHeight - visualViewport.height`
 * therefore double-counts the inset in some Chromium builds (notably Edge)
 * and ignores viewport panning in others. This module writes one CSS custom
 * property, leaving layout and scrolling to CSS instead of mutating scrollTop.
 *
 * The inset is smoothed with an exponential moving average so the input bar
 * glides smoothly instead of jumping at each intermediate keyboard height.
 */

export function getKeyboardInset(layoutHeight, visualHeight, visualOffsetTop = 0) {
  if (!Number.isFinite(layoutHeight) || !Number.isFinite(visualHeight)) return 0;
  return Math.max(0, Math.round(layoutHeight - (visualHeight + Math.max(0, visualOffsetTop))));
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
  let smoothFrame = 0;
  let targetInset = 0;
  let currentInset = 0;
  /* P_kb-stuck — the user reported the input bar sometimes stays
      lifted after the keyboard closes. Cause: some Android keyboards
      (Samsung, Gboard in certain WebView versions) dismiss without
      firing a paired `visualViewport.resize` — viewport.height stays
      at the shrunken value, so targetInset never returns to 0.

      Defence-in-depth fix:
        1. Force targetInset=0 when the input isn't focused. The
           keyboard can only be open while the input has focus, so the
           activeElement check is authoritative — visualViewport can
           be stale but focus cannot.
        2. On blur, schedule a delayed re-check (300ms) to catch a
           late-firing resize that arrives after the blur event.
        3. Listen for focusout on the document so the dismissal path
           also fires when focus moves to a non-input element (e.g.
           user taps a message in the chat). */
  let blurRecheckTimer = 0;
  let pinFrame = 0;
  let appliedInset = 0;

  const applyInset = (inset) => {
    const roundedInset = Math.round(inset);
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
    root.dataset.keyboardOpen = roundedInset > 80 ? 'true' : 'false';

    /* Raising the in-flow composer shrinks the transcript's flex viewport.
     * Preserve the bottom anchor only for a reader who was already following
     * the latest message; otherwise the smaller viewport can make them appear
     * to have scrolled away and subsequent stream updates stop following. */
    if (roundedInset !== appliedInset && wasPinned && list) {
      if (pinFrame) cancelAnimationFrame(pinFrame);
      pinFrame = requestAnimationFrame(() => {
        pinFrame = 0;
        if (!window.state || !window.state._userScrolledAway) {
          list.scrollTop = list.scrollHeight;
        }
      });
    }
    appliedInset = roundedInset;
  };

  // Smooth step toward target using exponential moving average.
  const SMOOTH_FACTOR = 0.18;

  const smoothLoop = () => {
    smoothFrame = 0;
    const diff = targetInset - currentInset;
    if (Math.abs(diff) < 0.5) {
      currentInset = targetInset;
      applyInset(currentInset);
      return;
    }
    currentInset += diff * SMOOTH_FACTOR;
    applyInset(currentInset);
    smoothFrame = requestAnimationFrame(smoothLoop);
  };

  const scheduleSmooth = () => {
    if (!smoothFrame) smoothFrame = requestAnimationFrame(smoothLoop);
  };

  const isInputFocused = () => isTrackedInputFocused(trackedInputs);

  const update = () => {
    /* P_kb-inset-android — the previous formula (containerHeight ||
     * window.innerHeight) gave inset=0 on Android Chrome because
     * .app = 100dvh shrinks together with visualViewport.height —
     * both end up at the same post-keyboard value. iOS Safari takes the
     * opposite path: window.innerHeight stays unchanged and the page
     * scrolls up (visualViewport.offsetTop turns negative). Use the
     * larger of {innerHeight, visualHeight + |offsetTop|} so both
     * platforms give a real keyboard height and the CSS bottom-padding
     * / fixed-bottom pickers land flush against the keyboard top. */
    const containerHeight = container?.getBoundingClientRect().height || 0;
    const visualHeight = viewport?.height || 0;
    const visualOffsetTop = viewport?.offsetTop || 0;
    const layoutHeight = Math.max(
      window.innerHeight || 0,
      visualHeight + Math.max(0, visualOffsetTop),
      containerHeight,
    ) || document.documentElement.clientHeight || 0;
    const measuredInset = viewport
      ? getKeyboardInset(layoutHeight, visualHeight, visualOffsetTop)
      : 0;

    /* Authoritative check: keyboard cannot be open while the input is
       not focused. visualViewport.height may be stale (Android
       dismissal without paired resize) — trust focus over viewport. */
    targetInset = isInputFocused() ? measuredInset : 0;

    // If the keyboard just opened or closed, snap current close to target
    // so we don't animate from an unrelated old value. Otherwise schedule
    // smooth interpolation.
    const wasOpen = root.dataset.keyboardOpen === 'true';
    const nowOpen = targetInset > 80;
    if (wasOpen !== nowOpen) {
      currentInset = targetInset;
      applyInset(currentInset);
    } else {
      scheduleSmooth();
    }
  };

  const schedule = () => {
    if (smoothFrame) return;
    smoothFrame = window.requestAnimationFrame(() => {
      smoothFrame = 0;
      update();
    });
  };

  const onBlur = () => {
    schedule();
    /* Late re-check: some platforms fire blur BEFORE the close-resize
       (so measuredInset is still large) and then resize fires ~50-200ms
       later. Others fire resize before blur. Either way, schedule one
       more update 300ms later to catch the late settle — and if the
       resize never arrives (the stuck-keyboard bug), the focus check
       in update() forces targetInset=0 anyway. */
    if (blurRecheckTimer) clearTimeout(blurRecheckTimer);
    blurRecheckTimer = setTimeout(() => { blurRecheckTimer = 0; schedule(); }, 300);
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
  update();

  return () => {
    if (smoothFrame) window.cancelAnimationFrame(smoothFrame);
    if (pinFrame) window.cancelAnimationFrame(pinFrame);
    if (blurRecheckTimer) clearTimeout(blurRecheckTimer);
    if (viewport) {
      viewport.removeEventListener('resize', schedule);
      viewport.removeEventListener('scroll', schedule);
    }
    window.removeEventListener('resize', schedule);
    document.removeEventListener('focusin', schedule);
    document.removeEventListener('focusout', onBlur);
  };
}
