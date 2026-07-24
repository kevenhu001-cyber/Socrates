// src/ui/greeting.ts — ChatGPT-style personalized greeting on the landing screen.
// Writes "Hello, {first-name}." / "你好，{first-name}。" into #topicTitle.
// Reads CURRENT_USER.displayName (already populated by profile.js's
// renderUserFooter()). Falls back to the localized "Guest" / "访客" string
// when no user is signed in. The "{name}" placeholder is substituted
// manually so the rest of the i18n pipeline keeps working unchanged.

function _greetingFirstName(): string {
  const user = (typeof window !== "undefined") ? (window as any).CURRENT_USER : null;
  const t = (typeof window === "undefined" || typeof (window as any).t !== "function")
    ? null : (window as any).t as (...args: string[]) => string;
  let name: string =
    (user && (user.displayName || user.name || user.email)) ||
    (t ? t("greeting.guest") : "Guest");
  name = String(name || "").trim();
  if (!name) return t ? t("greeting.guest") : "Guest";
  // Take only the first whitespace-separated token ("Adex Hu" -> "Adex").
  return name.split(/\s+/)[0];
}

export function renderGreeting(): void {
  const el = document.getElementById("topicTitle");
  if (!el) return;
  const t = (typeof window === "undefined" || typeof (window as any).t !== "function")
    ? null : (window as any).t as (...args: string[]) => string;
  const mode = (typeof window !== "undefined" && (window as any).appMode as string) || "chat";
  const key = mode === "tutor" ? "greeting.tutor" : "greeting.chat";
  const tmpl = t ? t(key) : (key === "greeting.tutor" ? "Let's explore, {name}." : "Hello, {name}.");
  el.textContent = tmpl.replace("{name}", _greetingFirstName());
  el.classList.add("greeting");
}

// Re-export on window so inline handlers (e.g. profile updates triggered
// from main.js) can refresh the greeting without an import dance.
if (typeof window !== "undefined") {
  (window as any).renderGreeting = renderGreeting;
}
