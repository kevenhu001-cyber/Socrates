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

function makeBar() {
  const bar = dom.window.document.createElement('div');
  const up = dom.window.document.createElement('button');
  up.setAttribute('data-action', 'thumbs-up');
  const down = dom.window.document.createElement('button');
  down.setAttribute('data-action', 'thumbs-down');
  bar.appendChild(up);
  bar.appendChild(down);
  return { bar, up, down };
}

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

test('sendFeedback highlights the chosen button optimistically', () => {
  const { bar, up, down } = makeBar();
  sendFeedback('msg-1', 'up', bar);
  assert.equal(up.classList.contains('active'), true);
  assert.equal(down.classList.contains('active'), false);

  sendFeedback('msg-1', 'down', bar);
  assert.equal(up.classList.contains('active'), false);
  assert.equal(down.classList.contains('active'), true);
});

test('feedback telemetry never throws, even with no backend', () => {
  assert.doesNotThrow(() => fireFeedback('msg-1', 'up', null));
  assert.doesNotThrow(() => fireFeedback('', 'up', null));
  assert.doesNotThrow(() => sendFeedback('msg-1', 'up', null));
});
