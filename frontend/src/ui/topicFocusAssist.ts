// Desktop/hardware-keyboard visibility assist.
//
// Mobile software-keyboard movement is owned exclusively by ui/keyboard.
// This helper must never write topicSetup.scrollTop while a keyboard session
// is opening/open/closing, because that scroll would feed back into viewport
// geometry and can make the composer bounce. On touch-only/mobile surfaces we
// therefore skip the assist altogether and let the browser + keyboard
// controller own focus reveal.

const TOPIC_SCROLL_ROOT = '#topicSetup, .topic-setup';
const TOPIC_COMPOSER = '#composerRoot, #composerInputWrap';
const FOCUS_SETTLE_MS = 180;

interface VisibilityBounds {
  top: number;
  bottom: number;
}

function keyboardEngaged(): boolean {
  const dataset = document.documentElement.dataset;
  return dataset.keyboardOpen === 'true'
    || Boolean(dataset.keyboardPhase && dataset.keyboardPhase !== 'closed')
    || Boolean(dataset.keyboardMode && dataset.keyboardMode !== 'unknown');
}

function touchKeyboardEnvironment(): boolean {
  if (document.documentElement.classList.contains('is-native-app')) return true;
  try {
    return Boolean(
      window.matchMedia?.('(pointer: coarse)').matches
      && window.matchMedia?.('(hover: none)').matches,
    );
  } catch {
    return false;
  }
}

function focusedTopicComposer(): { composer: Element; topic: HTMLElement } | null {
  const active = document.activeElement;
  const composer = active?.closest(TOPIC_COMPOSER);
  const topic = composer?.closest(TOPIC_SCROLL_ROOT);
  if (!composer || !(topic instanceof HTMLElement) || typeof topic.getBoundingClientRect !== 'function') {
    return null;
  }
  return { composer, topic };
}

function visibilityBounds(): VisibilityBounds | null {
  const viewport = window.visualViewport;
  const offsetTop = viewport ? Number(viewport.offsetTop) || 0 : 0;
  const height = viewport && Number(viewport.height) > 0
    ? Number(viewport.height)
    : Number(window.innerHeight);
  if (!Number.isFinite(height) || height <= 0) return null;
  return { top: offsetTop + 8, bottom: offsetTop + height - 16 };
}

function scrollDelta(rect: DOMRect, bounds: VisibilityBounds): number {
  if (rect.bottom > bounds.bottom) return rect.bottom - bounds.bottom;
  if (rect.top < bounds.top) return rect.top - bounds.top;
  return 0;
}

function applyTopicScroll(topic: HTMLElement, delta: number): void {
  if (Math.abs(delta) < 1) return;
  const maxScrollTop = Math.max(0, topic.scrollHeight - topic.clientHeight);
  topic.scrollTop = Math.min(maxScrollTop, Math.max(0, topic.scrollTop + delta));
}

function ensureTopicComposerVisible(): void {
  /* The keyboard controller is authoritative. Never add a second scroll
     timeline while it owns the focus edge. Touch-only devices are skipped
     as well because their IME geometry can arrive later than focusin. */
  if (keyboardEngaged() || touchKeyboardEnvironment()) return;
  const target = focusedTopicComposer();
  const bounds = visibilityBounds();
  if (!target || !bounds) return;
  applyTopicScroll(target.topic, scrollDelta(target.composer.getBoundingClientRect(), bounds));
}

let timer: ReturnType<typeof setTimeout> | null = null;

function onFocusIn(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    try { ensureTopicComposerVisible(); } catch { /* detached focus target is no longer scrollable */ }
  }, FOCUS_SETTLE_MS);
}

export function initTopicFocusAssist(): () => void {
  document.addEventListener('focusin', onFocusIn);
  return () => {
    if (timer) { clearTimeout(timer); timer = null; }
    document.removeEventListener('focusin', onFocusIn);
  };
}
