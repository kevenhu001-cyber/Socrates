import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://app.example.test/',
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;

const { dispatchSession } = await import('../src/store/index.ts');
const { saveState } = await import('../src/session/saveState.ts');
const { ensureSessionSavedBeforeStream } = await import('../src/session/persistence.ts');
const { runStreamAttempt } = await import('../src/chat/streamAttempt.ts');

test('ensureSessionSavedBeforeStream resets failed post signature and recovers on retry', async () => {
  globalThis.window.CURRENT_USER = {
    id: 'user-1',
    email: 'u@example.test',
    name: 'User',
  };
  saveState.saveInFlight = null;
  saveState.saveDirty = false;
  saveState.pendingSnapshot = null;
  dispatchSession({ type: 'session/set', key: 'currentSessionId', value: 'sess-retry-1' });
  dispatchSession({ type: 'session/set', key: 'topic', value: 'Quantum tunneling' });

  let calls = 0;
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    const method = String(init?.method || 'GET').toUpperCase();
    if (target.includes('/api/v2/sessions') && method === 'POST') {
      calls++;
      if (calls === 1) {
        return new Response(JSON.stringify({ message: 'db temporarily busy' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ id: 'sess-retry-1', updatedAt: Date.now() }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('{}', { status: 200 });
  };

  try {
    const result = await ensureSessionSavedBeforeStream();
    assert.equal(result.ok, true);
    assert.equal(
      calls,
      2,
      'must retry POST /api/sessions instead of skipping via stale _lastPosted',
    );
  } finally {
    globalThis.fetch = origFetch;
    delete globalThis.window.CURRENT_USER;
  }
});

test('runStreamAttempt forwards sessionId to createChatTurn when recovering before turn_bound', async () => {
  const createdPayloads = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target.includes('/api/v2/chat/stream')) {
      const encoder = new TextEncoder();
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(': open\n\n'));
          controller.error(new TypeError('network drop mid-stream'));
        },
      });
      return new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }
    if (target.includes('/api/v2/chat-turns') && init?.method === 'POST') {
      createdPayloads.push(JSON.parse(String(init.body)));
      return new Response(
        JSON.stringify({
          turn: {
            id: 'turn-srv-1',
            sessionId: 'sess-bound-1',
            clientTurnId: 'ct-1',
            status: 'completed',
            fullText: 'Recovered text',
          },
          created: false,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (target.includes('/api/v2/chat-turns/turn-srv-1')) {
      return new Response(
        JSON.stringify({
          turn: {
            id: 'turn-srv-1',
            sessionId: 'sess-bound-1',
            clientTurnId: 'ct-1',
            status: 'completed',
            fullText: 'Recovered text',
          },
          events: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response('{}', { status: 200 });
  };

  const turnController = new AbortController();
  try {
    const outcome = await runStreamAttempt({
      messages: [{ role: 'user', content: 'hi' }],
      onDelta: null,
      onThinking: null,
      opts: {
        sessionId: 'sess-bound-1',
        clientTurn: { id: 'ct-1' },
      },
      attempt: 1,
      lastError: null,
      turnController,
      turnSignal: turnController.signal,
      activeTurn: { current: null },
      bindAttemptSignal: () => null,
      onAbortHandle: () => {},
      waitForRetry: async () => false,
      retryWasCancelled: () => false,
      setLastCallError: () => {},
    });
    assert.equal(createdPayloads.length, 1);
    assert.equal(createdPayloads[0].sessionId, 'sess-bound-1');
    assert.equal(outcome.kind, 'success');
    assert.equal(outcome.result.text, 'Recovered text');
  } finally {
    globalThis.fetch = origFetch;
  }
});
