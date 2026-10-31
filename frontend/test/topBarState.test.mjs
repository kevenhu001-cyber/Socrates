import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import { setConversationChrome } from '../src/ui/topBarState.ts';

function createDocument() {
  return new JSDOM(`<!doctype html><html><body>
    <div class="chat-top-bar"><div class="btn-group">
      <button class="icon-btn" style="display:none"></button>
      <button class="start-btn" style="display:none"></button>
    </div></div>
    <button id="mobileIncognitoBtn"></button>
  </body></html>`).window.document;
}

test('conversation chrome shows desktop actions and hides landing controls', () => {
  const document = createDocument();

  setConversationChrome(true, document);

  for (const element of document.querySelectorAll('.chat-top-bar .btn-group > *')) {
    assert.equal(element.style.display, '');
  }
  assert.equal(document.getElementById('mobileIncognitoBtn').style.display, 'none');
});

test('landing chrome hides desktop actions and restores mobile controls', () => {
  const document = createDocument();

  setConversationChrome(false, document);

  for (const element of document.querySelectorAll('.chat-top-bar .btn-group > *')) {
    assert.equal(element.style.display, 'none');
  }
  assert.equal(document.getElementById('mobileIncognitoBtn').style.display, '');
});
