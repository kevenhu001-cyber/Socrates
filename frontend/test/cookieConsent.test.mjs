import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CONSENT_KEY,
  allowsNonEssential,
  getConsentPreference,
  installCookieGuard,
  setConsentPreference,
} from '../src/cookieConsent.js';

let mockCookies = '';
let mockStorage;
let previous = {};

function setMockCookie(raw) {
  const first = String(raw).split(';')[0] || '';
  const eq = first.indexOf('=');
  if (eq <= 0) return;
  const name = first.slice(0, eq).trim();
  const value = first.slice(eq + 1).trim();
  const kept = mockCookies.split(';').filter(Boolean).map((c) => c.trim()).filter((c) => c.split('=')[0] !== name);
  kept.push(name + '=' + value);
  mockCookies = kept.join('; ');
}

function installMockEnvironment() {
  mockCookies = '';
  mockStorage = new Map();
  previous.localStorage = globalThis.localStorage;
  previous.document = globalThis.document;
  previous.location = globalThis.location;
  previous.window = globalThis.window;

  globalThis.localStorage = {
    getItem: (key) => mockStorage.has(String(key)) ? mockStorage.get(String(key)) : null,
    setItem: (key, value) => mockStorage.set(String(key), String(value)),
    removeItem: (key) => mockStorage.delete(String(key)),
    clear: () => mockStorage.clear(),
  };
  globalThis.document = {};
  Object.defineProperty(globalThis.document, 'cookie', {
    configurable: true,
    get: () => mockCookies,
    set: setMockCookie,
  });
  globalThis.location = { hostname: '127.0.0.1', protocol: 'http:' };
  globalThis.window = { dispatchEvent: function () {} };
}

function restoreEnvironment() {
  for (const key of ['localStorage', 'document', 'location', 'window']) {
    if (key in previous) {
      if (previous[key] === undefined) delete globalThis[key];
      else globalThis[key] = previous[key];
    } else {
      delete globalThis[key];
    }
  }
  mockCookies = '';
  mockStorage = null;
}

test('cookie consent starts with no choice and gates non-essential cookies', () => {
  installMockEnvironment();
  try {
    assert.equal(getConsentPreference(), null);
    assert.equal(allowsNonEssential(), false);

    installCookieGuard();
    document.cookie = 'analytics_id=abc; path=/; max-age=3600';
    assert.equal(document.cookie.includes('analytics_id=abc'), false, 'non-essential cookie must be blocked before consent');

    document.cookie = 'csrf=token-123; path=/';
    assert.equal(document.cookie.includes('csrf=token-123'), true, 'essential cookies must still be writable');
  } finally {
    restoreEnvironment();
  }
});

test('accepting consent persists the choice and unlocks non-essential cookies', () => {
  installMockEnvironment();
  try {
    installCookieGuard();
    const pref = setConsentPreference('accept');
    assert.equal(pref.nonEssential, true);
    assert.equal(getConsentPreference().nonEssential, true);
    assert.equal(allowsNonEssential(), true);

    document.cookie = 'analytics_id=abc; path=/; max-age=3600';
    assert.equal(document.cookie.includes('analytics_id=abc'), true, 'accepted consent must allow non-essential cookies');

    // The consent choice itself is stored locally and in the consent cookie.
    const stored = JSON.parse(localStorage.getItem(CONSENT_KEY));
    assert.equal(stored.nonEssential, true);
    assert.equal(document.cookie.includes('socrates_consent='), true);
  } finally {
    restoreEnvironment();
  }
});

test('essential-only choice persists and keeps non-essential cookies blocked', () => {
  installMockEnvironment();
  try {
    installCookieGuard();
    setConsentPreference('essential');
    assert.equal(allowsNonEssential(), false);
    assert.equal(getConsentPreference().choice, 'essential');

    document.cookie = 'marketing_uid=1; path=/; max-age=3600';
    assert.equal(document.cookie.includes('marketing_uid=1'), false, 'essential-only must keep non-essential cookies blocked');

    // The shared cookie survives localStorage being cleared, so the banner
    // does not reappear on the next visit.
    localStorage.removeItem(CONSENT_KEY);
    const restored = getConsentPreference();
    assert.equal(restored.nonEssential, false);
    assert.equal(localStorage.getItem(CONSENT_KEY), JSON.stringify(restored));
  } finally {
    restoreEnvironment();
  }
});
