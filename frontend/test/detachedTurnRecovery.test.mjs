import assert from 'node:assert/strict';
import test from 'node:test';

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

function eventFrame(sequence, event, data) {
  return `event: turn_event\ndata: ${JSON.stringify({
    turnId: 'turn-1', sequence, event, data,
  })}\n\n`;
}

test('completed detached turn only emits the text missing from the live stream', async () => {
  globalThis.document = { cookie: '' };
  globalThis.fetch = async () => jsonResponse({
    turn: { id: 'turn-1', status: 'completed', fullText: 'Known answer continues.' },
    events: [],
  });
  const { recoverDetachedTurn } = await import('../src/chat/detachedTurnRecovery.js');
  const emitted = [];

  const result = await recoverDetachedTurn('turn-1', {
    currentFull: 'Known answer ',
    onDelta: (delta) => emitted.push(delta),
    opts: {},
    signal: new AbortController().signal,
  });

  assert.deepEqual(emitted, ['continues.']);
  assert.equal(result.text, 'Known answer continues.');
});

test('open detached turn replays typed events and completes after turn_done', async () => {
  globalThis.document = { cookie: '' };
  const calls = [];
  globalThis.fetch = async (url) => {
    if (String(url).includes('/events?')) {
      return eventStreamResponse([
        eventFrame(1, 'content', { delta: 'Recovered answer.' }),
        eventFrame(2, 'tool_use', [{ id: 'tool-1', name: 'web_search' }]),
        eventFrame(3, 'turn_done', {}),
      ].join(''));
    }
    return jsonResponse({
      turn: { id: 'turn-1', status: 'open', fullText: '' },
      events: [],
    });
  };
  const { recoverDetachedTurn } = await import('../src/chat/detachedTurnRecovery.js');
  const emitted = [];

  const result = await recoverDetachedTurn('turn-1', {
    currentFull: '',
    onDelta: (delta) => emitted.push(delta),
    opts: { onToolUse: (tools) => calls.push(tools) },
    signal: new AbortController().signal,
  });

  assert.deepEqual(emitted, ['Recovered answer.']);
  assert.deepEqual(calls, [[{ id: 'tool-1', name: 'web_search' }]]);
  assert.equal(result.text, 'Recovered answer.');
});
