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
const { turnState } = await import('../src/chat/turn/state.ts');

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

test('committing an unchanged message also replaces state and replays after server patch settles', async () => {
  const dom2 = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
  globalThis.window = dom2.window;
  globalThis.document = dom2.window.document;
  globalThis.localStorage = dom2.window.localStorage;
  stateStore.dispatch({ type: 'session/replace-messages', payload: [
    { clientId: 'edit-user-same', role: 'user', rawText: 'original', html: 'original', attachments: [] },
    { clientId: 'edit-answer-same', role: 'assistant', rawText: 'old answer' },
  ] });
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
    commitUserMessageEdit('edit-user-same', 'original');
    assert.deepEqual(errors, []);
    const messages = stateStore.read('messages');
    assert.equal(messages.length, 1);
    assert.equal(messages[0].rawText, 'original');
    assert.equal(messages[0].branchInfo?.currentIndex, 1);
    assert.equal(messages[0].branchInfo?.variants?.length, 2);
    assert.equal(requests.length, 1);
    assert.deepEqual(JSON.parse(requests[0].options.body), {
      content: 'original', regenerate: false, discardFollowing: true,
    });
    resolvePatch(new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(replayed, ['original']);
  } finally {
    globalThis.fetch = originalFetch;
    delete window.askChatTurn;
    window.removeEventListener('error', onError);
    turnState.pendingChatContent = null;
    dom2.window.close();
  }
});

test('edit creates the answer before PATCH resolves and cancels stale replay after navigation', async () => {
  const testDom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
  globalThis.window = testDom.window;
  globalThis.document = testDom.window.document;
  globalThis.localStorage = testDom.window.localStorage;
  stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: 'edit-session' });
  stateStore.dispatch({ type: 'session/replace-messages', payload: [
    { clientId: 'user', role: 'user', rawText: 'old', attachments: [] },
    { clientId: 'answer', role: 'assistant', rawText: 'old answer' },
  ] });
  const originalFetch = globalThis.fetch;
  let resolvePatch;
  globalThis.fetch = () => new Promise(resolve => { resolvePatch = resolve; });
  let mounted = 0;
  let replayed = 0;
  window.addStreamingMessage = () => { mounted++; return { isFinished: () => false }; };
  window.askChatTurn = () => { replayed++; };
  turnState.activeChatCtl = null;
  try {
    commitUserMessageEdit('user', 'new');
    assert.equal(mounted, 1, 'answer reserve begins without waiting for the network');
    assert.equal(replayed, 0);
    stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: 'other-session' });
    resolvePatch(new Response('{}', { status: 200 }));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(replayed, 0, 'late PATCH cannot replay into another conversation');
  } finally {
    globalThis.fetch = originalFetch;
    testDom.window.close();
  }
});
