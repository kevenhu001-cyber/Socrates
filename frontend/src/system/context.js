var _geoInfo = { country: "", region: "", city: "", tz: "" };
var _geoFetched = false;

export function resetGeoInfo(options) {
  _geoInfo = { country: "", region: "", city: "", tz: "" };
  _geoFetched = false;
  if (options && options.clearCache) {
    try { localStorage.removeItem("socrates-geo"); } catch (_) {}
  }
}

export function fetchGeoInfo() {
  if (_geoFetched) return;
  _geoFetched = true;
  try {
    var cached = localStorage.getItem("socrates-geo");
    if (cached) {
      _geoInfo = JSON.parse(cached);
      return;
    }
  } catch (_) {}
  try { _geoInfo.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (_) {}
  try {
    fetch("https://ip-api.com/json/?fields=country,regionName,city,timezone", { mode: "cors" }).then(function (r) {
      if (!r.ok) return;
      return r.json().then(function (d) {
        if (!d) return;
        _geoInfo.country = d.country || "";
        _geoInfo.region = d.regionName || "";
        _geoInfo.city = d.city || "";
        _geoInfo.tz = d.timezone || _geoInfo.tz;
        try { localStorage.setItem("socrates-geo", JSON.stringify(_geoInfo)); } catch (_) {}
      });
    }).catch(function () {});
  } catch (_) {}
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
    if (_geoInfo.city && _geoInfo.country) {
      ctx += " Estimated user location: " + _geoInfo.city;
      if (_geoInfo.region && _geoInfo.region !== _geoInfo.city) ctx += ", " + _geoInfo.region;
      ctx += ", " + _geoInfo.country + ".";
    } else if (_geoInfo.country) {
      ctx += " Estimated user location: " + _geoInfo.country + ".";
    }
    ctx += "\n\nUse the date and location above to give contextually appropriate answers (e.g. current events, local relevance, timezone-aware time references). If a question asks about something time-sensitive, factor in today's date.";
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
