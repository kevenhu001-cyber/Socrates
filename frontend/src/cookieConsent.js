/* Cookie consent manager
 *
 * Shows a consent banner until the visitor makes a choice, then persists
 * that choice (localStorage + a first-party consent cookie shared across
 * app.topodrive.top and topodrive.top). Non-essential cookies written via
 * `document.cookie` from client code are blocked until the visitor accepts
 * non-essential cookies; `sid`, `csrf`, and the consent cookie itself are
 * always treated as strictly necessary.
 *
 * There are currently no non-essential cookies in the product. This module
 * is the gate that keeps it that way: the first analytics/marketing cookie
 * a future script tries to write will be dropped until the user clicks
 * "Accept all".
 */

export var CONSENT_KEY = 'socrates-cookie-consent';
export var CONSENT_COOKIE = 'socrates_consent';
export var CONSENT_VERSION = 1;
export var CONSENT_ACCEPT = 'accept';
export var CONSENT_ESSENTIAL = 'essential';

var ESSENTIAL_COOKIE_NAMES = new Set([
  'sid',
  'csrf',
  'xsrf-token',
  CONSENT_COOKIE,
]);

var _cookieGuardInstalled = false;
var _cookieGuardDocument = null;

function normalizePreference(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.v !== CONSENT_VERSION) return null;
  if (typeof raw.nonEssential !== 'boolean') return null;
  return {
    v: CONSENT_VERSION,
    choice: raw.nonEssential ? CONSENT_ACCEPT : CONSENT_ESSENTIAL,
    nonEssential: raw.nonEssential,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  };
}

function readCookieValue(name) {
  if (typeof document === 'undefined') return null;
  try {
    var escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var m = document.cookie.match(new RegExp('(?:^|;\\s*)' + escaped + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  } catch (_) {
    return null;
  }
}

export function getConsentPreference() {
  var pref = null;
  try {
    var raw = localStorage.getItem(CONSENT_KEY);
    if (raw) {
      try {
        pref = normalizePreference(JSON.parse(raw));
      } catch (_) { /* malformed local entry — fall through to cookie */ }
    }
  } catch (_) { /* storage blocked */ }
  if (!pref) {
    var cookieRaw = readCookieValue(CONSENT_COOKIE);
    if (cookieRaw) {
      try {
        pref = normalizePreference(JSON.parse(cookieRaw));
      } catch (_) { /* malformed cookie — treat as no choice */ }
    }
  }
  if (pref) {
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify(pref)); } catch (_) {}
  }
  return pref;
}

export function hasConsent() {
  return getConsentPreference() !== null;
}

export function allowsNonEssential() {
  var pref = getConsentPreference();
  return !!(pref && pref.nonEssential);
}

export function isEssentialCookieName(name) {
  return ESSENTIAL_COOKIE_NAMES.has(String(name || '').trim().toLowerCase());
}

function sharedDomainSuffix() {
  if (typeof location === 'undefined' || !location.hostname) return '';
  var host = String(location.hostname).toLowerCase();
  if (host === 'topodrive.top' || host === 'www.topodrive.top' || host === 'app.topodrive.top') {
    return '; domain=.topodrive.top';
  }
  return '';
}

function secureSuffix() {
  if (typeof location === 'undefined' || !location.protocol) return '';
  return location.protocol === 'https:' ? '; Secure' : '';
}

function consentCookieString(pref) {
  var value = encodeURIComponent(JSON.stringify(pref));
  return CONSENT_COOKIE + '=' + value +
    '; path=/; max-age=31536000; SameSite=Lax' +
    sharedDomainSuffix() + secureSuffix();
}

export function setConsentPreference(choice) {
  var pref = {
    v: CONSENT_VERSION,
    choice: choice === CONSENT_ACCEPT ? CONSENT_ACCEPT : CONSENT_ESSENTIAL,
    nonEssential: choice === CONSENT_ACCEPT,
    updatedAt: new Date().toISOString(),
  };
  try { localStorage.setItem(CONSENT_KEY, JSON.stringify(pref)); } catch (_) {}
  try { document.cookie = consentCookieString(pref); } catch (_) {}
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('socrates:cookie-consent', {
        detail: { preference: pref },
      }));
    }
  } catch (_) {}
  return pref;
}

function parseCookieAssignment(raw) {
  var s = String(raw || '');
  var first = s.split(';')[0] || '';
  var eq = first.indexOf('=');
  if (eq <= 0) return null;
  var name = first.slice(0, eq).trim();
  var value = first.slice(eq + 1).trim();
  var lower = s.toLowerCase();
  var maxAgeMatch = /(?:^|;\s*)max-age\s*=\s*(-?\d+)/i.exec(lower);
  var isDeletion = value === '' ||
    (maxAgeMatch && Number(maxAgeMatch[1]) <= 0) ||
    /expires\s*=\s*thu,\s*01\s*jan\s*1970/i.test(lower);
  return { name: name, value: value, isDeletion: isDeletion };
}

function isCookieWriteAllowed(raw) {
  var parsed = parseCookieAssignment(raw);
  if (!parsed) return true;
  if (isEssentialCookieName(parsed.name)) return true;
  if (parsed.isDeletion) return true;
  return allowsNonEssential();
}

export function installCookieGuard() {
  if (_cookieGuardInstalled && _cookieGuardDocument === document) return;
  if (typeof document === 'undefined') return;
  var proto = Object.getPrototypeOf(document);
  var desc = Object.getOwnPropertyDescriptor(document, 'cookie') ||
    (proto && Object.getOwnPropertyDescriptor(proto, 'cookie')) ||
    (typeof Document !== 'undefined' && Object.getOwnPropertyDescriptor(Document.prototype, 'cookie'));
  var nativeGet = desc && desc.get ? desc.get : null;
  var nativeSet = desc && desc.set ? desc.set : null;
  try {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      enumerable: !!(desc && desc.enumerable),
      get: function () {
        return nativeGet ? nativeGet.call(document) : '';
      },
      set: function (value) {
        if (isCookieWriteAllowed(value)) {
          if (nativeSet) nativeSet.call(document, value);
        }
      },
    });
    _cookieGuardInstalled = true;
    _cookieGuardDocument = document;
  } catch (_) { /* unsupported host — skip the client-side guard */ }
}

function localT(key) {
  if (typeof window !== 'undefined' && typeof window.t === 'function') {
    try {
      var v = window.t(key);
      if (typeof v === 'string' && v !== key) return v;
    } catch (_) {}
  }
  var fallback = {
    'consent.title': 'We respect your privacy',
    'consent.message': 'We use strictly necessary cookies to make Socrates work. Non-essential cookies (for example analytics) are only placed after you choose to allow them.',
    'consent.accept': 'Accept all',
    'consent.essential': 'Essential only',
    'consent.learnMore': 'Privacy policy',
  };
  return fallback[key] || key;
}

export function initCookieConsent(options) {
  options = options || {};
  if (typeof document === 'undefined') return { shown: false };
  if (!document.body) {
    if (!options._queued) {
      options._queued = true;
      document.addEventListener('DOMContentLoaded', function () {
        initCookieConsent(options);
      }, { once: true });
    }
    return { shown: false };
  }
  if (document.getElementById('socratesCookieConsent')) return { shown: false };
  if (getConsentPreference()) return { shown: false };

  var banner = document.createElement('div');
  banner.id = 'socratesCookieConsent';
  banner.className = 'socrates-cookie-consent';
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', localT('consent.title'));
  banner.setAttribute('data-testid', 'cookie-consent-banner');

  var title = document.createElement('strong');
  title.className = 'socrates-cookie-consent-title';
  title.textContent = localT('consent.title');

  var message = document.createElement('p');
  message.className = 'socrates-cookie-consent-message';
  message.textContent = localT('consent.message');

  var actions = document.createElement('div');
  actions.className = 'socrates-cookie-consent-actions';

  function choose(choice) {
    setConsentPreference(choice);
    if (banner.parentNode) banner.parentNode.removeChild(banner);
  }

  var essentialBtn = document.createElement('button');
  essentialBtn.type = 'button';
  essentialBtn.className = 'socrates-cookie-consent-btn secondary';
  essentialBtn.textContent = localT('consent.essential');
  essentialBtn.setAttribute('data-consent-choice', CONSENT_ESSENTIAL);
  essentialBtn.addEventListener('click', function () { choose(CONSENT_ESSENTIAL); });

  var acceptBtn = document.createElement('button');
  acceptBtn.type = 'button';
  acceptBtn.className = 'socrates-cookie-consent-btn primary';
  acceptBtn.textContent = localT('consent.accept');
  acceptBtn.setAttribute('data-consent-choice', CONSENT_ACCEPT);
  acceptBtn.addEventListener('click', function () { choose(CONSENT_ACCEPT); });

  actions.appendChild(essentialBtn);
  actions.appendChild(acceptBtn);

  var privacyUrl = options.privacyUrl || '/privacy';
  var link = document.createElement('a');
  link.className = 'socrates-cookie-consent-link';
  link.href = privacyUrl;
  link.textContent = localT('consent.learnMore');
  if (/^https?:/i.test(privacyUrl)) {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }

  banner.appendChild(title);
  banner.appendChild(message);
  banner.appendChild(actions);
  banner.appendChild(link);
  document.body.appendChild(banner);
  return { shown: true };
}

/* Install the guard as soon as the module loads so any client-side
   non-essential cookie write is blocked before the banner can be shown. */
installCookieGuard();

if (typeof window !== 'undefined') {
  window.__socratesConsent = {
    getPreference: getConsentPreference,
    hasConsent: hasConsent,
    allowsNonEssential: allowsNonEssential,
    setPreference: setConsentPreference,
    isEssentialCookieName: isEssentialCookieName,
  };
}
