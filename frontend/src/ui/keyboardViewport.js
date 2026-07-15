/*
 * Keep fixed/absolute chat controls above mobile virtual keyboards.
 *
 * Browsers do not agree on whether the layout viewport shrinks when a
 * keyboard opens. Reading only `innerHeight - visualViewport.height`
 * therefore double-counts the inset in some Chromium builds (notably Edge)
 * and ignores viewport panning in others. This module writes one CSS custom
 * property, leaving layout and scrolling to CSS instead of mutating scrollTop.
 */

export function getKeyboardInset(layoutHeight, visualHeight, visualOffsetTop = 0) {
  if (!Number.isFinite(layoutHeight) || !Number.isFinite(visualHeight)) return 0;
  return Math.max(0, Math.round(layoutHeight - (visualHeight + Math.max(0, visualOffsetTop))));
}

export function initKeyboardViewport({ input, container, root = document.documentElement } = {}) {
  if (!root) return () => {};

  const viewport = window.visualViewport;
  let frame = 0;

  const update = () => {
    frame = 0;
    // Measure the app shell first. If `100dvh` already shrank it (the
    // Firefox/Android behaviour), adding a second inset would over-correct.
    const containerHeight = container?.getBoundingClientRect().height || 0;
    const layoutHeight = containerHeight || window.innerHeight || document.documentElement.clientHeight || 0;
    const inset = viewport
      ? getKeyboardInset(layoutHeight, viewport.height, viewport.offsetTop)
      : 0;

    root.style.setProperty('--keyboard-inset', `${inset}px`);
    root.dataset.keyboardOpen = inset > 80 ? 'true' : 'false';
  };

  const schedule = () => {
    if (!frame) frame = window.requestAnimationFrame(update);
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
    if (frame) window.cancelAnimationFrame(frame);
    if (viewport) {
      viewport.removeEventListener('resize', schedule);
      viewport.removeEventListener('scroll', schedule);
    }
    window.removeEventListener('resize', schedule);
    input?.removeEventListener('focus', schedule);
    input?.removeEventListener('blur', schedule);
  };
}
