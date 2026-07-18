/* Dynamic, non-authoritative location context. Visual routing lives in the
 * shared prompt rather than this browser-derived context block. */
var _geoInfo = { country: "", region: "", city: "", tz: "", locale: "" };
var _geoFetched = false;

export function resetGeoInfo(options) {
  _geoInfo = { country: "", region: "", city: "", tz: "", locale: "" };
  _geoFetched = false;
  if (options && options.clearCache) {
    try { localStorage.removeItem("socrates-geo"); } catch (_) {}
  }
}

function deriveLocaleInfo() {
  try {
    var locale = Intl.DateTimeFormat().resolvedOptions().locale || "";
    if (locale && typeof Intl.Locale === "function") {
      var parsed = new Intl.Locale(locale);
      if (parsed.region) _geoInfo.country = parsed.region;
      if (parsed.language) _geoInfo.locale = parsed.language;
    }
  } catch (_) {}
}

export function fetchGeoInfo() {
  if (_geoFetched) return;
  _geoFetched = true;
  try { _geoInfo.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (_) {}
  deriveLocaleInfo();
  try { localStorage.setItem("socrates-geo", JSON.stringify(_geoInfo)); } catch (_) {}
}

export function getSystemContext() {
  try {
    fetchGeoInfo();
    var now = new Date();
    var ctx = "Today is " + now.toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    }) + ". Local time: " + now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    if (_geoInfo.tz) ctx += " (" + _geoInfo.tz + ")";
    ctx += ".";
    if (_geoInfo.country) ctx += " User location: " + _geoInfo.country + ".";
    if (_geoInfo.locale) ctx += " Locale: " + _geoInfo.locale + ".";
    return ctx + "\n\nUse this context only when it is relevant to the answer.";
  } catch (_) {
    return "";
  }
}
