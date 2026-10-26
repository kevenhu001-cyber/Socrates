import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { claimReactMessageList, isMsgListMounted, isSharedMessageList, takeOverSharedMessageList } from '../src/ui/msgListMount.ts';
import { registerAssistantTurnRenderer, renderSharedAssistantTurn, releaseSharedAssistantTurns } from '../src/ui/assistantTurnRenderer.ts';

test('transcript claims follow actual hosts and stale cleanup cannot release a replacement', () => {
  const dom = new JSDOM('<div id="msgList"></div>');
  const previous = globalThis.document;
  globalThis.document = dom.window.document;
  let cleanup;
  try {
    const original = document.getElementById('msgList');
    const staleCleanup = claimReactMessageList(original, () => {});
    assert.equal(isMsgListMounted(), true);
    const replacement = document.createElement('div');
    replacement.id = 'msgList';
    original.replaceWith(replacement);
    assert.equal(isMsgListMounted(), false, 'a detached root cannot suppress the legacy renderer for the new host');
    cleanup = claimReactMessageList(replacement, () => {});
    staleCleanup();
    assert.equal(isMsgListMounted(), true);
  } finally { cleanup?.(); globalThis.document = previous; dom.window.close(); }
});

test('share takeover releases the live root before child replacement and is scoped to one node', () => {
  const dom = new JSDOM('<div id="msgList"><button>Live</button></div>');
  const previous = globalThis.document;
  globalThis.document = dom.window.document;
  let cleanup;
  let releases = 0;
  try {
    const host = document.getElementById('msgList');
    cleanup = claimReactMessageList(host, () => { releases++; cleanup(); host.replaceChildren(); });
    takeOverSharedMessageList(host);
    assert.equal(releases, 1);
    assert.equal(host.textContent, '');
    assert.equal(isMsgListMounted(), false);
    assert.equal(isSharedMessageList(host), true);
    assert.throws(() => claimReactMessageList(host, () => {}), /read-only/);
    takeOverSharedMessageList(host);
    assert.equal(releases, 1);
    const replacement = document.createElement('div');
    replacement.id = host.id;
    host.replaceWith(replacement);
    assert.equal(isSharedMessageList(replacement), false);
    cleanup = claimReactMessageList(replacement, () => {});
    assert.equal(isMsgListMounted(), true);
  } finally { cleanup?.(); globalThis.document = previous; dom.window.close(); }
});

test('shared turns have a prose fallback and typed registration always enforces read-only rendering', () => {
  const dom = new JSDOM('<div id="turn"></div>');
  const host = dom.window.document.getElementById('turn');
  const message = { role: 'assistant', rawText: 'Shared answer' };
  assert.equal(renderSharedAssistantTurn(host, message), false);
  let received, releases = 0;
  const disposeFirst = registerAssistantTurnRenderer({ mount: () => false, releaseAll() {} });
  const disposeCurrent = registerAssistantTurnRenderer({
    mount(...args) { received = args; return true; },
    releaseAll() { releases++; },
  });
  try {
    disposeFirst();
    assert.equal(renderSharedAssistantTurn(host, message), true);
    assert.deepEqual(received, [host, message, { readOnly: true }]);
    releaseSharedAssistantTurns();
    assert.equal(releases, 1);
  } finally { disposeCurrent(); dom.window.close(); }
  assert.equal(renderSharedAssistantTurn(host, message), false);
});
