/* system/context.js — system context (date, time, location) used as
 * the first user-context block in the LLM prompt. Location is now
 * derived from the browser's Intl API only — the previous version
 * also called out to ip-api.com for country / city, but that
 * service rate-limits anonymous requests with HTTP 403 and the
 * fallback HTTP 200/4xx in the dev-tools console created a noisy,
 * user-visible "Failed to load resource" error every time the
 * user opened a chat. The Intl-based timezone + locale provide
 * enough fidelity for the model's context-aware answers without
 * any third-party network call. */

var _geoInfo = { country: "", region: "", city: "", tz: "", locale: "" };
var _geoFetched = false;

export function resetGeoInfo(options) {
  _geoInfo = { country: "", region: "", city: "", tz: "", locale: "" };
  _geoFetched = false;
  if (options && options.clearCache) {
    try { localStorage.removeItem("socrates-geo"); } catch (_) {}
  }
}

/* Derive a coarse city / region hint from the browser's locale
 * string (e.g. "zh-CN" → country "CN"). We don't get a city this
 * way, but we can get a country code which is enough to ask the
 * LLM "the user is likely in <country>" without a third-party
 * request. The Intl.Locale API is widely supported (Chrome 74+,
   Firefox 75+, Safari 14.1+). */
function deriveLocaleInfo() {
  try {
    var locales = (typeof Intl !== "undefined" && Intl.DateTimeFormat)
      ? Intl.DateTimeFormat().resolvedOptions().locale
      : "";
    if (locales && typeof Intl.Locale === "function") {
      try {
        var loc = new Intl.Locale(locales);
        if (loc.region && !_geoInfo.country) _geoInfo.country = loc.region;
        if (loc.language && !_geoInfo.locale) _geoInfo.locale = loc.language;
      } catch (_) { /* Intl.Locale can throw on malformed inputs */ }
    }
  } catch (_) {}
}

/* Populate _geoInfo from browser APIs only. We deliberately do NOT
 * call any third-party service (ip-api.com, ipwho.is, etc.) — they
 * rate-limit anonymous requests and produce user-visible 403/429
 * errors in the console. The Intl.DateTimeFormat timezone is the
   most reliable signal and the only one the model strictly needs
   for time-aware answers. */
export function fetchGeoInfo() {
  if (_geoFetched) return;
  _geoFetched = true;
  try {
    var cached = localStorage.getItem("socrates-geo");
    if (cached) {
      try { _geoInfo = JSON.parse(cached); return; } catch (_) {}
    }
  } catch (_) {}
  try { _geoInfo.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (_) {}
  deriveLocaleInfo();
  try { localStorage.setItem("socrates-geo", JSON.stringify(_geoInfo)); } catch (_) {}
}

export function getSystemContext() {
  try {
    fetchGeoInfo();
    var ctx = "";
    var now = new Date();
    var dateStr = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    var timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    ctx += "Today is " + dateStr + ". Local time: " + timeStr;
    if (_geoInfo.tz) ctx += " (" + _geoInfo.tz + ")";
    ctx += ".";
    /* If Intl.Locale gave us a country code (e.g. "CN", "US"),
       surface it. We avoid claiming a city unless we have one —
       an incorrect city would mislead the LLM more than no city. */
    if (_geoInfo.country) {
      ctx += " User locale region: " + _geoInfo.country + ".";
    }
    if (_geoInfo.locale) {
      ctx += " Locale: " + _geoInfo.locale + ".";
    }
    ctx += "\n\nUse the date and locale above to give contextually appropriate answers (e.g. current events, local relevance, timezone-aware time references). If a question asks about something time-sensitive, factor in today's date.";
    ctx += "\n\n## Canvas tool\n\nFor any visual answer (chart, diagram, animation, simulation, comparison), output the visualization directly as a Canvas card.\n\n" +
      "Use a single ```html ... ``` fence containing a self-contained HTML/CSS/JS snippet. The system renders it inside a sandboxed iframe; the user sees a Canvas card, not source code.\n\n" +
      "**When to use it — be proactive.** A visual is better than text when:\n" +
      "- You draw a chart, plot, graph, diagram, animation, comparison, timeline, or flow\n" +
      "- The answer involves structure, layout, or relationships that benefit from being seen\n" +
      "- You would otherwise need 5+ lines to describe a visual pattern\n" +
      "- You want to illustrate a concept with an interactive or animated example\n\n" +
      "**Structure:**\n" +
      "1. Fence: ```html (only). NOT ```viz, NOT ```javascript, NOT ```chart.\n" +
      "2. Content: inner HTML only. No <!DOCTYPE>, <html>, <head>, or <body>.\n" +
      "3. All CSS and JS must be inline. No external CDN, no <link>, no fetch.\n" +
      "4. Theme: define colors in CSS and use `prefers-color-scheme: dark` to override.\n" +
      "5. Use plain ES5 JS (var, function) for sandbox compatibility.\n" +
      "6. Keep it minimal: no extra fonts, no shadows, no decorative chrome.\n" +
      "7. Do NOT use emoji anywhere in the snippet — not in text, labels, titles, or as chart elements. Use text or shapes instead.\n" +
      "8. The ```html block IS the answer. No prose, no explanation, no other ``` fences, no markdown headings inside the snippet.\n\n" +
      "**Minimal example:**\n" +
      "```html\n" +
      "<style>body{font:14px sans-serif;padding:12px;color:#333;background:#fff}" +
      "@media(prefers-color-scheme:dark){body{color:#eee;background:#1c1d22}}" +
      ".bar{display:inline-block;width:30px;margin:0 4px;background:#4a9eff;border-radius:3px 3px 0 0;vertical-align:bottom}</style>\n" +
      "<h3>Sample</h3>\n<div id='root'><\/div>\n<script>\n" +
      "var data=[30,80,45,60];\n" +
      "var root=document.getElementById('root');\n" +
      "for(var i=0;i<data.length;i++){var b=document.createElement('div');b.className='bar';b.style.height=data[i]+'px';b.textContent=data[i];root.appendChild(b)}\n" +
      "<\/script>\n```";
    return ctx;
  } catch (_) {
    return "";
  }
}
