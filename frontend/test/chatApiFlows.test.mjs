import assert from 'node:assert/strict';
import test from 'node:test';

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};
globalThis.sessionStorage = {
  getItem: (key) => storage.get(`session:${key}`) ?? null,
  setItem: (key, value) => storage.set(`session:${key}`, String(value)),
};
globalThis.document = { cookie: '' };
globalThis.window = {
  appMode: 'chat',
};

const { callAPI, callAPIChat, buildChatRequestBody } = await import('../src/chat/api.ts');
const { stateStore } = await import('../src/state/store.ts');
const { setAppMode } = await import('../src/config/providers.ts');
const { publishProviderConfig } = await import('../src/config/providerConfig.store.ts');
const encoder = new TextEncoder();

function setProvider(provider) {
  if (!provider) {
    publishProviderConfig({ providers: [], activeId: null, fetched: true });
    return;
  }
  const active = {
    id: 'test-provider', label: 'Test provider', url: 'https://provider.example/v1',
    model: 'test-model', vision: false, isBuiltIn: false, hasKey: true,
    instantEncoding: null, ...provider,
  };
  publishProviderConfig({ providers: [active], activeId: active.id, fetched: true });
}

function streamResponse(frames) {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(frames.join('')));
      controller.close();
    },
  });
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
}

function clearContext() {
  setProvider(null);
  stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: null });
  stateStore.dispatch({ type: 'state/set', key: 'currentProjectId', value: null });
  stateStore.dispatch({ type: 'state/set', key: 'lastCallError', value: null });
  storage.delete('session:socrates-active-assistant');
  storage.delete('socrates-response-speed');
  setAppMode('chat');
  storage.delete('socrates-custom-instructions');
  storage.delete('socrates-reasoning-effort');
}

test('request body copies messages and includes session, project, assistant, and preference context', () => {
  clearContext();
  stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: 'session-7' });
  stateStore.dispatch({ type: 'state/set', key: 'currentProjectId', value: 'project-3' });
  sessionStorage.setItem('socrates-active-assistant', 'assistant-2');
  localStorage.setItem('socrates-response-speed', 'fast');
  setAppMode('tutor');
  localStorage.setItem('socrates-custom-instructions', JSON.stringify({
    response: 'Prefer concise explanations.', about: '', savedAt: '',
  }));
  localStorage.setItem('socrates-reasoning-effort', 'high');
  const messages = [{ role: 'user', content: 'Explain recursion.' }];

  const body = buildChatRequestBody(messages, 600, 0.7);

  assert.equal(body.mode, 'tutor');
  assert.equal(body.response_speed, 'fast');
  assert.equal(body.sessionId, 'session-7');
  assert.equal(body.ragSessionId, 'session-7');
  assert.equal(body.projectId, 'project-3');
  assert.equal(body.assistantId, 'assistant-2');
  assert.equal(body.reasoning_effort, 'high');
  assert.equal('getCustomInstructionsString' in window, false);
  assert.equal('getReasoningEffort' in window, false);
  assert.deepEqual(body.messages[0], {
    role: 'system', content: '[User custom instructions]\n[How to respond]\nPrefer concise explanations.',
  });
  assert.deepEqual(messages, [{ role: 'user', content: 'Explain recursion.' }]);
  clearContext();
});

test('API facade routes custom providers and reports a missing provider', async () => {
  clearContext();
  let request;
  globalThis.fetch = async (path, options) => {
    request = { path, options };
    return new Response(JSON.stringify({ content: 'custom answer' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  setProvider({ isBuiltIn: false });

  assert.equal(await callAPI([{ role: 'user', content: 'hi' }], 100, { maxRetries: 0 }), 'custom answer');
  assert.equal(new URL(request.path, 'http://localhost').pathname, '/api/v2/chat');
  assert.deepEqual(JSON.parse(request.options.body).messages, [{ role: 'user', content: 'hi' }]);

  setProvider(null);
  assert.equal(await callAPI([], 100, { maxRetries: 0 }), null);
  assert.equal(stateStore.read('lastCallError'), 'no provider');
});

test('built-in provider uses the raw endpoint and parses a successful completion', async () => {
  clearContext();
  const requests = [];
  setProvider({ isBuiltIn: true, key: 'beagle-test-key' });
  globalThis.fetch = async (path, options) => {
    requests.push({ path, options });
    return new Response(JSON.stringify({ choices: [{ message: { content: 'built-in answer' } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  assert.equal(await callAPI([{ role: 'user', content: 'hi' }], 100, { maxRetries: 0 }), 'built-in answer');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].path, '/api/v2/minimax/v1/chat/completions');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer beagle-test-key');
});

test('monthly limits are terminal for custom-provider calls', async () => {
  clearContext();
  let requests = 0;
  setProvider({ isBuiltIn: false });
  globalThis.fetch = async () => {
    requests += 1;
    return new Response(JSON.stringify({
      code: 'MONTHLY_LIMIT', message: 'Try again next month.',
    }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  assert.equal(await callAPI([], 100), null);
  assert.equal(requests, 1);
  assert.equal(stateStore.read('lastCallError'), 'Monthly Beagle usage limit reached. Try again next month.');
});

test('probe retries transient SSE errors before output and then returns the complete text', async () => {
  clearContext();
  let requests = 0;
  setProvider({ isBuiltIn: false });
  globalThis.fetch = async () => {
    requests += 1;
    if (requests === 1) return streamResponse(['event: error\ndata: {"status":503,"message":"temporary"}\n\n']);
    return streamResponse(['data: {"choices":[{"delta":{"content":"full answer"}}]}\n\n']);
  };

  const result = await callAPIChat([{ role: 'user', content: 'probe' }], 100, {
    maxRetries: 1,
    sleep: async () => {},
  });

  assert.deepEqual(result, { text: 'full answer', html: null, widgets: [], cancelled: false });
  assert.equal(requests, 2);
});

test('probe never replays after semantic output has started', async () => {
  clearContext();
  let requests = 0;
  setProvider({ isBuiltIn: false });
  globalThis.fetch = async () => {
    requests += 1;
    return streamResponse([
      'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n',
      'event: error\ndata: {"status":503,"message":"late failure"}\n\n',
    ]);
  };

  assert.equal(await callAPIChat([{ role: 'user', content: 'probe' }], 100, { maxRetries: 3, sleep: async () => {} }), null);
  assert.equal(requests, 1);
  assert.match(stateStore.read('lastCallError'), /late failure/);
});
