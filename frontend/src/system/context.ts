/* Dynamic, non-authoritative location context. Visual routing lives in the
 * shared prompt rather than this browser-derived context block. */
interface GeoInfo {
  country: string;
  region: string;
  city: string;
  tz: string;
  locale: string;
}

let _geoInfo: GeoInfo = { country: '', region: '', city: '', tz: '', locale: '' };
let _geoFetched = false;

export function resetGeoInfo(options?: { clearCache?: boolean }): void {
  _geoInfo = { country: '', region: '', city: '', tz: '', locale: '' };
  _geoFetched = false;
  if (options && options.clearCache) {
    try { localStorage.removeItem('socrates-geo'); } catch (_) { /* noop */ }
  }
}

function deriveLocaleInfo(): void {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
    if (locale && typeof Intl.Locale === 'function') {
      const parsed = new Intl.Locale(locale);
      if (parsed.region) _geoInfo.country = parsed.region;
      if (parsed.language) _geoInfo.locale = parsed.language;
    }
  } catch (_) { /* noop */ }
}

export function fetchGeoInfo(): void {
  if (_geoFetched) return;
  _geoFetched = true;
  try { _geoInfo.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (_) { /* noop */ }
  deriveLocaleInfo();
  try { localStorage.setItem('socrates-geo', JSON.stringify(_geoInfo)); } catch (_) { /* noop */ }
}

export function getSystemContext(): string {
  try {
    fetchGeoInfo();
    const now = new Date();
    let ctx = 'Today is ' + now.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }) + '. Local time: ' + now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    if (_geoInfo.tz) ctx += ' (' + _geoInfo.tz + ')';
    ctx += '.';
    if (_geoInfo.country) ctx += ' User location: ' + _geoInfo.country + '.';
    if (_geoInfo.locale) ctx += ' Locale: ' + _geoInfo.locale + '.';
    return ctx + '\n\nUse this context only when it is relevant to the answer.';
  } catch (_) {
    return '';
  }
}
