/** Unit coverage of the real turn UI module. Rendering/delegation is covered
 * by e2e/chat-stop-resend.spec.mjs rather than copied production logic. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const { setChatStopState } = await import('../src/chat/turn/composer.ts');
const { cancelActiveTurn, detachActiveTurn } = await import('../src/chat/turn/cancelActiveTurn.ts');
const { resendLastUserMessage } = await import('../src/chat/turn/resend.ts');
const { turnState } = await import('../src/chat/turn/state.ts');
const { dispatchSession } = await import('../src/store/index.ts');

function setMessages(messages) {
  dispatchSession({ type: 'session/replace-messages', payload: messages });
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

  for (const inProgress of [true, false]) {
    setChatStopState(inProgress);
    assert.equal(
      btn.dataset.stop === '1',
      inProgress,
      `inProgress=${inProgress} should ${inProgress ? '' : 'not '}present Stop`,
    );
    assert.equal(
      btn.classList.contains('chat-stop'),
      inProgress,
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

test('resend without a user message returns false and shows a toast', () => {
  document.body.innerHTML = '';
  setMessages([{ role: 'assistant', clientId: 'a1', content: 'no preceding user message' }]);

  assert.equal(resendLastUserMessage(), false);
  assert.equal(document.querySelectorAll('.msg-toast').length, 1);
});

test('cancellation uses the original request if renderer cleanup installs a new one', (t) => {
  const calls = [];
  t.after(() => {
    turnState.activeChatCtl = null;
    turnState.activeChatAbort = null;
  });
  const newRequest = () => calls.push('new request');
  turnState.activeChatCtl = {
    abort() {
      turnState.activeChatAbort = newRequest;
    },
  };
  turnState.activeChatAbort = (reason) => calls.push(reason);

  cancelActiveTurn('user-stop');

  assert.deepEqual(calls, ['user-stop']);
  assert.equal(turnState.activeChatAbort, newRequest);
});

test('superseding a turn keeps the precreated renderer and cancels the previous request', (t) => {
  const calls = [];
  t.after(() => {
    turnState.activeChatCtl = null;
    turnState.activeChatAbort = null;
  });
  const precreated = {
    abort() {
      calls.push('renderer');
    },
  };
  turnState.activeChatCtl = precreated;
  turnState.activeChatAbort = (reason) => calls.push(reason);

  cancelActiveTurn('superseded', precreated);

  assert.deepEqual(calls, ['superseded']);
  assert.equal(turnState.activeChatCtl, precreated);
});

test('leaving a session aborts the request and renderer once and releases local ownership', () => {
  const calls = [];
  const abortPreparation = (reason) => calls.push(reason);
  const renderer = {
    abort() {
      calls.push('renderer');
    },
  };
  turnState.activeChatCtl = renderer;
  turnState.pendingFirstTurnController = renderer;
  turnState.activeChatAbort = abortPreparation;
  turnState.activePagePreparationAbort = abortPreparation;
  turnState.chatStreaming = true;
  turnState.chatStopMode = true;
  turnState.turnUi.inProgress = true;

  detachActiveTurn('session-switch');
  detachActiveTurn('session-switch');

  assert.deepEqual(calls, ['session-switch', 'renderer']);
  assert.equal(turnState.activeChatCtl, null);
  assert.equal(turnState.pendingFirstTurnController, null);
  assert.equal(turnState.activeChatAbort, null);
  assert.equal(turnState.activePagePreparationAbort, null);
  assert.equal(turnState.chatStreaming, false);
  assert.equal(turnState.chatStopMode, false);
  assert.equal(turnState.turnUi.inProgress, false);
});
