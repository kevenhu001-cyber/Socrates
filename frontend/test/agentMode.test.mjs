import assert from 'node:assert/strict';
import test from 'node:test';

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body>'
  + '<button id="agentModeBtn" hidden aria-pressed="false"></button>'
  + '</body></html>', { url: 'https://app.example.test/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;

const { initAgentMode, syncAgentModeUI, toggleAgentMode } = await import('../src/ui/agentMode.js');

function button() {
  return document.getElementById('agentModeBtn');
}

test.beforeEach(() => {
  window.state = {};
  localStorage.clear();
  const el = button();
  el.hidden = true;
  el.setAttribute('aria-pressed', 'false');
  delete el.dataset.active;
});

test('toggling flips the flag, the button state and the stored preference', () => {
  assert.equal(toggleAgentMode(), true);
  assert.equal(window.state.agentMode, true);
  assert.equal(button().getAttribute('aria-pressed'), 'true');
  assert.equal(button().dataset.active, '1');
  assert.equal(localStorage.getItem('socrates.agentMode'), '1');

  assert.equal(toggleAgentMode(), false);
  assert.equal(window.state.agentMode, false);
  assert.equal(button().getAttribute('aria-pressed'), 'false');
  assert.equal(localStorage.getItem('socrates.agentMode'), null);
});

test('the tooltip explains what the switch will do', () => {
  window.state.agentMode = false;
  syncAgentModeUI();
  assert.match(button().getAttribute('title'), /开启 Agent/);
  window.state.agentMode = true;
  syncAgentModeUI();
  assert.match(button().getAttribute('title'), /已开启 Agent/);
});

test('the switch stays hidden when the server reports no agent runtime', async () => {
  localStorage.setItem('socrates.agentMode', '1');
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ enabled: false }),
      text: async () => '{"enabled":false}',
    };
  };
  await initAgentMode();
  /* apiFetch rewrites /api/* to the /api/v2/* CDN-bypass prefix. */
  assert.ok(calls.some((url) => url.includes('/agent-runs/capabilities')), calls.join(','));
  assert.equal(button().hidden, true);
  /* A stale "on" preference must not silently request a disabled mode. */
  assert.equal(window.state.agentMode, false);
  assert.equal(localStorage.getItem('socrates.agentMode'), null);
});

test('the switch appears and restores its preference when the runtime is enabled', async () => {
  localStorage.setItem('socrates.agentMode', '1');
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({ enabled: true }),
    text: async () => '{"enabled":true}',
  });
  await initAgentMode();
  assert.equal(button().hidden, false);
  assert.equal(window.state.agentMode, true);
  assert.equal(button().getAttribute('aria-pressed'), 'true');
});

test('a capability failure leaves the switch hidden instead of guessing', async () => {
  globalThis.fetch = async () => { throw new Error('offline'); };
  await initAgentMode();
  assert.equal(button().hidden, true);
});

/* The switch only matters if it reaches the server, so assert the request
   builder copies it onto the chat payload. */
test('the request body carries agentMode only while the switch is on', async () => {
  const { buildChatRequestBody } = await import('../src/chat/api.js');
  window.appMode = 'chat';

  window.state = { agentMode: false };
  assert.equal(buildChatRequestBody([{ role: 'user', content: 'hi' }], 100, 0.7).agentMode, undefined);

  window.state = { agentMode: true };
  const body = buildChatRequestBody([{ role: 'user', content: 'hi' }], 100, 0.7);
  assert.equal(body.agentMode, true);
  assert.equal(body.mode, 'chat');
});
