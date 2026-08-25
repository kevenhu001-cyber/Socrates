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
    offlineGuard: () => false,
    STREAM_TIMEOUT_MS: 10_000,
    STREAM_HEARTBEAT_MS: 10_000,
    STREAM_MAX_ATTEMPTS: 6,
    appMode: 'chat',
  };
  globalThis.fetch = async () => {
    const response = responses[Math.min(calls, responses.length - 1)];
    calls += 1;
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
  const { callAPIStream } = await import('../src/chat/stream.js');
  return callAPIStream(
    [{ role: 'user', content: 'retry me' }],
    256,
    () => {},
    () => {},
    { maxAttempts: options.maxAttempts || 2, sleep: async () => {}, onRetry: options.onRetry },
  );
}

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
