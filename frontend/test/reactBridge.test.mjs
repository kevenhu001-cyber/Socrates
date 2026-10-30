/* The publisher feeds the module-owned chat runtime store and keeps its DOM
   event observation hook for browser integrations. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://app.example.test/',
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.CustomEvent = dom.window.CustomEvent;

const { publishReactChatRuntime } = await import('../src/ui/reactBridge.ts');
const { chatRuntimeStore } = await import('../src/ui/chatRuntimeStore.ts');

test('publishes into the in-process chat runtime store', () => {
  chatRuntimeStore.__resetForTests();
  publishReactChatRuntime({ type: 'state-synced', reason: 'unit-test' });
  assert.equal(chatRuntimeStore.getSnapshot().lastEvent, 'state-synced');
});

test('fires the chat runtime CustomEvent for browser integrations', () => {
  let captured = null;
  const handler = (event) => { captured = event.detail; };
  window.addEventListener('socrates:chat-runtime-changed', handler);
  publishReactChatRuntime({ type: 'state-synced', reason: 'event-test' });
  assert.deepEqual(captured, { type: 'state-synced', reason: 'event-test' });
  window.removeEventListener('socrates:chat-runtime-changed', handler);
});

test('subscriber failures do not break publishing or other subscribers', () => {
  let received = null;
  const removeThrowing = chatRuntimeStore.subscribe(() => { throw new Error('subscriber exploded'); });
  const removeObserver = chatRuntimeStore.subscribe(() => {
    received = chatRuntimeStore.getSnapshot().lastEvent;
  });
  assert.doesNotThrow(() => publishReactChatRuntime({ type: 'state-synced', reason: 'failure-test' }));
  assert.equal(received, 'state-synced');
  removeThrowing();
  removeObserver();
});

test('the publisher works without a browser global', () => {
  const previousWindow = globalThis.window;
  try {
    globalThis.window = undefined;
    assert.doesNotThrow(() => publishReactChatRuntime({ type: 'state-synced', reason: 'ssr-test' }));
    assert.equal(chatRuntimeStore.getSnapshot().lastEvent, 'state-synced');
  } finally {
    globalThis.window = previousWindow;
  }
});

test('a missing event is ignored by the store and normalized for CustomEvent listeners', () => {
  let captured = 'not-an-object';
  const handler = (event) => { captured = event.detail; };
  window.addEventListener('socrates:chat-runtime-changed', handler);
  publishReactChatRuntime(null);
  assert.deepEqual(captured, {});
  window.removeEventListener('socrates:chat-runtime-changed', handler);
});
