// Static landing greeting (ChatGPT parity): one short line per mode.
// Time-of-day and name personalization were removed — they made the hero
// read as two clauses ("下午好，Jiacheng。准备好开始了吗？") and fought
// the reference composition, which is a single calm line.

export function renderGreeting() {
  var el = document.getElementById("topicTitle");
  if (!el) return;
  var mode = (typeof window !== "undefined" && window.appMode) || "chat";
  var key = mode === "tutor" ? "greeting.tutor" : "greeting.chat";
  var fallback = mode === "tutor" ? "Let's explore." : "Where should we begin?";
  var tmpl = typeof window.t === "function" ? window.t(key) : fallback;
  if (!tmpl || tmpl === key) tmpl = fallback;
  el.textContent = tmpl;
  el.classList.add("greeting");
  /* The previous heuristic suggestions (mountHomeSuggestions) were removed
     — they read as noise on the landing surface and conflicted with the
     quick-actions reference block. See src/ui/homeSuggestions.ts. */
}

// Consumers import renderGreeting directly (window bridge removed in
// the window-dead-bridge batch 2).
