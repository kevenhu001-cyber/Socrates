import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

// Legacy chipSync was retired with the RN shortcuts. The current contract
// is the module-owned preference and the event the React chips subscribe to.
const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://app.example.test/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.CustomEvent = dom.window.CustomEvent;
const preferences = await import('../src/config/providers.ts');

test('web-search changes publish the state consumed by React shortcut and composer chips', () => {
  const seen = [];
  const listener = event => seen.push(event.detail.on);
  document.addEventListener('socrates:websearchchange', listener);
  try {
    preferences.setWebSearchOn(true);
    assert.equal(preferences.webSearchOn, true);
    preferences.setWebSearchOn(false);
    assert.equal(preferences.webSearchOn, false);
    assert.deepEqual(seen, [true, false]);
  } finally { document.removeEventListener('socrates:websearchchange', listener); }
});

test('the chip preference persists without requiring any legacy chip nodes', () => {
  preferences.setWebSearchOn(true);
  assert.equal(localStorage.getItem('socrates-websearch'), 'true');
  preferences.setWebSearchOn(false);
  assert.equal(localStorage.getItem('socrates-websearch'), 'false');
});
