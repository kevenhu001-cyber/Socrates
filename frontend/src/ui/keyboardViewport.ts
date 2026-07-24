/*
 * Keep fixed/absolute chat controls above mobile virtual keyboards.
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

export function getKeyboardInset(layoutHeight: number, visualHeight: number, visualOffsetTop: number = 0): number {
  if (!Number.isFinite(layoutHeight) || !Number.isFinite(visualHeight)) return 0;
  return Math.max(0, Math.round(layoutHeight - (visualHeight + Math.max(0, visualOffsetTop))));
}

interface KeyboardViewportOptions {
  inputs?: (Element | null)[] | string;
  input?: Element | null;
  container?: Element | null;
  root?: HTMLElement;
}

export function initKeyboardViewport({ inputs, input, container, root = document.documentElement }: KeyboardViewportOptions = {}): () => void {
  if (!root) return () => {};

  /* P_multi-input — `input` (single element) is the legacy shape; pass
   * `inputs` (single element, array of elements, or CSS selector) to
   * track more than one composer — e.g. the chat composer AND the
   * topic-setup composer. Without this, focus on a non-primary input
   * leaves data-keyboard-open stuck false and any layout keyed off
   * that attribute (e.g. .topic-input-wrap margin-top) never applies. */
  const trackedInputs: Element[] = (() => {
    const source = inputs ?? input;
    if (!source) return [];
    if (typeof source === 'string') return Array.from(document.querySelectorAll(source));
    if (Array.isArray(source)) return source.filter(Boolean) as Element[];
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
  let blurRecheckTimer: ReturnType<typeof setTimeout> | number = 0;

  const applyInset = (inset: number): void => {
    root!.style.setProperty('--keyboard-inset', `${Math.round(inset)}px`);
    root!.dataset.keyboardOpen = inset > 80 ? 'true' : 'false';
  };

  // Smooth step toward target using exponential moving average.
  const SMOOTH_FACTOR = 0.18;

  const smoothLoop = (): void => {
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

  const scheduleSmooth = (): void => {
    if (!smoothFrame) smoothFrame = requestAnimationFrame(smoothLoop);
  };

  const isInputFocused = (): boolean => {
    if (!trackedInputs.length) return false;
    var active = document.activeElement;
    for (var i = 0; i < trackedInputs.length; i++) {
      var el = trackedInputs[i];
      if (!el) continue;
      if (active === el) return true;
      /* The input may contain nested focusable children in some
         composer variants — match on the element OR a descendant.
         `:focus` walks the focus chain so this covers both. */
      try { if (el.matches(':focus')) return true; } catch (_) { /* ignore */ }
    }
    return false;
  };

  const update = (): void => {
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
    const wasOpen = root!.dataset.keyboardOpen === 'true';
    const nowOpen = targetInset > 80;
    if (wasOpen !== nowOpen) {
      currentInset = targetInset;
      applyInset(currentInset);
    } else {
      scheduleSmooth();
    }
  };

  const schedule = (): void => {
    if (!smoothFrame) smoothFrame = window.requestAnimationFrame(update);
  };

  const onBlur = (): void => {
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
  document.addEventListener('focusout', onBlur);
  trackedInputs.forEach((el) => {
    if (!el) return;
    el.addEventListener('focus', schedule);
    el.addEventListener('blur', onBlur);
  });
  update();

  return () => {
    if (smoothFrame) window.cancelAnimationFrame(smoothFrame);
    if (blurRecheckTimer) clearTimeout(blurRecheckTimer);
    if (viewport) {
      viewport.removeEventListener('resize', schedule);
      viewport.removeEventListener('scroll', schedule);
    }
    window.removeEventListener('resize', schedule);
    document.removeEventListener('focusout', onBlur);
    trackedInputs.forEach((el) => {
      if (!el) return;
      el.removeEventListener('focus', schedule);
      el.removeEventListener('blur', onBlur);
    });
  };
}
