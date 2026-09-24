// Landing greeting: one short line per mode, drawn at random from the
// greeting.{chat,tutor}.N pool so the home surface greets differently on
// each open. Time-of-day and name personalization stay removed — they made
// the hero read as two clauses ("下午好，Jiacheng。准备好开始了吗？") and
// fought the reference composition, which is a single calm line.

var POOL_SCAN = 16;
var _lastPick = { chat: -1, tutor: -1 };

function _t(key) {
  if (typeof window.t === "function") {
    var s = window.t(key);
    if (s && s !== key) return s;
  }
  return "";
}

/* Collect every numbered variant the locale defines, then append the
   legacy single key so older locales still contribute their one line. */
function _pool(mode) {
  var base = mode === "tutor" ? "greeting.tutor" : "greeting.chat";
  var pool = [];
  for (var i = 0; i < POOL_SCAN; i++) {
    var v = _t(base + "." + i);
    if (v && pool.indexOf(v) < 0) pool.push(v);
  }
  var single = _t(base);
  if (single && pool.indexOf(single) < 0) pool.push(single);
  return pool;
}

export function renderGreeting() {
  var el = document.getElementById("topicTitle");
  if (!el) return;
  var mode = (typeof window !== "undefined" && window.appMode) || "chat";
  var pool = _pool(mode);
  var text = mode === "tutor" ? "Let's explore." : "Ready when you are";
  if (pool.length) {
    var idx = Math.floor(Math.random() * pool.length);
    /* Back-to-back duplicates read as a stuck render, not a fresh open —
       nudge the wheel once when the same slot comes up again. */
    if (pool.length > 1 && idx === _lastPick[mode]) idx = (idx + 1) % pool.length;
    _lastPick[mode] = idx;
    text = pool[idx];
  }
  el.textContent = text;
  el.classList.add("greeting");
  /* The previous heuristic suggestions (mountHomeSuggestions) were removed
     — they read as noise on the landing surface and conflicted with the
     quick-actions reference block. See src/ui/homeSuggestions.ts. */
}

// Consumers import renderGreeting directly (window bridge removed in
// the window-dead-bridge batch 2).
