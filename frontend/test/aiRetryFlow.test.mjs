import assert from 'node:assert/strict';
import test from 'node:test';

const encoder = new TextEncoder();

function streamBody(chunks) {
  let index = 0;
  return {
    getReader() {
      return {
        async read() {
          if (index < chunks.length) {
            return { value: encoder.encode(chunks[index++]), done: false };
          }
          return { value: undefined, done: true };
        },
        async cancel() {},
        releaseLock() {},
      };
    },
    async cancel() {},
  };
}

function installStreamEnvironment(responses) {
  const state = { lastCallError: null };
  let calls = 0;
  globalThis.document = { cookie: '' };
  globalThis.window = {
    state,
    getActiveProvider: () => ({ isBuiltIn: false, name: 'test' }),
    addEventListener() {},
    appMode: 'chat',
  };
  globalThis.fetch = async (url, opts) => {
    calls += 1;
    if (typeof responses === 'function') {
      return responses(url, opts, calls);
    }
    const response = responses[Math.min(calls - 1, responses.length - 1)];
    if (response.status) {
      const body = response.body || {};
      return {
        ok: false,
        status: response.status,
        statusText: response.statusText || `HTTP ${response.status}`,
        async text() { return JSON.stringify(body); },
      };
    }
    return { ok: true, status: 200, body: streamBody(response.chunks || []) };
  };
  return { state, calls: () => calls };
}

async function runStream(options = {}) {
  const { callAPIStream } = await import('../src/chat/stream.ts');
  return callAPIStream(
    [{ role: 'user', content: 'retry me' }],
    256,
    () => {},
    () => {},
    { maxAttempts: options.maxAttempts || 2, sleep: async () => {}, onRetry: options.onRetry },
  );
}

test('stream never replays an exhausted server-side provider retry budget', async () => {
  for (const response of [
    { status: 429, body: { message: 'model busy', code: 'LLM_UPSTREAM_ERROR', retryable: false } },
    { chunks: ['event: error\ndata: {"message":"model busy","status":429,"code":"LLM_UPSTREAM_ERROR","retryable":false}\n\ndata: [DONE]\n\n'] },
    { chunks: ['event: error\ndata: {"message":"select Low thinking","status":400,"code":"MODEL_MODE_UNSUPPORTED","retryable":false}\n\ndata: [DONE]\n\n'] },
  ]) {
    const env = installStreamEnvironment([response]);
    await runStream();
    assert.equal(env.calls(), 1);
  }
});

test('HTTP and SSE cooldowns reach the error UI without a second request', async () => {
  const body = { message: 'model busy', status: 429, code: 'LLM_UPSTREAM_ERROR', retryable: false, retryAfterMs: 30_001 };
  for (const response of [
    { status: 429, body },
    { chunks: [`event: error\ndata: ${JSON.stringify(body)}\n\ndata: [DONE]\n\n`] },
  ]) {
    const env = installStreamEnvironment([response]);
    await runStream();
    assert.equal(env.calls(), 1);
    const { stateStore } = await import('../src/state/store.ts');
    assert.match(stateStore.read('lastCallError'), /31s/);
  }
});

test('stream retries a transient HTTP failure once before visible output', async () => {
  const notices = [];
  const env = installStreamEnvironment([
    { status: 503, body: { message: 'upstream unavailable' } },
    { chunks: ['data: {"choices":[{"delta":{"content":"recovered"}}]}\n\n'] },
  ]);

  const result = await runStream({ onRetry: (notice) => notices.push(notice) });

  assert.equal(result?.text, 'recovered');
  assert.equal(env.calls(), 2);
  assert.deepEqual(notices.map((notice) => [notice.retryNumber, notice.delayMs]), [[1, 5000]]);
});

test('stream retries a 200 empty response but never replays semantic output', async () => {
  const env = installStreamEnvironment([
    { chunks: ['data: [DONE]\n\n'] },
    { chunks: ['data: {"choices":[{"delta":{"content":"usable"}}]}\n\n'] },
  ]);
  const recovered = await runStream();
  assert.equal(recovered?.text, 'usable');
  assert.equal(env.calls(), 2);

  const semanticEnv = installStreamEnvironment([
    { chunks: [
      'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n',
      'event: error\ndata: {"status":503,"message":"late failure"}\n\n',
    ] },
    { chunks: ['data: {"choices":[{"delta":{"content":"duplicate"}}]}\n\n'] },
  ]);
  const failed = await runStream();
  assert.equal(failed, null);
  assert.equal(semanticEnv.calls(), 1);
});

test('stream does not retry terminal quota errors', async () => {
  const env = installStreamEnvironment([
    { chunks: ['event: error\ndata: {"status":429,"code":"MONTHLY_LIMIT","message":"quota reached"}\n\n'] },
    { chunks: ['data: {"choices":[{"delta":{"content":"should not replay"}}]}\n\n'] },
  ]);

  const result = await runStream();

  assert.equal(result, null);
  assert.equal(env.calls(), 1);
});

test('stream treats reasoning tokens as semantic output and does not retry', async () => {
  const env = installStreamEnvironment([
    { chunks: [
      'data: {"choices":[{"delta":{"reasoning_content":"thinking deeply..."}}]}\n\n',
      'data: [DONE]\n\n',
    ] },
    { chunks: ['data: {"choices":[{"delta":{"content":"should never be called"}}]}\n\n'] },
  ]);

  let thinkingReceived = '';
  const { callAPIStream } = await import('../src/chat/stream.ts');
  const result = await callAPIStream(
    [{ role: 'user', content: 'reasoning question' }],
    256,
    () => {},
    (t) => { thinkingReceived += t; },
    { maxAttempts: 2, sleep: async () => {} },
  );

  assert.equal(thinkingReceived, 'thinking deeply...');
  assert.equal(result?.semanticActivity, true);
  assert.equal(env.calls(), 1, 'turn must not be replayed when reasoning was delivered');
});

test('stream reconnects to detached turn when execution is already claimed', async () => {
  installStreamEnvironment((url) => {
    if (String(url).includes('turn-claimed-1')) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        async text() {
          return JSON.stringify({
            turn: { id: 'turn-claimed-1', status: 'completed', fullText: 'recovered from claimed turn' },
            events: [],
          });
        },
      };
    }
    return {
      ok: true,
      status: 200,
      body: streamBody([
        'event: turn_bound\ndata: {"turnId":"turn-claimed-1"}\n\n',
        'event: error\ndata: {"status":409,"code":"CONFLICT","message":"This turn has already been claimed. Reconnect to its events or create a new turn to retry."}\n\n',
        'data: [DONE]\n\n',
      ]),
    };
  });

  const { callAPIStream } = await import('../src/chat/stream.ts');
  const result = await callAPIStream(
    [{ role: 'user', content: 'test claim' }],
    256,
    () => {},
    () => {},
    { maxAttempts: 2, sleep: async () => {} },
  );

  assert.equal(result?.text, 'recovered from claimed turn');
});

test('stream retry renews clientTurn.id so attempt 2 does not collide with attempt 1', async () => {
  const seenClientTurnIds = [];
  const clientTurn = { id: 'turn-initial-123' };
  installStreamEnvironment((url, opts) => {
    if (String(url).includes('chat/stream') && opts?.body) {
      try {
        const parsed = JSON.parse(opts.body);
        if (parsed.clientTurn?.id) {
          seenClientTurnIds.push(parsed.clientTurn.id);
        }
      } catch { /* empty-catch: intentional — malformed test body */ }
    }
    if (seenClientTurnIds.length === 1) {
      return {
        ok: true,
        status: 200,
        body: streamBody(['data: [DONE]\n\n']),
      };
    }
    return {
      ok: true,
      status: 200,
      body: streamBody(['data: {"choices":[{"delta":{"content":"success on retry"}}]}\n\n']),
    };
  });

  const { callAPIStream } = await import('../src/chat/stream.ts');
  const result = await callAPIStream(
    [{ role: 'user', content: 'test retry client turn id' }],
    256,
    () => {},
    () => {},
    { maxAttempts: 2, sleep: async () => {}, clientTurn },
  );

  assert.equal(result?.text, 'success on retry');
  assert.equal(seenClientTurnIds.length, 2);
  assert.equal(seenClientTurnIds[0], 'turn-initial-123');
  assert.notEqual(seenClientTurnIds[1], 'turn-initial-123');
  assert.equal(clientTurn.id, seenClientTurnIds[1]);
});

test('turn execution conflict sanitizes lastCallError when detached recovery fails', async () => {
  installStreamEnvironment((url) => {
    if (String(url).includes('turn-fail-1')) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        async text() {
          return JSON.stringify({
            turn: { id: 'turn-fail-1', status: 'failed', fullText: '' },
            events: [],
          });
        },
      };
    }
    return {
      ok: true,
      status: 200,
      body: streamBody([
        'event: turn_bound\ndata: {"turnId":"turn-fail-1"}\n\n',
        'event: error\ndata: {"status":409,"code":"CONFLICT","message":"This turn has already been claimed. Reconnect to its events or create a new turn to retry."}\n\n',
        'data: [DONE]\n\n',
      ]),
    };
  });

  const { callAPIStream } = await import('../src/chat/stream.ts');
  const { stateStore } = await import('../src/state/store.ts');
  const result = await callAPIStream(
    [{ role: 'user', content: 'test claim fail' }],
    256,
    () => {},
    () => {},
    { maxAttempts: 2, sleep: async () => {} },
  );

  assert.equal(result, null);
  const lastError = stateStore.read('lastCallError');
  assert.ok(lastError);
  assert.equal(lastError.includes('already been claimed'), false);
  assert.equal(lastError.includes('Turn execution conflict'), true);
});

test('a retried turn interrupts the superseded server turn instead of leaving it running', async () => {
  /* P_retry-abandons-superseded-turn — a retry renews clientTurn.id and opens
     a NEW server turn. Without an explicit interrupt the previous turn keeps
     generating upstream tokens until the server's stale-turn reclaim runs
     (120 s), so one user action can leave several concurrent paid
     generations. */
  const requested = [];
  installStreamEnvironment((url, opts) => {
    const target = String(url);
    requested.push(target);
    if (target.includes('/interrupt')) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        async text() {
          return JSON.stringify({ turn: { id: 'turn-orphan-1', status: 'interrupted' }, idempotent: false });
        },
      };
    }
    if (requested.filter((r) => r.includes('/chat/stream')).length === 1) {
      return {
        ok: true,
        status: 200,
        body: streamBody([
          'event: turn_bound\ndata: {"turnId":"turn-orphan-1"}\n\n',
          'data: [DONE]\n\n',
        ]),
      };
    }
    return {
      ok: true,
      status: 200,
      body: streamBody(['data: {"choices":[{"delta":{"content":"second attempt"}}]}\n\n']),
    };
  });

  const { callAPIStream } = await import('../src/chat/stream.ts');
  const result = await callAPIStream(
    [{ role: 'user', content: 'leave no orphan' }],
    256,
    () => {},
    () => {},
    { maxAttempts: 2, sleep: async () => {}, clientTurn: { id: 'turn-client-1' } },
  );

  assert.equal(result?.text, 'second attempt');
  /* The abandoned turn must be interrupted on the server. */
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(
    requested.some((r) => r.includes('/chat-turns/turn-orphan-1/interrupt')),
    `the superseded turn was never interrupted (requests: ${JSON.stringify(requested)})`,
  );
});

test('a retry that rebinds the same turn does not interrupt it', async () => {
  /* The next attempt rebinds the SAME turn when an explicit turnId is
     supplied — interrupting it would kill the attempt that is about to
     start. */
  const requested = [];
  installStreamEnvironment((url) => {
    const target = String(url);
    requested.push(target);
    if (target.includes('/interrupt')) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        async text() { return JSON.stringify({ turn: { id: 'turn-same-1', status: 'interrupted' }, idempotent: false }); },
      };
    }
    if (requested.filter((r) => r.includes('/chat/stream')).length === 1) {
      return {
        ok: true,
        status: 200,
        body: streamBody([
          'event: turn_bound\ndata: {"turnId":"turn-same-1"}\n\n',
          'data: [DONE]\n\n',
        ]),
      };
    }
    return {
      ok: true,
      status: 200,
      body: streamBody(['data: {"choices":[{"delta":{"content":"rebound"}}]}\n\n']),
    };
  });

  const { callAPIStream } = await import('../src/chat/stream.ts');
  const result = await callAPIStream(
    [{ role: 'user', content: 'rebind the same turn' }],
    256,
    () => {},
    () => {},
    { maxAttempts: 2, sleep: async () => {}, turnId: 'turn-same-1' },
  );

  assert.equal(result?.text, 'rebound');
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(
    requested.some((r) => r.includes('/interrupt')),
    false,
    'rebinding the same turn must not interrupt it',
  );
});
