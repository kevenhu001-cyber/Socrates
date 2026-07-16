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

export function getKeyboardInset(layoutHeight, visualHeight, visualOffsetTop = 0) {
  if (!Number.isFinite(layoutHeight) || !Number.isFinite(visualHeight)) return 0;
  return Math.max(0, Math.round(layoutHeight - (visualHeight + Math.max(0, visualOffsetTop))));
}

export function initKeyboardViewport({ input, container, root = document.documentElement } = {}) {
  if (!root) return () => {};

  const viewport = window.visualViewport;
  let smoothFrame = 0;
  let targetInset = 0;
  let currentInset = 0;

  const applyInset = (inset) => {
    root.style.setProperty('--keyboard-inset', `${Math.round(inset)}px`);
    root.dataset.keyboardOpen = inset > 80 ? 'true' : 'false';
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

  const update = () => {
    // Measure the app shell first. If `100dvh` already shrank it (the
    // Firefox/Android behaviour), adding a second inset would over-correct.
    const containerHeight = container?.getBoundingClientRect().height || 0;
    const layoutHeight = containerHeight || window.innerHeight || document.documentElement.clientHeight || 0;
    targetInset = viewport
      ? getKeyboardInset(layoutHeight, viewport.height, viewport.offsetTop)
      : 0;

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
    if (!smoothFrame) smoothFrame = window.requestAnimationFrame(update);
  };

  if (viewport) {
    // iOS Safari can pan the visual viewport without a paired resize event.
    viewport.addEventListener('resize', schedule);
    viewport.addEventListener('scroll', schedule);
  }
  window.addEventListener('resize', schedule);
  input?.addEventListener('focus', schedule);
  input?.addEventListener('blur', schedule);
  update();

  return () => {
    if (smoothFrame) window.cancelAnimationFrame(smoothFrame);
    if (viewport) {
      viewport.removeEventListener('resize', schedule);
      viewport.removeEventListener('scroll', schedule);
    }
    window.removeEventListener('resize', schedule);
    input?.removeEventListener('focus', schedule);
    input?.removeEventListener('blur', schedule);
  };
}
