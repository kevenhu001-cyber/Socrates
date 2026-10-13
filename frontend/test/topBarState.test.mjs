import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import { setConversationChrome } from '../src/ui/topBarState.js';

function createDocument() {
  return new JSDOM(`<!doctype html><html><body>
    <div class="chat-top-bar"><div class="btn-group">
      <button class="icon-btn" style="display:none"></button>
      <button class="start-btn" style="display:none"></button>
    </div></div>
    <div class="top-bar-right">
      <button id="mobileNewChatBtn"></button>
      <button id="mobileIncognitoBtn"></button>
      <button id="findBtn" aria-label="Find in conversation"></button>
      <button id="shareBtn" aria-label="Share this conversation"></button>
    </div>
    <div id="mobileMode"></div>
  </body></html>`, { pretendToBeVisual: true }).window.document;
}

test('conversation chrome shows actions, hides landing controls and mounts mobile overflow', () => {
  const document = createDocument();
  let syncs = 0;
  document.defaultView.syncConversationActive = () => { syncs += 1; };

  setConversationChrome(true, document);

  for (const element of document.querySelectorAll('.chat-top-bar .btn-group > *')) {
    assert.equal(element.style.display, '');
  }
  assert.equal(document.getElementById('mobileMode').style.display, 'none');
  assert.equal(document.getElementById('mobileIncognitoBtn').style.display, 'none');
  assert.equal(document.getElementById('mobileConversationMoreBtn').hidden, false);
  assert.ok(document.getElementById('mobileConversationMoreMenu'));
  assert.equal(syncs, 1);
});

test('mobile overflow delegates to the existing find and share actions', () => {
  const document = createDocument();
  let finds = 0;
  let shares = 0;
  document.getElementById('findBtn').addEventListener('click', () => { finds += 1; });
  document.getElementById('shareBtn').addEventListener('click', () => { shares += 1; });

  setConversationChrome(true, document);
  const more = document.getElementById('mobileConversationMoreBtn');
  const menu = document.getElementById('mobileConversationMoreMenu');
  more.click();
  assert.equal(menu.hidden, false);
  assert.equal(more.getAttribute('aria-expanded'), 'true');
  menu.querySelector('[data-mobile-conversation-action="find"]').click();
  assert.equal(finds, 1);
  assert.equal(menu.hidden, true);

  more.click();
  menu.querySelector('[data-mobile-conversation-action="share"]').click();
  assert.equal(shares, 1);
});

test('landing chrome hides desktop actions and restores mobile controls', () => {
  const document = createDocument();
  setConversationChrome(true, document);
  setConversationChrome(false, document);

  for (const element of document.querySelectorAll('.chat-top-bar .btn-group > *')) {
    assert.equal(element.style.display, 'none');
  }
  assert.equal(document.getElementById('mobileMode').style.display, '');
  assert.equal(document.getElementById('mobileIncognitoBtn').style.display, '');
  assert.equal(document.getElementById('mobileConversationMoreBtn').hidden, true);
  assert.equal(document.getElementById('mobileConversationMoreMenu').hidden, true);
});
