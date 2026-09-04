// Time-aware personalized greeting on the landing screen. The server can add
// an IP-derived IANA time zone to CURRENT_USER; the browser time zone is the
// resilient fallback when a deployment proxy does not expose geo metadata.

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

function _validTimeZone(value) {
  if (!value) return "";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: String(value) }).format();
    return String(value);
  } catch (_) {
    return "";
  }
}

function _visitorTimeZone() {
  var user = (typeof window !== "undefined") ? window.CURRENT_USER : null;
  var serverZone = _validTimeZone(user && user.timeZone);
  if (serverZone) return serverZone;
  try {
    return _validTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch (_) {
    return "";
  }
}

function _hourInTimeZone(timeZone) {
  try {
    var parts = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: timeZone || undefined,
    }).formatToParts(new Date());
    var hourPart = parts.find(function (part) { return part.type === "hour"; });
    var hour = parseInt(hourPart && hourPart.value, 10);
    if (!isNaN(hour)) return hour;
  } catch (_) { /* use local clock below */ }
  return new Date().getHours();
}

function _chatGreetingKey() {
  var hour = _hourInTimeZone(_visitorTimeZone());
  if (hour >= 5 && hour < 12) return "greeting.chat.morning";
  if (hour >= 12 && hour < 17) return "greeting.chat.afternoon";
  if (hour >= 17 && hour < 22) return "greeting.chat.evening";
  return "greeting.chat.late";
}

export function renderGreeting() {
  var el = document.getElementById("topicTitle");
  if (!el) return;
  var mode = (typeof window !== "undefined" && window.appMode) || "chat";
  var key = mode === "tutor" ? "greeting.tutor" : _chatGreetingKey();
  var fallback = mode === "tutor" ? "Let's explore, {name}." : "Welcome back, {name}!";
  var tmpl = typeof window.t === "function" ? window.t(key) : fallback;
  if (!tmpl || tmpl === key) tmpl = fallback;
  el.textContent = tmpl.replace("{name}", _greetingFirstName());
  el.classList.add("greeting");
}

// Consumers import renderGreeting directly (window bridge removed in
// the window-dead-bridge batch 2).
