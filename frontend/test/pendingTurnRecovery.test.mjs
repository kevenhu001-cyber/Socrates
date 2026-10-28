/**
 * P_single-recovery-owner — a session must be recovered by exactly one owner.
 *
 * The interrupted-response fallback (a partial bubble with its own Retry
 * button) and the pending-turn re-attach (a live bubble that replays the
 * same answer) used to run side by side, so a reload mid-stream rendered the
 * same text twice. The fallback's Retry button also aborted the live bubble.
 *
 * The re-attach now owns the recovery whenever it can, and only calls the
 * fallback when it cannot (no pending pointer, unreachable turn, or a turn
 * that is already dead).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://app.example.test/',
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;

const { stateStore } = await import('../src/state/store.js');
const { clearPendingTurn, savePendingTurn } = await import('../src/chat/turnClient.ts');
const { reattachPendingTurn } = await import('../src/session/pendingTurnRestore.ts');

const encoder = new TextEncoder();

function jsonResponse(value) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    async text() { return JSON.stringify(value); },
  };
}

function eventStreamResponse(frames) {
  let read = false;
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'text/event-stream' },
    body: {
      getReader() {
        return {
          async read() {
            if (read) return { done: true, value: undefined };
            read = true;
            return { done: false, value: encoder.encode(frames) };
          },
          releaseLock() {},
        };
      },
    },
  };
}

/** A streaming controller that records how it was finalized. */
function makeController() {
  const calls = [];
  return {
    calls,
    append() {},
    appendThinking() {},
    recordToolUse() {},
    recordToolResult() {},
    finish() { calls.push('finish'); },
    replaceWithError(message, retry) { calls.push(['replaceWithError', message, typeof retry]); },
  };
}

function installWindow(ctl, extra = {}) {
  const added = [];
  globalThis.window.addMessage = (role, text) => { added.push([role, text]); return 'client-1'; };
  globalThis.window.addStreamingMessage = async () => ctl;
  globalThis.window.askChatTurn = () => Promise.resolve();
  Object.assign(globalThis.window, extra);
  return added;
}

test('a recoverable pending turn owns the recovery; the partial fallback is not run', async () => {
  stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: 'sess-own' });
  savePendingTurn('sess-own', { turnId: 'turn-own', clientTurnId: 'c-own', lastSeq: 0 });
  const ctl = makeController();
  installWindow(ctl);
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('/events')) return eventStreamResponse('');
    return jsonResponse({ turn: { id: 'turn-own', status: 'open', fullText: '' }, events: [] });
  };

  let fallbackRuns = 0;
  await reattachPendingTurn('sess-own', () => { fallbackRuns += 1; });

  assert.equal(fallbackRuns, 0, 'the live re-attach owns the recovery, so the partial must not be rendered too');
  clearPendingTurn('sess-own');
});

test('with no pending turn the partial fallback owns the recovery', async () => {
  stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: 'sess-none' });
  clearPendingTurn('sess-none');
  const ctl = makeController();
  installWindow(ctl);
  globalThis.fetch = async () => { throw new Error('no request expected'); };

  let fallbackRuns = 0;
  await reattachPendingTurn('sess-none', () => { fallbackRuns += 1; });

  assert.equal(fallbackRuns, 1, 'without a pending turn the partial answer is the only recovery');
});

test('a dead turn hands the recovery back to the partial fallback', async () => {
  stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: 'sess-dead' });
  savePendingTurn('sess-dead', { turnId: 'turn-dead', clientTurnId: 'c-dead', lastSeq: 0 });
  const ctl = makeController();
  installWindow(ctl);
  globalThis.fetch = async (url) => {
    if (String(url).includes('/events')) return eventStreamResponse('');
    return jsonResponse({ turn: { id: 'turn-dead', status: 'failed', fullText: '' }, events: [] });
  };

  let fallbackRuns = 0;
  await reattachPendingTurn('sess-dead', () => { fallbackRuns += 1; });

  assert.equal(fallbackRuns, 1, 'a dead turn cannot own the recovery');
  clearPendingTurn('sess-dead');
});

test('a failed turn is not finalized through the success path', async () => {
  /* P_failed-turn-not-success — finalizing a failed turn with finish()
     renders the truncated answer as a normal reply, clears the error state
     and saves it as a good message: the user never learns the turn failed. */
  stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: 'sess-fail' });
  savePendingTurn('sess-fail', { turnId: 'turn-fail', clientTurnId: 'c-fail', lastSeq: 0 });
  const ctl = makeController();
  installWindow(ctl);
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('/events')) {
      return eventStreamResponse(
        'event: turn_event\ndata: {"turnId":"turn-fail","sequence":1,"event":"turn_failed","data":{}}\n\n',
      );
    }
    return jsonResponse({ turn: { id: 'turn-fail', status: 'open', fullText: '' }, events: [] });
  };

  await reattachPendingTurn('sess-fail');

  assert.equal(
    ctl.calls.some((c) => c === 'finish'),
    false,
    'a failed turn must not be finalized through the success path',
  );
  assert.equal(
    ctl.calls.some((c) => Array.isArray(c) && c[0] === 'replaceWithError'),
    true,
    'a failed turn must be replaced with the error affordance',
  );
  clearPendingTurn('sess-fail');
});

test('a failed subscription closes the bubble instead of leaving it spinning', async () => {
  /* P_subscribe-failure-not-stuck — the bubble owns the live spinner and the
     1 Hz elapsed timer. If the subscription fails and the module simply
     returns, the bubble spins forever with no way to stop it. */
  stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: 'sess-sub' });
  savePendingTurn('sess-sub', { turnId: 'turn-sub', clientTurnId: 'c-sub', lastSeq: 0 });
  const ctl = makeController();
  installWindow(ctl);
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('/events')) throw new Error('subscription lost');
    return jsonResponse({ turn: { id: 'turn-sub', status: 'open', fullText: '' }, events: [] });
  };

  await reattachPendingTurn('sess-sub');

  assert.equal(
    ctl.calls.some((c) => Array.isArray(c) && c[0] === 'replaceWithError'),
    true,
    'the bubble must be closed with the error affordance when the subscription fails',
  );
  clearPendingTurn('sess-sub');
});

test('the session loader never renders the partial fallback on its own', async () => {
  /* P_single-recovery-owner — the loader must reach the partial fallback
     only through the re-attach's fallback callback. A direct call here
     would render the same text a second time next to the live bubble. */
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/session/loader.impl.ts', import.meta.url), 'utf8');
  const directCalls = source.match(/^\s*restoreInterruptedResponse\(/gm) || [];
  assert.equal(
    directCalls.length,
    0,
    'the session loader must not render the partial fallback directly — the re-attach owns the recovery',
  );
  assert.match(
    source,
    /reattachPendingTurn\([^,]+,\s*restorePartialFallback\)/,
    'the loader must hand the partial fallback to the re-attach',
  );
});
