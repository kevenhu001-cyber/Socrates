/** Unit coverage of the real turn UI module. Rendering/delegation is covered
 * by e2e/chat-stop-resend.spec.mjs rather than copied production logic. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const { setChatStopState, resendLastUserMessage } = await import('../src/chat/turnUi.js');
const { stateStore } = await import('../src/state/store.js');

function setMessages(messages) {
  stateStore.dispatch({ type: 'session/replace-messages', payload: messages });
}

/* Build a fresh #composerPrimaryBtn and return it. */
function mountSendBtn() {
  document.body.innerHTML = '<button id="composerPrimaryBtn"></button>';
  return document.getElementById('composerPrimaryBtn');
}

// ---------------------------------------------------------------------------
// Req 2.5 — Stop is present while a turn is in progress (truth table).
// ---------------------------------------------------------------------------

test('Req 2.5: Stop is present iff the turn is in progress', () => {
  const btn = mountSendBtn();

  // _turnUi-shaped states: Stop visibility is driven by inProgress.
  const cases = [
    { turnUi: { inProgress: true, lastUserMessageId: 'u1' }, stopPresent: true },
    { turnUi: { inProgress: false, lastUserMessageId: 'u1' }, stopPresent: false },
    { turnUi: { inProgress: true, lastUserMessageId: null }, stopPresent: true },
    { turnUi: { inProgress: false, lastUserMessageId: null }, stopPresent: false },
  ];

  for (const { turnUi, stopPresent } of cases) {
    setChatStopState(turnUi.inProgress);
    assert.equal(
      btn.dataset.stop === '1',
      stopPresent,
      `inProgress=${turnUi.inProgress} should ${stopPresent ? '' : 'not '}present Stop`,
    );
    assert.equal(
      btn.classList.contains('chat-stop'),
      stopPresent,
      'chat-stop class must mirror Stop presence',
    );
  }
});

test('Req 2.5/2.6: Stop present during a turn, gone after the turn ends', () => {
  const btn = mountSendBtn();

  // Turn starts → Stop present.
  setChatStopState(true);
  assert.equal(btn.dataset.stop, '1', 'Stop present while in progress');

  // Turn ends (stop/finish/abort) → Stop removed, clearing the way for Resend.
  setChatStopState(false);
  assert.equal(btn.dataset.stop, '0', 'Stop removed once the turn ends');
  assert.equal(btn.classList.contains('chat-stop'), false);
});

// ---------------------------------------------------------------------------
// Req 2.7 — Resend starts a new turn from the most recent user message.
// ---------------------------------------------------------------------------

test('Req 2.7: resend dispatches askChatTurn with the latest user message text', () => {
  const calls = [];
  window.askChatTurn = (text) => { calls.push(text); };

  const messages = [
    { role: 'user', clientId: 'u1', content: 'first question' },
    { role: 'assistant', clientId: 'a1', content: 'first answer' },
    { role: 'user', clientId: 'u2', content: 'second question' },
    { role: 'assistant', clientId: 'a2', content: 'stopped mid-answer' },
  ];

  setMessages(messages);
  const dispatched = resendLastUserMessage();
  assert.equal(dispatched, true, 'resend fires when a user message exists');
  assert.deepEqual(calls, ['second question'], 'starts a new turn from the most recent user message');

  delete window.askChatTurn;
});

test('Req 2.7: resend prefers rawText over content for the user message', () => {
  const calls = [];
  window.askChatTurn = (text) => { calls.push(text); };

  const messages = [
    { role: 'user', clientId: 'u1', rawText: 'raw markdown source', content: 'rendered content' },
  ];

  setMessages(messages);
  resendLastUserMessage();
  assert.deepEqual(calls, ['raw markdown source']);

  delete window.askChatTurn;
});

test('Req 2.7: resend with no user message toasts and does not dispatch a turn', () => {
  const calls = [];
  window.askChatTurn = (text) => { calls.push(text); };
  document.body.innerHTML = '';

  const messages = [
    { role: 'assistant', clientId: 'a1', content: 'no preceding user message' },
  ];

  setMessages(messages);
  const dispatched = resendLastUserMessage();
  assert.equal(dispatched, false, 'no resend when there is no user message');
  assert.equal(calls.length, 0, 'askChatTurn is never called without a target');
  assert.equal(document.querySelectorAll('.msg-toast').length, 1, 'the no-target path toasts once');

  delete window.askChatTurn;
});

test('Req 2.7: resend does not dispatch when askChatTurn is unavailable', () => {
  document.body.innerHTML = '';
  const messages = [{ role: 'user', clientId: 'u1', content: 'question' }];

  // No window.askChatTurn wired.
  setMessages(messages);
  const dispatched = resendLastUserMessage();
  assert.equal(dispatched, false, 'cannot resend without a send path');
  assert.equal(document.querySelectorAll('.msg-toast').length, 1, 'falls back to a toast');
});
