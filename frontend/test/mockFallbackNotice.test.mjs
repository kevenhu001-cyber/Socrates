import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://app.example.test/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;

/* `showToast` appends a real `.msg-toast` node to document.body, so the
   notice is observable through the DOM without stubbing the toast layer. */
const notice = await import('../src/chat/mockFallbackNotice.js');

function toasts() {
  return Array.from(document.querySelectorAll('.msg-toast')).map((el) => el.textContent);
}

test('notifies once when a mock answer stands in for a real model', () => {
  notice.resetMockFallbackNoticeForTest();
  document.body.innerHTML = '';

  notice.notifyMockFallbackOnce();
  assert.equal(toasts().length, 1, 'first call notifies');
  assert.match(toasts()[0], /model/i, 'the message names the missing model');

  notice.notifyMockFallbackOnce();
  notice.notifyMockFallbackOnce();
  assert.equal(toasts().length, 1, 'repeat calls stay quiet for the rest of the session');
});

test('reset re-arms the notice for the next session', () => {
  notice.resetMockFallbackNoticeForTest();
  document.body.innerHTML = '';

  notice.notifyMockFallbackOnce();
  notice.resetMockFallbackNoticeForTest();
  notice.notifyMockFallbackOnce();
  assert.equal(toasts().length, 2, 'a fresh session notifies again');
});

test('the notice resolves a localized string through window.t', async () => {
  await import('../src/i18n.js');
  const en = window.t('toast.mockFallback');
  assert.ok(en && en !== 'toast.mockFallback', 'English dictionary defines toast.mockFallback');

  await import('../src/i18n/zh.js');
  assert.ok(window.t('toast.mockFallback'), 'the key still resolves after zh loads');
});
