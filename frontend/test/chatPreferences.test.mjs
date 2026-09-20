import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://app.example.test/' });
globalThis.window = dom.window;
globalThis.localStorage = dom.window.localStorage;

const preferences = await import('../src/config/chatPreferences.ts');

test('chat preferences validate defaults and persist an atomic update', () => {
  localStorage.clear();
  assert.equal(preferences.getStoredReasoningEffort(), 'medium');
  assert.equal(preferences.getStoredResponseSpeed(), 'standard');

  let detail = null;
  window.addEventListener('socrates:chat-preferences', (event) => { detail = event.detail; }, { once: true });
  preferences.saveChatPreferences('high', 'fast');

  assert.equal(preferences.getStoredReasoningEffort(), 'high');
  assert.equal(preferences.getStoredResponseSpeed(), 'fast');
  assert.deepEqual(detail, { effort: 'high', speed: 'fast' });
});

test('invalid stored values fall back safely', () => {
  localStorage.setItem('socrates-reasoning-effort', 'maximum');
  localStorage.setItem('socrates-response-speed', 'turbo');
  assert.equal(preferences.getStoredReasoningEffort(), 'medium');
  assert.equal(preferences.getStoredResponseSpeed(), 'standard');
});
