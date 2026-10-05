import assert from 'node:assert/strict';
import test from 'node:test';

const published = [];
globalThis.window = {
  __socratesReactChatBridge: { publish: (event) => published.push(event) },
};

const { stateStore } = await import('../src/state/store.js');
const { persistCanvasEdit } = await import('../src/react/canvas/canvasState.ts');

test('canvas edits replace the matching message through the session action', () => {
  stateStore.dispatch({ type: 'state/reset' });
  published.length = 0;
  stateStore.dispatch({
    type: 'session/replace-messages',
    payload: [
      { clientId: 'canvas-message-1', role: 'assistant', canvasId: 'canvas-1', editedText: null },
      { clientId: 'canvas-message-2', role: 'assistant', canvasId: 'canvas-2', editedText: null },
    ],
  });
  const before = stateStore.read('messages');

  assert.equal(persistCanvasEdit('canvas-2', '<p>Revised answer</p>'), true);

  const after = stateStore.read('messages');
  assert.notStrictEqual(after, before);
  assert.strictEqual(after[0], before[0]);
  assert.notStrictEqual(after[1], before[1]);
  assert.equal(after[1].editedText, '<p>Revised answer</p>');
  assert.deepEqual(published, [
    { type: 'state-synced', reason: 'canvas-edited' },
  ]);
});

test('canvas edits report missing messages without publishing a state refresh', () => {
  stateStore.dispatch({ type: 'state/reset' });
  published.length = 0;

  assert.equal(persistCanvasEdit('missing-canvas', '<p>Orphan</p>'), false);
  assert.deepEqual(published, []);
});
