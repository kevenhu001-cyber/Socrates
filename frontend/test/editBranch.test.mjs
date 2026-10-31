import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
const { stateStore } = await import('../src/state/store.ts');
/* The public editBranch path lazily loads the state/API implementation. The
   visible edit form is covered through MessageItem in Playwright. */
const { commitUserMessageEdit } = await import('../src/chat/editBranch.impl.ts');
const { turnState } = await import('../src/chat/turnState.ts');

test('committing a React-edited message replaces state and replays after the server patch settles', async () => {
  stateStore.dispatch({ type: 'session/replace-messages', payload: [
    { clientId: 'edit-user', role: 'user', rawText: 'original', html: 'stale', attachments: [] },
    { clientId: 'edit-answer', role: 'assistant', rawText: 'old answer' },
  ] });
  const previous = stateStore.read('messages');
  assert.ok(Object.isFrozen(previous[0]));
  const requests = [];
  const replayed = [];
  const errors = [];
  const onError = event => { errors.push(event.error); event.preventDefault(); };
  window.addEventListener('error', onError);
  const originalFetch = globalThis.fetch;
  let resolvePatch;
  globalThis.fetch = (url, options) => {
    requests.push({ url, options });
    return new Promise(resolve => { resolvePatch = resolve; });
  };
  window.askChatTurn = text => { replayed.push(text); };
  try {
    commitUserMessageEdit('edit-user', 'updated');
    assert.deepEqual(errors, []);
    const messages = stateStore.read('messages');
    assert.equal(messages.length, 1);
    assert.notStrictEqual(messages[0], previous[0]);
    assert.equal(messages[0].rawText, 'updated');
    assert.match(messages[0].html, /updated/);
    assert.strictEqual(messages[0].attachments, previous[0].attachments);
    assert.equal(previous[0].rawText, 'original');
    assert.equal(previous[0].html, 'stale');
    assert.equal(previous.length, 2);
    assert.equal(stateStore.read('messages').some((message) => message.clientId === 'edit-answer'), false);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].options.method, 'PATCH');
    assert.deepEqual(JSON.parse(requests[0].options.body), {
      content: 'updated', regenerate: false, discardFollowing: true,
    });
    assert.deepEqual(replayed, []);
    resolvePatch(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(replayed, ['updated']);
  } finally {
    globalThis.fetch = originalFetch;
    delete window.askChatTurn;
    window.removeEventListener('error', onError);
    turnState.pendingChatContent = null;
    dom.window.close();
  }
});
