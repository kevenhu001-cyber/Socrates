// src/ui/greeting.js — ChatGPT-style personalized greeting on the landing screen.
// Writes "Hello, {first-name}." / "你好，{first-name}。" into #topicTitle.
// Reads CURRENT_USER.displayName (already populated by profile.js's
// renderUserFooter()). Falls back to the localized "Guest" / "访客" string
// when no user is signed in. The "{name}" placeholder is substituted
// manually so the rest of the i18n pipeline keeps working unchanged.

function _greetingFirstName() {
  var user = (typeof window !== "undefined") ? window.CURRENT_USER : null;
  var name =
    (user && (user.displayName || user.name || user.email)) ||
    (typeof window.t === "function" ? window.t("greeting.guest") : "Guest");
  name = String(name || "").trim();
  if (!name) return typeof window.t === "function" ? window.t("greeting.guest") : "Guest";
  // Take only the first whitespace-separated token ("Adex Hu" -> "Adex").
  return name.split(/\s+/)[0];
}

export function renderGreeting() {
  var el = document.getElementById("topicTitle");
  if (!el) return;
  var mode = (typeof window !== "undefined" && window.appMode) || "chat";
  var key = mode === "tutor" ? "greeting.tutor" : "greeting.chat";
  var tmpl = typeof window.t === "function" ? window.t(key) : (key === "greeting.tutor" ? "Let's explore, {name}." : "You're here!");
  el.textContent = tmpl.replace("{name}", _greetingFirstName());
  el.classList.add("greeting");
}

// Re-export on window so inline handlers (e.g. profile updates triggered
// from main.js) can refresh the greeting without an import dance.
if (typeof window !== "undefined") {
  window.renderGreeting = renderGreeting;
}
