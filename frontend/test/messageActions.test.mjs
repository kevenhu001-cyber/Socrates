import test from 'node:test';
import assert from 'node:assert/strict';

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;

const { fireFeedback, messageApiPath, sendFeedback } = await import(
  '../src/ui/messageActions.ts'
);
const { stateStore } = await import('../src/state/store.js');

test('messageApiPath leaves client ids unscoped without a uuid session', () => {
  const previousSession = stateStore.read('currentSessionId');
  stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: 'local-1' });
  try {
    assert.equal(messageApiPath('msg-1', '/feedback'), '/api/messages/msg-1/feedback');
  } finally {
    stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: previousSession ?? null });
  }
});

test('messageApiPath scopes client ids to a uuid session', () => {
  const previousSession = stateStore.read('currentSessionId');
  const uuid = '12345678-1234-1234-1234-1234567890ab';
  stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: uuid });
  try {
    assert.equal(
      messageApiPath('msg-1'),
      '/api/messages/msg-1?sessionId=' + encodeURIComponent(uuid),
    );
  } finally {
    stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: previousSession ?? null });
  }
});

test('feedback telemetry never throws, even with no backend', () => {
  assert.doesNotThrow(() => fireFeedback('msg-1', 'up', null));
  assert.doesNotThrow(() => fireFeedback('', 'up', null));
  assert.doesNotThrow(() => sendFeedback('msg-1', 'up'));
});
