
import { reportSwallow } from './util/reportSwallow.ts';
import { runtimeWindow as browserWindow } from "./types/runtimeWindow.ts";


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

export const CONSENT_KEY = 'socrates-cookie-consent';
export const CONSENT_COOKIE = 'socrates_consent';
export const CONSENT_VERSION = 1;
export const CONSENT_ACCEPT = 'accept';
export const CONSENT_ESSENTIAL = 'essential';

const ESSENTIAL_COOKIE_NAMES = new Set([
  'sid',
  'csrf',
  'xsrf-token',
  CONSENT_COOKIE,
]);

let _cookieGuardInstalled = false;
let _cookieGuardDocument: Document|null = null;
let _cookieConsentInitialized = false;
let _cookieConsentPrivacyUrl = '/privacy';
let _cookieConsentAuthPlacement = false;

function normalizePreference(raw: { v: number; nonEssential: any; updatedAt: any; }) {
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

function readCookieValue(name: string) {
  if (typeof document === 'undefined') return null;
  try {
    const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + escaped + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  } catch (_) {
    return null;
  }
}

export function getConsentPreference() {
  let pref = null;
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (raw) {
      try {
        pref = normalizePreference(JSON.parse(raw));
      } catch (_) { /* malformed local entry — fall through to cookie */ }
    }
  } catch (_) { /* storage blocked */ }
  if (!pref) {
    const cookieRaw = readCookieValue(CONSENT_COOKIE);
    if (cookieRaw) {
      try {
        pref = normalizePreference(JSON.parse(cookieRaw));
      } catch (_) { /* malformed cookie — treat as no choice */ }
    }
  }
  if (pref) {
    try { localStorage.setItem(CONSENT_KEY, JSON.stringify(pref)); } catch (error) { reportSwallow(error, 'cookieConsent.js:74', 'expected'); }
  }
  return pref;
}

export function hasConsent() {
  return getConsentPreference() !== null;
}

export function allowsNonEssential() {
  const pref = getConsentPreference();
  return !!(pref && pref.nonEssential);
}

export function isEssentialCookieName(name: string) {
  return ESSENTIAL_COOKIE_NAMES.has(String(name || '').trim().toLowerCase());
}

function sharedDomainSuffix() {
  if (typeof location === 'undefined' || !location.hostname) return '';
  const host = String(location.hostname).toLowerCase();
  if (host === 'topodrive.top' || host === 'www.topodrive.top' || host === 'app.topodrive.top') {
    return '; domain=.topodrive.top';
  }
  return '';
}

function secureSuffix() {
  if (typeof location === 'undefined' || !location.protocol) return '';
  return location.protocol === 'https:' ? '; Secure' : '';
}

function consentCookieString(pref: { v: number; choice: string; nonEssential: boolean; updatedAt: string; }) {
  const value = encodeURIComponent(JSON.stringify(pref));
  return CONSENT_COOKIE + '=' + value +
    '; path=/; max-age=31536000; SameSite=Lax' +
    sharedDomainSuffix() + secureSuffix();
}

export function setConsentPreference(choice: string) {
  const pref = {
    v: CONSENT_VERSION,
    choice: choice === CONSENT_ACCEPT ? CONSENT_ACCEPT : CONSENT_ESSENTIAL,
    nonEssential: choice === CONSENT_ACCEPT,
    updatedAt: new Date().toISOString(),
  };
  try { localStorage.setItem(CONSENT_KEY, JSON.stringify(pref)); } catch (error) { reportSwallow(error, 'cookieConsent.js:120', 'expected'); }
  try { document.cookie = consentCookieString(pref); } catch (error) { reportSwallow(error, 'cookieConsent.js:121', 'expected'); }
  try {
    if (typeof window !== 'undefined' && typeof browserWindow.dispatchEvent === 'function') {
      browserWindow.dispatchEvent(new CustomEvent('socrates:cookie-consent', {
        detail: { preference: pref },
      }));
    }
  } catch (error) { reportSwallow(error, 'cookieConsent.js:128'); }
  return pref;
}

function parseCookieAssignment(raw: any) {
  const s = String(raw || '');
  const first = s.split(';')[0] || '';
  const eq = first.indexOf('=');
  if (eq <= 0) return null;
  const name = first.slice(0, eq).trim();
  const value = first.slice(eq + 1).trim();
  const lower = s.toLowerCase();
  const maxAgeMatch = /(?:^|;\s*)max-age\s*=\s*(-?\d+)/i.exec(lower);
  const isDeletion = value === '' ||
    (maxAgeMatch && Number(maxAgeMatch[1]) <= 0) ||
    /expires\s*=\s*thu,\s*01\s*jan\s*1970/i.test(lower);
  return { name: name, value: value, isDeletion: isDeletion };
}

function isCookieWriteAllowed(raw: any) {
  const parsed = parseCookieAssignment(raw);
  if (!parsed) return true;
  if (isEssentialCookieName(parsed.name)) return true;
  if (parsed.isDeletion) return true;
  return allowsNonEssential();
}

export function installCookieGuard() {
  if (_cookieGuardInstalled && _cookieGuardDocument === document) return;
  if (typeof document === 'undefined') return;
  const proto = Object.getPrototypeOf(document);
  const desc = Object.getOwnPropertyDescriptor(document, 'cookie') ||
    (proto && Object.getOwnPropertyDescriptor(proto, 'cookie')) ||
    (typeof Document !== 'undefined' && Object.getOwnPropertyDescriptor(Document.prototype, 'cookie'));
  const nativeGet = desc && desc.get ? desc.get : null;
  const nativeSet = desc && desc.set ? desc.set : null;
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

/* Keep the first-visit banner visible without covering the auth form.  The
 * auth gate is a scroll container, so placing the banner in its flow lets a
 * visitor finish the sign-in form and then review consent below it.  Once the
 * app shell is active, move the React root back to body so the banner returns
 * to the compact fixed bottom treatment used by the product shell. */
export function syncCookieConsentPlacement(authVisible: boolean) {
  if (typeof document === 'undefined' || !document.body) return;
  const root = document.getElementById('cookieConsentReactRoot');
  const banner = document.getElementById('socratesCookieConsent');
  if (!banner) {
    _cookieConsentAuthPlacement = !!authVisible;
    return;
  }
  if (!root) return;
  const gate = document.getElementById('authGate');
  if (authVisible && gate) {
    gate.appendChild(root);
    banner.classList.add('socrates-cookie-consent--auth');
  } else {
    document.body.appendChild(root);
    banner.classList.remove('socrates-cookie-consent--auth');
  }
  _cookieConsentAuthPlacement = !!authVisible;
}

export function getCookieConsentPrivacyUrl() {
  return _cookieConsentPrivacyUrl;
}

export function getCookieConsentAuthPlacement() {
  return _cookieConsentAuthPlacement;
}

export function initCookieConsent(options: { _queued?: any; privacyUrl?: any; }) {
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
  if (_cookieConsentInitialized || document.getElementById('socratesCookieConsent')) return { shown: false };
  _cookieConsentInitialized = true;
  _cookieConsentPrivacyUrl = options.privacyUrl || '/privacy';
  if (getConsentPreference()) return { shown: false };
  const gate = document.getElementById('authGate');
  syncCookieConsentPlacement(!!(gate && !gate.classList.contains('hidden') &&
    document.documentElement.dataset.bootState === 'auth'));
  return { shown: true };
}

/* Install the guard as soon as the module loads so any client-side
   non-essential cookie write is blocked before the banner can be shown. */
installCookieGuard();

if (typeof window !== 'undefined') {
  browserWindow.__socratesConsent = {
    getPreference: getConsentPreference,
    hasConsent: hasConsent,
    allowsNonEssential: allowsNonEssential,
    setPreference: setConsentPreference,
    isEssentialCookieName: isEssentialCookieName,
  };
}
