import assert from 'node:assert/strict';
import test from 'node:test';

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://app.example.test/',
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;

/* The workspace agent is selected from intent by the server/model. The
   browser request builder must not expose a manual mode switch anymore. */
test('chat requests never carry a manual agent-mode flag', async () => {
  const { buildChatRequestBody } = await import('../src/chat/api.js');
  window.appMode = 'chat';

  assert.equal(buildChatRequestBody([{ role: 'user', content: 'hi' }], 100, 0.7).agentMode, undefined);
  const body = buildChatRequestBody([{ role: 'user', content: 'hi' }], 100, 0.7);
  assert.equal(body.agentMode, undefined);
  assert.equal(body.mode, 'chat');
});

test('chat requests carry the validated response speed preference', async () => {
  const { buildChatRequestBody } = await import('../src/chat/api.js');
  localStorage.setItem('socrates-response-speed', 'fast');
  assert.equal(buildChatRequestBody([{ role: 'user', content: 'hi' }], 100, 0.7).response_speed, 'fast');
  localStorage.setItem('socrates-response-speed', 'unexpected');
  assert.equal(buildChatRequestBody([{ role: 'user', content: 'hi' }], 100, 0.7).response_speed, 'standard');
});
