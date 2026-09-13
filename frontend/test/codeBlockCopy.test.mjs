import test from 'node:test';
import assert from 'node:assert/strict';

import { JSDOM } from 'jsdom';

/* The copy-control observer must wire a `.code-block-header` that is
   inserted on its own (wireCodeBlockHeaders inserts the header node
   directly), while scanning only the added subtree. */
const dom = new JSDOM(
  '<!doctype html><html><body><div id="msgList"><div class="msg-body">' +
    '<pre><code class="language-js">const x = 1;</code></pre>' +
  '</div></div></body></html>',
  { url: 'http://localhost/' },
);
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.MutationObserver = dom.window.MutationObserver;

const { installCodeBlockCopy } = await import('../src/render/markdown.js');

function nextMutation() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test('an inserted code-block header gets the copy control', async () => {
  installCodeBlockCopy();
  const pre = document.querySelector('.msg-body pre');
  assert.ok(pre, 'fixture pre missing');

  const header = document.createElement('div');
  header.className = 'code-block-header';
  pre.parentNode.insertBefore(header, pre);
  await nextMutation();

  assert.ok(header.querySelector('.code-block-copy'), 'copy button was not wired');
});

test('a header inside a tool card is left alone', async () => {
  const card = document.createElement('div');
  card.className = 'agent-tool-card';
  const body = document.createElement('div');
  body.className = 'msg-body';
  const pre = document.createElement('pre');
  body.appendChild(pre);
  card.appendChild(body);
  document.body.appendChild(card);

  const header = document.createElement('div');
  header.className = 'code-block-header';
  pre.parentNode.insertBefore(header, pre);
  await nextMutation();

  assert.equal(header.querySelector('.code-block-copy'), null);
});
