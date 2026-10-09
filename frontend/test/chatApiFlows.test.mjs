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
  getActiveProvider: () => null,
  apiFetch: async () => ({ content: '' }),
};

const { callAPI, callAPIChat, buildChatRequestBody } = await import('../src/chat/api.js');
const { stateStore } = await import('../src/state/store.js');
const encoder = new TextEncoder();

function setProvider(provider) {
  window.getActiveProvider = () => provider;
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
  stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: null });
  stateStore.dispatch({ type: 'state/set', key: 'currentProjectId', value: null });
  stateStore.dispatch({ type: 'state/set', key: 'lastCallError', value: null });
  storage.delete('session:socrates-active-assistant');
  storage.delete('socrates-response-speed');
  window.appMode = 'chat';
  delete window.getCustomInstructionsString;
  delete window.isReasoningProvider;
  delete window.getReasoningEffort;
}

test('request body copies messages and includes session, project, assistant, and preference context', () => {
  clearContext();
  stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: 'session-7' });
  stateStore.dispatch({ type: 'state/set', key: 'currentProjectId', value: 'project-3' });
  sessionStorage.setItem('socrates-active-assistant', 'assistant-2');
  localStorage.setItem('socrates-response-speed', 'fast');
  window.appMode = 'tutor';
  window.getCustomInstructionsString = () => 'Prefer concise explanations.';
  window.isReasoningProvider = () => true;
  window.getReasoningEffort = () => 'high';
  const messages = [{ role: 'user', content: 'Explain recursion.' }];

  const body = buildChatRequestBody(messages, 600, 0.7);

  assert.equal(body.mode, 'tutor');
  assert.equal(body.response_speed, 'fast');
  assert.equal(body.sessionId, 'session-7');
  assert.equal(body.ragSessionId, 'session-7');
  assert.equal(body.projectId, 'project-3');
  assert.equal(body.assistantId, 'assistant-2');
  assert.equal(body.reasoning_effort, 'high');
  assert.deepEqual(body.messages[0], {
    role: 'system', content: '[User custom instructions]\nPrefer concise explanations.',
  });
  assert.deepEqual(messages, [{ role: 'user', content: 'Explain recursion.' }]);
  clearContext();
});

test('API facade routes custom providers and reports a missing provider', async () => {
  clearContext();
  let request;
  setProvider({ isBuiltIn: false });
  window.apiFetch = async (...args) => {
    request = args;
    return { content: 'custom answer' };
  };

  assert.equal(await callAPI([{ role: 'user', content: 'hi' }], 100, { maxRetries: 0 }), 'custom answer');
  assert.equal(request[0], '/api/chat');
  assert.deepEqual(request[1].body.messages, [{ role: 'user', content: 'hi' }]);

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
  window.apiFetch = async () => {
    requests += 1;
    throw Object.assign(new Error('quota reached'), {
      status: 429,
      code: 'MONTHLY_LIMIT',
      body: { message: 'Try again next month.' },
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
