import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.localStorage = {
  getItem() { return null; },
  setItem() {},
};

const { stateStore } = await import('../src/state/store.js');
const { fallbackTitle, generateSessionTitle, normalizeSessionTitle } = await import('../src/chat/sessionTitle.js');

test('session titles strip prefixes and stay short in both languages', () => {
  assert.equal(fallbackTitle('理解机器学习基本概念以及应用'), '理解机器学习基本');
  assert.equal(fallbackTitle('Explain the main idea behind evolution by natural selection'), 'Explain the main idea behind evolution');
  assert.equal(normalizeSessionTitle('标题：「理解机器学习基础知识以及方法。」'), '理解机器学习基础');
  assert.equal(normalizeSessionTitle('Title: "A useful session title with many extra words"'), 'A useful session title with many');
});

test('a first prompt gets a compact fallback before provider availability is checked', () => {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  globalThis.window = { stateStore, _currentLang: 'zh' };
  globalThis.fetch = () => Promise.reject(new Error('offline'));
  stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: 'title-session' });
  stateStore.dispatch({ type: 'state/set', key: 'topic', value: '理解机器学习基本概念以及应用' });
  stateStore.dispatch({ type: 'state/set', key: 'sessionTitle', value: null });

  try {
    generateSessionTitle();
    assert.equal(stateStore.read('sessionTitle'), '理解机器学习基本');
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = previousFetch;
  }
});
