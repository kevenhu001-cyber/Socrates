import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import {
  parseBrowserLoginRequest, readBrowserLoginRequest, validateBrowserLoginCallback,
  captureBrowserLoginRequest, offerBrowserLoginHandoff,
} from '../src/native/browserLoginHandoff.ts';

const state = 'a'.repeat(64);
const challenge = 'b'.repeat(43);
const code = 'c'.repeat(64);
const base = 'https://app.topodrive.top';
const start = `${base}/?native_login=1&state=${state}&code_challenge=${challenge}`;
const callback = `${base}/auth/android/callback#code=${code}&state=${state}`;
const key = 'socrates.android.browser-login.v1';

function browser(url = start) {
  const dom = new JSDOM('<!doctype html><body></body>', { url });
  for (const name of ['window', 'document', 'location', 'history', 'sessionStorage']) globalThis[name] = dom.window[name];
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  window.CURRENT_USER = { id: 'u1', email: 'test@example.test' };
  return dom;
}
function cleanup(dom) {
  dom.window.close();
  for (const name of ['window', 'document', 'location', 'history', 'sessionStorage']) delete globalThis[name];
}

test('request accepts only production origin and singleton well-formed parameters', () => {
  assert.deepEqual(parseBrowserLoginRequest(new URL(start), 123), { state, codeChallenge: challenge, createdAt: 123 });
  for (const url of [start.replace('https:', 'http:'), start.replace('app.topodrive.top', 'evil.test'),
    start + '&state=' + state, start + '&native_login=1', start + '&code_challenge=' + challenge,
    start.replace('native_login=1', 'native_login=0'), start.replace(state, 'bad'),
    start.replace(challenge, 'bad'), start.replace('/?', '/other?')]) {
    assert.equal(parseBrowserLoginRequest(new URL(url)), null, url);
  }
});

test('stored requests expire, reject future timestamps/corruption, and fail closed', () => {
  const dom = browser();
  try {
    const now = Date.now();
    for (const createdAt of [now - 600000, now + 1, 'invalid']) {
      sessionStorage.setItem(key, JSON.stringify({ state, codeChallenge: challenge, createdAt }));
      assert.equal(readBrowserLoginRequest(sessionStorage, now), null);
      assert.equal(sessionStorage.getItem(key), null);
    }
    sessionStorage.setItem(key, 'invalid json');
    assert.equal(readBrowserLoginRequest(sessionStorage, now), null);
    assert.equal(readBrowserLoginRequest({ getItem() { throw new Error('blocked'); } }, now), null);
  } finally { cleanup(dom); }
});

test('callbacks reject redirects, query secrets, extra/duplicate parameters and mismatched state', () => {
  assert.equal(validateBrowserLoginCallback(callback, state), callback);
  for (const url of [callback.replace(base, 'https://evil.test'), callback.replace('https:', 'socrates:'),
    callback.replace('/auth/android/callback', '/elsewhere'), callback.replace('#', '?x=1#'),
    callback + '&state=' + state, callback + '&extra=1', callback.replace(code, 'bad'),
    callback.replace(base, 'https://user@app.topodrive.top')]) {
    assert.equal(validateBrowserLoginCallback(url, state), null, url);
  }
  assert.equal(validateBrowserLoginCallback(callback, 'd'.repeat(64)), null);
});

test('capture strips request from URL, survives OAuth navigation, and malformed new attempts clear old pending', () => {
  const dom = browser();
  try {
    captureBrowserLoginRequest();
    assert.equal(location.search, '');
    assert.equal(readBrowserLoginRequest(sessionStorage).state, state);
    history.replaceState(null, '', '/?oauth_error=denied');
    captureBrowserLoginRequest();
    assert.equal(readBrowserLoginRequest(sessionStorage).state, state);
    history.replaceState(null, '', '/?native_login=1&state=bad');
    captureBrowserLoginRequest();
    assert.equal(sessionStorage.getItem(key), null);
  } finally { cleanup(dom); }
});

test('browser callback fallback removes secrets and pending without reauthorizing', () => {
  const dom = browser(callback);
  try {
    sessionStorage.setItem(key, JSON.stringify({ state, codeChallenge: challenge, createdAt: Date.now() }));
    captureBrowserLoginRequest();
    offerBrowserLoginHandoff();
    assert.equal(location.hash, '');
    assert.equal(sessionStorage.getItem(key), null);
    assert.equal(document.querySelectorAll('dialog').length, 1);
    assert.equal(document.querySelectorAll('a').length, 0);
    assert.ok(!document.body.textContent.includes(code));
  } finally { cleanup(dom); }
});

test('explicit consent issues one cookie/CSRF request then exposes only validated one-time link', async () => {
  const dom = browser();
  const originalFetch = globalThis.fetch;
  const calls = [];
  try {
    captureBrowserLoginRequest();
    document.cookie = 'csrf=csrf-value; Path=/';
    globalThis.fetch = async (path, options) => {
      calls.push({ path, options });
      if (path.endsWith('csrf-token')) return { ok: true };
      if (path.endsWith('/me')) return { ok: true, json: async () => ({ user: { id: 'u1' } }) };
      return { ok: true, json: async () => ({ url: callback, expiresAt: new Date(Date.now() + 300000).toISOString() }) };
    };
    offerBrowserLoginHandoff();
    offerBrowserLoginHandoff();
    assert.equal(document.querySelectorAll('dialog').length, 1);
    assert.ok(document.body.textContent.includes('test@example.test'));
    assert.equal(calls.length, 0);
    document.querySelector('button').click();
    document.querySelector('button').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(calls.length, 3);
    assert.equal(calls[2].path, '/api/v2/auth/mobile/browser/authorize');
    assert.equal(calls[2].options.credentials, 'same-origin');
    assert.equal(calls[2].options.headers['X-CSRF-Token'], 'csrf-value');
    assert.equal(calls[2].options.headers.Authorization, undefined);
    assert.deepEqual(JSON.parse(calls[2].options.body), { state, codeChallenge: challenge });
    const link = document.querySelector('a');
    assert.equal(link.hidden, false);
    assert.equal(link.href, callback);
    assert.equal(link.referrerPolicy, 'no-referrer');
    assert.equal(sessionStorage.getItem(key), null);
    document.querySelectorAll('button')[1].click();
  } finally { globalThis.fetch = originalFetch; cleanup(dom); }
});

test('cancel never issues a handoff and failed/unsafe responses cannot expose a link', async () => {
  for (const unsafe of [false, true]) {
    const dom = browser();
    const originalFetch = globalThis.fetch;
    let count = 0;
    try {
      captureBrowserLoginRequest();
      document.cookie = 'csrf=csrf-value; Path=/';
      globalThis.fetch = async () => {
        count++;
        if (count === 1) return { ok: true };
        if (count === 2) return { ok: true, json: async () => ({ user: { id: 'u1' } }) };
        return { ok: !unsafe, json: async () => ({ url: 'https://evil.test/#secret', expiresAt: new Date(Date.now() + 300000).toISOString() }) };
      };
      offerBrowserLoginHandoff();
      document.querySelectorAll('button')[1].click();
      assert.equal(count, 0);
      assert.equal(sessionStorage.getItem(key), null);
      captureBrowserLoginRequest(); // URL already stripped; no new pending.
      assert.equal(document.querySelectorAll('dialog').length, 0);
      history.replaceState(null, '', start);
      captureBrowserLoginRequest();
      offerBrowserLoginHandoff();
      document.querySelector('button').click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(document.querySelector('a').hidden, true);
      assert.equal(sessionStorage.getItem(key), null);
      document.querySelectorAll('button')[1].click();
    } finally { globalThis.fetch = originalFetch; cleanup(dom); }
  }
});

test('a changed browser account cannot authorize the identity shown in the confirmation', async () => {
  const dom = browser();
  const originalFetch = globalThis.fetch;
  const paths = [];
  try {
    captureBrowserLoginRequest();
    document.cookie = 'csrf=csrf-value; Path=/';
    globalThis.fetch = async (path) => {
      paths.push(path);
      if (path.endsWith('csrf-token')) return { ok: true };
      return { ok: true, json: async () => ({ user: { id: 'different-user' } }) };
    };
    offerBrowserLoginHandoff();
    document.querySelector('button').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(paths.some((path) => path.endsWith('/authorize')), false);
    assert.equal(document.querySelector('a').hidden, true);
    assert.equal(sessionStorage.getItem(key), null);
    document.querySelectorAll('button')[1].click();
  } finally { globalThis.fetch = originalFetch; cleanup(dom); }
});

test('cancelling an in-flight handoff never reveals its returned code', async () => {
  const dom = browser();
  const originalFetch = globalThis.fetch;
  let complete;
  try {
    captureBrowserLoginRequest();
    document.cookie = 'csrf=csrf-value; Path=/';
    globalThis.fetch = async (path) => {
      if (path.endsWith('csrf-token')) return { ok: true };
      if (path.endsWith('/me')) return { ok: true, json: async () => ({ user: { id: 'u1' } }) };
      return new Promise((resolve) => { complete = resolve; });
    };
    offerBrowserLoginHandoff();
    document.querySelector('button').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(typeof complete, 'function');
    document.querySelectorAll('button')[1].click();
    complete({ ok: true, json: async () => ({ url: callback, expiresAt: new Date(Date.now() + 300000).toISOString() }) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(document.querySelectorAll('dialog').length, 0);
    assert.equal(document.querySelectorAll('a').length, 0);
    assert.equal(sessionStorage.getItem(key), null);
  } finally { globalThis.fetch = originalFetch; cleanup(dom); }
});
