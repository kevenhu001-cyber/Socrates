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
  const { recoverDetachedTurn } = await import('../src/chat/detachedTurnRecovery.ts');
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
  const { recoverDetachedTurn } = await import('../src/chat/detachedTurnRecovery.ts');
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

test('a completed reconnect replays public runtime events before returning the remaining prose', async () => {
  globalThis.document = { cookie: '' };
  const runtimeEvent = { version: 1, turnId: 'turn-1', seq: 1, at: 100, type: 'generation', phase: 'streaming' };
  globalThis.fetch = async () => jsonResponse({
    turn: { id: 'turn-1', status: 'completed', fullText: 'Recovered.' },
    events: [{ sequence: 10, event: 'turn_event', data: runtimeEvent }],
  });
  const { recoverDetachedTurn } = await import('../src/chat/detachedTurnRecovery.ts');
  const events = [];
  const result = await recoverDetachedTurn('turn-1', { currentFull: '', onDelta() {}, opts: { onTurnEvent: (event) => events.push(event) }, signal: new AbortController().signal });
  assert.deepEqual(events, [runtimeEvent]);
  assert.equal(result.text, 'Recovered.');
});

test('completed recovery restores a checkpoint beyond the initial event-history page', async () => {
  globalThis.document = { cookie: '' };
  const { createTurnRuntime, reduceTurnEvent } = await import('@socrates/core');
  const snapshot = reduceTurnEvent(createTurnRuntime('turn-1'), { version: 1, turnId: 'turn-1', seq: 800, at: 100, type: 'turn.done', phase: 'done' });
  globalThis.fetch = async () => jsonResponse({ turn: { id: 'turn-1', status: 'completed', fullText: 'Done.', turnRuntime: snapshot }, events: [] });
  const { recoverDetachedTurn } = await import('../src/chat/detachedTurnRecovery.ts');
  const snapshots = [];
  await recoverDetachedTurn('turn-1', { currentFull: '', onDelta() {}, opts: { onTurnSnapshot: (value) => snapshots.push(value) }, signal: new AbortController().signal });
  assert.deepEqual(snapshots, [snapshot]);
});

test('reconnect suppresses already visible content and duplicate durable frames', async () => {
  globalThis.document = { cookie: '' };
  globalThis.fetch = async (url) => {
    if (String(url).includes('/events?')) {
      return eventStreamResponse([
        eventFrame(1, 'content', { delta: 'Known ' }),
        eventFrame(2, 'content', { delta: 'answer continues' }),
        eventFrame(2, 'content', { delta: 'answer continues' }),
        eventFrame(3, 'content', { delta: '.' }),
        eventFrame(4, 'turn_done', {}),
        eventFrame(5, 'content', { delta: 'must not appear' }),
      ].join(''));
    }
    return jsonResponse({ turn: { id: 'turn-1', status: 'open' }, events: [] });
  };
  const { recoverDetachedTurn } = await import('../src/chat/detachedTurnRecovery.ts');
  const emitted = [];
  const result = await recoverDetachedTurn('turn-1', {
    currentFull: 'Known answer ', onDelta: (text) => emitted.push(text),
  });
  assert.deepEqual(emitted, ['continues', '.']);
  assert.equal(result.text, 'Known answer continues.');
});

test('stopping recovery aborts a pending snapshot request without publishing late output', async () => {
  globalThis.document = { cookie: '' };
  const abort = new AbortController();
  let requestSignal;
  globalThis.fetch = async (_url, options) => {
    requestSignal = options.signal;
    abort.abort('session-switch');
    return jsonResponse({ turn: { status: 'completed', fullText: 'Late output' }, events: [] });
  };
  const { recoverDetachedTurn } = await import('../src/chat/detachedTurnRecovery.ts');
  const emitted = [];
  const result = await recoverDetachedTurn('turn-1', {
    signal: abort.signal, onDelta: (text) => emitted.push(text),
  });
  assert.equal(requestSignal.aborted, true);
  assert.equal(requestSignal.reason, 'session-switch');
  assert.equal(result, null);
  assert.deepEqual(emitted, []);
});

test('active recovery starts subscribing after a single snapshot round trip', async () => {
  globalThis.document = { cookie: '' };
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('/events?')) return eventStreamResponse(eventFrame(1, 'turn_done', {}));
    return jsonResponse({ turn: { status: 'open' }, events: [] });
  };
  const { recoverDetachedTurn } = await import('../src/chat/detachedTurnRecovery.ts');
  await recoverDetachedTurn('turn-1', {});
  assert.equal(calls.length, 2);
  assert.match(calls[1], /\/events\?after=0/);
});

test('a second connection resumes from the last sequence without repeating content or tools', async () => {
  globalThis.document = { cookie: '' };
  let connections = 0;
  const urls = [];
  globalThis.fetch = async (url) => {
    if (String(url).includes('/events?')) {
      urls.push(String(url));
      connections++;
      if (connections === 1) return eventStreamResponse([
        eventFrame(1, 'content', { delta: 'Known ' }),
        eventFrame(2, 'tool_use', { calls: [{ id: 'search-1' }] }),
      ].join(''));
      return eventStreamResponse([
        eventFrame(2, 'tool_use', { calls: [{ id: 'search-1' }] }),
        eventFrame(3, 'content', { delta: 'answer.' }),
        eventFrame(4, 'turn_done', {}),
      ].join(''));
    }
    return jsonResponse({ turn: { status: 'open' }, events: [] });
  };
  const { recoverDetachedTurn } = await import('../src/chat/detachedTurnRecovery.ts');
  const emitted = [];
  const tools = [];
  const result = await recoverDetachedTurn('turn-1', {
    currentFull: 'Known ', onDelta: (text) => emitted.push(text),
    opts: { onToolUse: (calls) => tools.push(calls) },
  });
  assert.deepEqual(emitted, ['answer.']);
  assert.deepEqual(tools, [[{ id: 'search-1' }]]);
  assert.equal(result.text, 'Known answer.');
  assert.match(urls[1], /after=2/);
});
