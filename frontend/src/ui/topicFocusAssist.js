// src/ui/topicFocusAssist.js — keep the topic-setup composer inside the
// visible viewport when it takes focus WITHOUT a software keyboard.
//
// The topic landing is its own scroll container (.topic-setup), so the
// browser's native scroll-into-view-on-focus does not apply. When the
// keyboard is open — or already opening — the animated --keyboard-inset
// padding is the sole avoidance mechanism, and a scrollTop write here
// would fight that animation frame by frame. So this module only assists
// in the focus-without-keyboard case (desktop, hardware keyboard,
// tap-to-focus on a partially off-screen input).
//
// The check runs ~140ms after focusin: that is late enough for every
// platform's keyboard geometry (visualViewport shrink or pan, and the
// controller's data-keyboard-phase) to have reported, so the assist can
// never race the first lift frames.

const TOPIC_SCROLL_ROOT = '#topicSetup, .topic-setup';
const TOPIC_COMPOSER = '#topicComposerRoot, #topicInputWrap';

/* Delay long enough for the keyboard's first geometry events to land. */
const FOCUS_SETTLE_MS = 140;
/* A viewport that has already shrunk or panned by more than this is a
   keyboard in flight — the inset padding owns the composer position. */
const SHRINK_PX = 48;
const PAN_PX = 8;

function keyboardEngaged() {
  /* data-keyboard-phase is owned by ui/keyboard. Anything other than
     'closed' means the inset padding owns the composer position. */
  const phase = document.documentElement && document.documentElement.dataset
    ? document.documentElement.dataset.keyboardPhase
    : 'closed';
  if (phase && phase !== 'closed') return true;
  const viewport = window.visualViewport;
  if (!viewport) return false;
  if ((Number(viewport.offsetTop) || 0) > PAN_PX) return true;
  return (window.innerHeight - (Number(viewport.height) || 0)) > SHRINK_PX;
}

function ensureTopicComposerVisible() {
  const active = document.activeElement;
  if (!active || keyboardEngaged()) return;
  const composer = active.closest
    ? active.closest(TOPIC_COMPOSER)
    : null;
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
  /* Defer past the focus ring layout AND the platform's first keyboard
     geometry report — the early check cannot tell "no keyboard" from
     "keyboard hasn't reported yet", and only the former should scroll. */
  if (timer) return;
  timer = setTimeout(() => {
    timer = 0;
    try { ensureTopicComposerVisible(); } catch (_) { /* detached */ }
  }, FOCUS_SETTLE_MS);
}

export function initTopicFocusAssist() {
  document.addEventListener('focusin', onFocusIn);
  return () => {
    if (timer) clearTimeout(timer);
    document.removeEventListener('focusin', onFocusIn);
  };
}
