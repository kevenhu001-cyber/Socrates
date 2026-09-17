// src/ui/topicFocusAssist.js — desktop/hardware-keyboard visibility assist.
//
// Mobile software-keyboard movement is owned exclusively by ui/keyboard.
// This helper must never write topicSetup.scrollTop while a keyboard session
// is opening/open/closing, because that scroll would feed back into viewport
// geometry and can make the composer bounce. On touch-only/mobile surfaces we
// therefore skip the assist altogether and let the browser + keyboard
// controller own focus reveal.

const TOPIC_SCROLL_ROOT = '#topicSetup, .topic-setup';
const TOPIC_COMPOSER = '#topicComposerRoot, #topicInputWrap';
const FOCUS_SETTLE_MS = 180;

function keyboardEngaged() {
  const root = document.documentElement;
  const dataset = root && root.dataset ? root.dataset : {};
  if (dataset.keyboardOpen === 'true') return true;
  if (dataset.keyboardPhase && dataset.keyboardPhase !== 'closed') return true;
  if (dataset.keyboardMode && dataset.keyboardMode !== 'unknown') return true;
  return false;
}

function touchKeyboardEnvironment() {
  const root = document.documentElement;
  if (root?.classList?.contains('is-native-app')) return true;
  try {
    return Boolean(
      window.matchMedia?.('(pointer: coarse)').matches
      && window.matchMedia?.('(hover: none)').matches
    );
  } catch {
    return false;
  }
}

function ensureTopicComposerVisible() {
  /* The keyboard controller is authoritative. Never add a second scroll
     timeline while it owns the focus edge. Touch-only devices are skipped
     as well because their IME geometry can arrive later than focusin. */
  if (keyboardEngaged() || touchKeyboardEnvironment()) return;

  const active = document.activeElement;
  if (!active) return;
  const composer = active.closest ? active.closest(TOPIC_COMPOSER) : null;
  if (!composer) return;
  const topic = composer.closest(TOPIC_SCROLL_ROOT);
  if (!topic || typeof topic.getBoundingClientRect !== 'function') return;

  const viewport = window.visualViewport;
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
}

let timer = 0;
function onFocusIn() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = 0;
    try { ensureTopicComposerVisible(); } catch (_) { /* detached */ }
  }, FOCUS_SETTLE_MS);
}

export function initTopicFocusAssist() {
  document.addEventListener('focusin', onFocusIn);
  return () => {
    if (timer) { clearTimeout(timer); timer = 0; }
    document.removeEventListener('focusin', onFocusIn);
  };
}
