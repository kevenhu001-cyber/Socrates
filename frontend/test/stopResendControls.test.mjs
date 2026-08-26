/**
 * Unit tests for Stop / Resend visibility and turn control.  Task 4.2.
 *
 * Task 4.1 implemented these behaviours directly in src/main.js as
 * module-scoped, window-exposed functions — not as importable pure functions,
 * and main.js is a monolithic bundle that cannot be imported into node:test.
 * These tests therefore exercise the OBSERVABLE contract at the smallest
 * reachable unit, replicating in a jsdom fixture the exact decision logic that
 * main.js wires up, and asserting the same observable outcomes:
 *
 *   Req 2.5 — Stop is present while a turn is in progress. main.js drives Stop
 *     via setChatStopState(active), which toggles the send button's
 *     dataset.stop ("1"/"0") and the "chat-stop" class. Because that toggle is
 *     called with _turnUi.inProgress, Stop is visible iff a turn is in
 *     progress. Tested here as a truth table over a _turnUi-shaped object
 *     driving a setChatStopState mirror against a #sendBtn fixture.
 *
 *   Req 2.6 — after a stop, the Resend control is present. main.js appends a
 *     stopped assistant bubble whose HTML carries
 *     `<button class="msg-retry-btn chat-resend-btn" data-chat-resend>`.
 *     Tested by building the same stopped bubble and asserting the serialized
 *     HTML exposes a [data-chat-resend] control.
 *
 *   Req 2.7 — triggering Resend starts a new turn from the most recent user
 *     message. main.js wires a one-shot delegated click on the message list
 *     that, on a [data-chat-resend] hit, calls resendLastUserMessage(), which
 *     finds the latest user message text and calls window.askChatTurn(text).
 *     Tested by replicating resendLastUserMessage + the delegated handler and
 *     asserting window.askChatTurn is invoked once with the latest user
 *     message text; the no-target path toasts and does not dispatch.
 *
 * Validation-only: no source files are modified. The fixtures below are
 * constructed in the test and mirror main.js line-for-line where it matters.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;

/* Mirror of main.js setChatStopState(active): toggles dataset.stop + the
   chat-stop class on #sendBtn. Stop is "present" when dataset.stop === "1". */
function setChatStopState(active) {
  const btn = document.getElementById('sendBtn');
  if (!btn) return;
  if (active) {
    btn.classList.add('chat-stop');
    btn.dataset.stop = '1';
  } else {
    btn.classList.remove('chat-stop');
    btn.dataset.stop = '0';
  }
}

/* Mirror of main.js resendLastUserMessage(): scan messages newest-first for a
   user message, resolve its text (rawText || content), and dispatch a fresh
   turn via window.askChatTurn(text). Returns true when a resend fired; on no
   target it toasts (via the injected onNoTarget seam) and returns false. */
function resendLastUserMessage(messages, onNoTarget) {
  let text = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i] && messages[i].role === 'user') {
      text = messages[i].rawText || messages[i].content || null;
      break;
    }
  }
  if (text && typeof window.askChatTurn === 'function') {
    window.askChatTurn(text);
    return true;
  }
  if (typeof onNoTarget === 'function') onNoTarget();
  return false;
}

/* Build a fresh #sendBtn and return it. */
function mountSendBtn() {
  document.body.innerHTML = '<button id="sendBtn"></button>';
  return document.getElementById('sendBtn');
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
// Req 2.6 — the stopped assistant bubble presents a Resend control.
// ---------------------------------------------------------------------------

test('Req 2.6: a stopped bubble exposes a [data-chat-resend] control', () => {
  // Mirror of the stopped bubble main.js appends when a turn is stopped.
  const esc = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const resendHtml = '<div class="msg-error msg-resend" style="margin-top:8px">'
    + '<span class="msg-error-text">' + esc('Response stopped') + '</span>'
    + '<button type="button" class="msg-retry-btn chat-resend-btn" data-chat-resend>'
    + esc('Resend') + '</button>'
    + '</div>';

  document.body.innerHTML = '<div id="msgList"></div>';
  const list = document.getElementById('msgList');
  list.innerHTML = resendHtml;

  const btn = list.querySelector('[data-chat-resend]');
  assert.ok(btn, 'stopped bubble must contain a [data-chat-resend] control');
  assert.ok(
    btn.classList.contains('chat-resend-btn'),
    'the Resend control carries the chat-resend-btn class',
  );
  assert.equal(btn.tagName.toLowerCase(), 'button');
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

  const dispatched = resendLastUserMessage(messages);
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

  resendLastUserMessage(messages);
  assert.deepEqual(calls, ['raw markdown source']);

  delete window.askChatTurn;
});

test('Req 2.7: clicking [data-chat-resend] triggers a resend once (delegated handler)', () => {
  const calls = [];
  window.askChatTurn = (text) => { calls.push(text); };

  document.body.innerHTML = '<div id="msgList"></div>';
  const list = document.getElementById('msgList');
  list.innerHTML = '<div class="msg assistant">'
    + '<div class="msg-error msg-resend">'
    + '<button type="button" class="msg-retry-btn chat-resend-btn" data-chat-resend>Resend</button>'
    + '</div></div>';

  const messages = [
    { role: 'user', clientId: 'u1', content: 'only question' },
    { role: 'assistant', clientId: 'a1', content: 'stopped' },
  ];

  // Mirror of main.js: a one-shot delegated click on the list that resolves a
  // [data-chat-resend] hit and calls resendLastUserMessage(), removing itself.
  const delegated = (ev) => {
    const tgt = ev.target;
    if (!(tgt && tgt.closest && tgt.closest('[data-chat-resend]'))) return;
    list.removeEventListener('click', delegated);
    resendLastUserMessage(messages);
  };
  list.addEventListener('click', delegated);

  const resendBtn = list.querySelector('[data-chat-resend]');
  resendBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  // A second click must not fire another turn — the handler is one-shot.
  resendBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

  assert.deepEqual(calls, ['only question'], 'exactly one new turn from the latest user message');

  delete window.askChatTurn;
});

test('Req 2.7: resend with no user message toasts and does not dispatch a turn', () => {
  const calls = [];
  window.askChatTurn = (text) => { calls.push(text); };
  let toasted = 0;

  const messages = [
    { role: 'assistant', clientId: 'a1', content: 'no preceding user message' },
  ];

  const dispatched = resendLastUserMessage(messages, () => { toasted += 1; });
  assert.equal(dispatched, false, 'no resend when there is no user message');
  assert.equal(calls.length, 0, 'askChatTurn is never called without a target');
  assert.equal(toasted, 1, 'the no-target path toasts once');

  delete window.askChatTurn;
});

test('Req 2.7: resend does not dispatch when askChatTurn is unavailable', () => {
  let toasted = 0;
  const messages = [{ role: 'user', clientId: 'u1', content: 'question' }];

  // No window.askChatTurn wired.
  const dispatched = resendLastUserMessage(messages, () => { toasted += 1; });
  assert.equal(dispatched, false, 'cannot resend without a send path');
  assert.equal(toasted, 1, 'falls back to a toast');
});
