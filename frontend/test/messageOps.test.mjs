import test from 'node:test';
import assert from 'node:assert/strict';

import { JSDOM } from 'jsdom';
import { marked } from 'marked';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.t = (key) => key;
/* buildAssistantHtml -> formatMsg reads the eagerly-bundled marked global. */
globalThis.marked = marked;

const {
  deleteUserMessage,
  findMessageIndex,
  reseatSavedArtifact,
  restoreMessageBody,
  restorePersistedMessageExtras,
  rollbackMessagesAfter,
} = await import('../src/ui/messageActions.ts');
const { stateStore } = await import('../src/state/store.js');

function appendMessage(clientId, role, rawText) {
  stateStore.dispatch({
    type: 'session/append-message',
    payload: { clientId, role, rawText },
  });
}

function mountRow(clientId, reactOwned) {
  const row = dom.window.document.createElement('div');
  row.setAttribute('data-client-id', clientId);
  if (reactOwned) row.setAttribute('data-react-owned', 'true');
  dom.window.document.body.appendChild(row);
  return row;
}

test('findMessageIndex resolves client ids and misses unknown ones', () => {
  appendMessage('find-u1', 'user', 'hello');
  assert.ok(findMessageIndex('find-u1') >= 0);
  assert.equal(findMessageIndex('find-missing'), -1);
});

test('rollbackMessagesAfter drops later turns but spares React rows', () => {
  appendMessage('rb-u1', 'user', 'q');
  appendMessage('rb-a1', 'assistant', 'a');
  appendMessage('rb-u2', 'user', 'q2');
  const legacyRow = mountRow('rb-a1', false);
  const reactRow = mountRow('rb-u2', true);
  try {
    const dropped = rollbackMessagesAfter('rb-u1');
    assert.equal(dropped, 2);
    assert.equal(legacyRow.parentNode, null);
    assert.notEqual(reactRow.parentNode, null);
    const ids = stateStore.read('messages').map((m) => m && m.clientId);
    assert.ok(!ids.includes('rb-a1'));
    assert.ok(!ids.includes('rb-u2'));
  } finally {
    legacyRow.remove();
    reactRow.remove();
  }
});

test('deleteUserMessage removes the entry and its row', () => {
  appendMessage('del-u1', 'user', 'bye');
  const row = mountRow('del-u1', false);
  deleteUserMessage('del-u1');
  assert.equal(row.parentNode, null);
  const ids = stateStore.read('messages').map((m) => m && m.clientId);
  assert.ok(!ids.includes('del-u1'));
});

test('restoreMessageBody re-renders markdown and honors saved html', () => {
  const body = dom.window.document.createElement('div');
  restoreMessageBody({ role: 'assistant', rawText: 'Hi **there**' }, body);
  assert.match(body.innerHTML, /<strong>there<\/strong>/);

  const htmlBody = dom.window.document.createElement('div');
  restoreMessageBody({ role: 'user', html: '<p>saved</p>' }, htmlBody);
  assert.match(htmlBody.innerHTML, /saved/);

  const emptyBody = dom.window.document.createElement('div');
  restoreMessageBody({}, emptyBody);
  assert.equal(emptyBody.innerHTML, '');
});

test('restorePersistedMessageExtras is idempotent via its data marker', () => {
  const body = dom.window.document.createElement('div');
  const entry = { clientId: 'px-1', toolCalls: [] };
  restorePersistedMessageExtras(body, entry, 'px');
  assert.equal(body.dataset.persistedExtrasFor, 'px-1');
  const firstHtml = body.innerHTML;
  restorePersistedMessageExtras(body, entry, 'px');
  assert.equal(body.innerHTML, firstHtml);
});

test('reseatSavedArtifact anchors nodes after their inline row', () => {
  const container = dom.window.document.createElement('div');
  const row = dom.window.document.createElement('div');
  row.setAttribute('data-tcid', 't1');
  container.appendChild(row);
  const tail = dom.window.document.createElement('div');
  tail.textContent = 'tail';
  container.appendChild(tail);

  const node = dom.window.document.createElement('div');
  node.setAttribute('data-tool-anchor', 't1');
  reseatSavedArtifact(container, node);
  assert.equal(row.nextElementSibling, node);

  const loose = dom.window.document.createElement('div');
  reseatSavedArtifact(container, loose);
  assert.equal(container.lastElementChild, loose);
});
